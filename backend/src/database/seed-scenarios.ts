/**
 * Ghi chú test 13/10 — dữ liệu mẫu phải ĐỦ để test hết backlog và SÁT THỰC TẾ theo thời gian:
 *  1. "Lão hoá" dữ liệu: lịch mẫu sinh ở lần chạy trước (khi còn là tương lai, nên "đã xác nhận") mà nay đã qua ngày thì
 *     chốt như một ngày làm việc thật: ~84% hoàn tất (kèm phiếu thu đã đóng), ~5% không đến, ~11% huỷ — trước đây lịch hôm
 *     qua vẫn "đang mở" nên không chuyển được ca, số liệu doanh thu hụt.
 *  2. Bổ sung đúng các tình huống `npm run seed:check` báo thiếu: dịch vụ ngưng bán, dịch vụ mới chưa có thợ, nhóm dịch vụ
 *     trống, yêu cầu ca / xin nghỉ chờ duyệt, khách đã đủ 3 lịch mở, thợ ốm đột xuất ngày mai còn lịch (chuyển hàng loạt),
 *     lịch vừa làm xong chờ thanh toán, phiếu điều chỉnh.
 * Mọi bước đều TẤT ĐỊNH và chạy lại không nhân đôi (kiểm tra trước khi thêm). Chỉ dùng cho máy phát triển / trình diễn.
 */
import { Client } from 'pg';
import { hash32, LEGACY_CODE } from './seed-realistic';

const VN_TODAY = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Kết cục của một lịch đã qua (tất định theo mã lịch): tỉ lệ thực tế của một tiệm tóc / spa. */
export function outcomeOf(code: string): 'completed' | 'no_show' | 'cancelled' {
  const x = (hash32(`age|${code}`) % 1000) / 1000;
  return x < 0.84 ? 'completed' : x < 0.89 ? 'no_show' : 'cancelled';
}

const CANCEL_REASONS = ['Khách bận việc đột xuất, hẹn lại tuần sau', 'Khách báo ốm, xin huỷ', 'Trời mưa lớn, khách không đi được',
  'Khách đổi ý, chưa sắp xếp được thời gian'];

const invoiceCode = (date: string, key: string, salt = 0): string => {
  const h = hash32(`${key}|${salt}`);
  return `HD${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${[0, 1, 2, 3].map((i) => CODE_ALPHABET[Math.floor(h / 31 ** i) % 31]).join('')}`;
};

async function receptionId(client: Client): Promise<string | null> {
  const r = await client.query(`SELECT id FROM users WHERE role = 'receptionist' AND is_active ORDER BY created_at LIMIT 1`);
  return r.rows[0]?.id ?? null;
}

/** Phiếu thu đã đóng cho một lịch hoàn tất (giá theo bảng giá lúc đặt — appointment_services.price_snapshot). */
async function closeInvoice(client: Client, a: { id: string; code: string; customer_id: string; stylist_id: string; end_at: Date; date: string }, by: string | null): Promise<void> {
  const items = (await client.query(
    'SELECT service_id, name_snapshot, price_snapshot FROM appointment_services WHERE appointment_id = $1 ORDER BY position', [a.id])).rows;
  if (!items.length) return;
  const subtotal = items.reduce((s: number, i: { price_snapshot: string }) => s + Number(i.price_snapshot), 0);
  let code = invoiceCode(a.date, a.code);
  for (let salt = 1; salt < 6 && (await client.query('SELECT 1 FROM invoices WHERE code = $1', [code])).rowCount; salt += 1) code = invoiceCode(a.date, a.code, salt);
  const transfer = hash32(`pay|${a.code}`) % 100 < 45;
  const paidAt = new Date(a.end_at.getTime() + (3 + (hash32(`paid|${a.code}`) % 10)) * 60_000);
  const inv = await client.query(
    `INSERT INTO invoices (code, appointment_id, customer_id, stylist_id, subtotal, discount_amount, total, payment_method, transfer_note,
                           status, created_by, paid_at, closed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7, 'closed', $8, $9, $9, $10) RETURNING id`,
    [code, a.id, a.customer_id, a.stylist_id, subtotal, transfer ? 'transfer' : 'cash', transfer ? `CK ${a.code}` : null, by, paidAt, a.end_at]);
  for (const i of items) {
    await client.query(
      'INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total) VALUES ($1, $2, $3, $4, 1, $4)',
      [inv.rows[0].id, i.service_id, i.name_snapshot, i.price_snapshot]);
  }
}

/** 1. Lịch đã qua NGÀY mà vẫn đang mở → chốt kết cục như ngày làm việc thật. */
export async function ageStaleAppointments(client: Client): Promise<number> {
  const by = await receptionId(client);
  const stale = (await client.query(
    `SELECT a.id, a.code, a.customer_id, a.stylist_id, a.start_at, a.end_at,
            to_char(a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date
       FROM appointments a
      WHERE a.status IN ('pending', 'confirmed', 'arrived', 'in_progress')
        AND (a.end_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < ${VN_TODAY}
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)
      ORDER BY a.start_at`)).rows as { id: string; code: string; customer_id: string; stylist_id: string; start_at: Date; end_at: Date; date: string }[];
  for (const a of stale) {
    const out = outcomeOf(a.code);
    if (out === 'completed') {
      await client.query(
        `UPDATE appointments SET status = 'completed', confirmed_at = COALESCE(confirmed_at, start_at - interval '1 day'),
                arrived_at = COALESCE(arrived_at, start_at - interval '5 minutes'), checked_in_by = COALESCE(checked_in_by, $2),
                started_at = COALESCE(started_at, start_at), completed_at = end_at,
                actual_duration_minutes = total_duration_minutes WHERE id = $1`, [a.id, by]);
      await closeInvoice(client, a, by);
    } else if (out === 'no_show') {
      await client.query(
        `UPDATE appointments SET status = 'no_show', no_show_at = start_at + interval '30 minutes', no_show_by = $2 WHERE id = $1`, [a.id, by]);
    } else {
      await client.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = start_at - interval '3 hours', cancelled_by_label = 'Lễ tân',
                cancelled_by_user = $2, cancel_reason = $3 WHERE id = $1`,
        [a.id, by, CANCEL_REASONS[hash32(`why|${a.code}`) % CANCEL_REASONS.length]]);
    }
  }
  return stale.length;
}

/** 2. Các tình huống backlog còn thiếu. Trả về danh sách việc đã làm (để in báo cáo). */
export async function seedScenarios(client: Client): Promise<string[]> {
  const done: string[] = [];
  const by = await receptionId(client);
  const one = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0];

  // S1-06: nhóm dịch vụ mới mở, chưa có dịch vụ (xoá được) — bên cạnh các nhóm đang bán (chặn xoá)
  const emptyCat = await client.query(
    `INSERT INTO service_categories (name, display_order)
     SELECT 'Chăm sóc mẹ bầu & sau sinh', 90 WHERE NOT EXISTS (SELECT 1 FROM service_categories WHERE name = 'Chăm sóc mẹ bầu & sau sinh')`);
  if (emptyCat.rowCount) done.push('Nhóm dịch vụ trống "Chăm sóc mẹ bầu & sau sinh" (S1-06)');

  // S1-05: dịch vụ đã ngưng bán (giữ lịch sử, ẩn khỏi trang khách) · S1-07: dịch vụ mới CHƯA có thợ (cảnh báo)
  const hairCat = await one(`SELECT id FROM service_categories WHERE name ILIKE '%Uốn%' ORDER BY display_order LIMIT 1`)
    ?? await one('SELECT id FROM service_categories ORDER BY display_order LIMIT 1');
  const washCat = await one(`SELECT id FROM service_categories WHERE name ILIKE '%Gội%' ORDER BY display_order LIMIT 1`) ?? hairCat;
  if (hairCat) {
    const off = await client.query(
      `INSERT INTO services (category_id, name, duration_minutes, price, description, is_active)
       SELECT $1, 'Uốn lạnh truyền thống', 120, 350000, 'Đã ngưng: thay bằng Uốn setting Digital Perm (giữ nếp lâu, ít hư tóc hơn).', FALSE
        WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Uốn lạnh truyền thống')`, [hairCat.id]);
    if (off.rowCount) done.push('Dịch vụ ngưng bán "Uốn lạnh truyền thống" (S1-05)');
  }
  if (washCat) {
    const fresh = await client.query(
      `INSERT INTO services (category_id, name, duration_minutes, price, description, is_active)
       SELECT $1, 'Gội đầu bồ kết – hương nhu', 45, 170000,
              'Dịch vụ mới: gội bằng nước bồ kết, hương nhu, vỏ bưởi nấu tại tiệm theo cách truyền thống. Đang đào tạo thợ.', TRUE
        WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'Gội đầu bồ kết – hương nhu')`, [washCat.id]);
    if (fresh.rowCount) done.push('Dịch vụ mới chưa có thợ "Gội đầu bồ kết – hương nhu" (S1-07)');
  }

  // S2-01: thợ tự đăng ký ca tuần sau + xin nghỉ — chờ chủ tiệm / lễ tân duyệt
  const pendingReq = Number((await one(`SELECT COUNT(*) AS n FROM shift_requests WHERE status = 'pending'`)).n);
  if (pendingReq < 2) {
    const team = (await client.query(
      `SELECT t.id FROM stylists t WHERE t.is_active AND t.user_id IS NOT NULL ORDER BY t.full_name LIMIT 2`)).rows;
    if (team[0]) {
      await client.query(
        `INSERT INTO shift_requests (stylist_id, kind, work_date, start_time, end_time, note, status)
         VALUES ($1, 'shift', ${VN_TODAY} + 9, '13:00', '20:00', 'Em làm thêm ca chiều để kịp khách đặt nhuộm cuối tuần', 'pending')`, [team[0].id]);
    }
    if (team[1]) {
      await client.query(
        `INSERT INTO shift_requests (stylist_id, kind, work_date, note, status)
         VALUES ($1, 'time_off', ${VN_TODAY} + 11, 'Em xin nghỉ về quê dự đám cưới em gái', 'pending')`, [team[1].id]);
    }
    done.push('2 yêu cầu chờ duyệt: đăng ký ca chiều + xin nghỉ về quê (S2-01)');
  }

  // S2-07: một khách quen đã giữ đủ 3 lịch chưa hoàn tất → đặt lịch thứ 4 bằng SĐT này phải bị chặn
  const full = Number((await one(
    `SELECT COUNT(*) AS n FROM (SELECT customer_id FROM appointments WHERE status IN ('pending','confirmed') AND start_at > now()
       GROUP BY 1 HAVING COUNT(*) >= 3) x`)).n);
  if (!full) {
    const cust = await one(
      `SELECT c.id, c.full_name, c.phone FROM customers c
        WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id = c.id AND a.status IN ('pending','confirmed','arrived','in_progress'))
          AND c.total_visits >= 5 ORDER BY c.total_visits DESC, c.phone LIMIT 1`);
    // Không lấy lịch mẫu cũ của seed.sql: bước vệ sinh của seed chính rải lại lịch cũ dồn vào một khách (sẽ phá tình huống này)
    const picks = (await client.query(
      `SELECT DISTINCT ON ((a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) a.id FROM appointments a
        WHERE a.status = 'confirmed' AND a.start_at > now() + interval '2 days' AND a.source = 'online' AND NOT (${LEGACY_CODE})
        ORDER BY (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, a.start_at LIMIT 3`)).rows;
    if (cust && picks.length === 3) {
      await client.query('UPDATE appointments SET customer_id = $1 WHERE id = ANY($2::uuid[])', [cust.id, picks.map((p: { id: string }) => p.id)]);
      done.push(`Khách "${cust.full_name}" (${cust.phone}) giữ đủ 3 lịch mở — thử đặt lịch thứ 4 bằng SĐT này (S2-07)`);
    }
  }

  // S3-09: thợ ốm đột xuất NGÀY MAI trong khi đã có khách đặt → lễ tân dùng "Chuyển lịch hàng loạt"
  const sick = Number((await one(
    `SELECT COUNT(*) AS n FROM stylist_time_off o WHERE o.off_date = ${VN_TODAY} + 1
        AND EXISTS (SELECT 1 FROM appointments a WHERE a.stylist_id = o.stylist_id AND a.status IN ('pending','confirmed')
                     AND (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = o.off_date)`)).n);
  if (!sick) {
    const st = await one(
      `SELECT a.stylist_id, t.full_name, COUNT(*) AS n FROM appointments a JOIN stylists t ON t.id = a.stylist_id
        WHERE a.status IN ('pending','confirmed') AND (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${VN_TODAY} + 1
          AND NOT EXISTS (SELECT 1 FROM stylist_time_off o WHERE o.stylist_id = a.stylist_id AND o.off_date = ${VN_TODAY} + 1)
        GROUP BY 1, 2 HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC, t.full_name LIMIT 1`);
    if (st) {
      await client.query(
        `INSERT INTO stylist_time_off (stylist_id, off_date, reason) VALUES ($1, ${VN_TODAY} + 1, 'Sốt xuất huyết, bác sĩ cho nghỉ — cần chuyển khách')`,
        [st.stylist_id]);
      done.push(`Thợ ${st.full_name} nghỉ ốm ngày mai, còn ${st.n} lịch cần chuyển (S3-09)`);
    }
  }

  // S3-08: lịch HÔM NAY đang diễn ra (giờ bắt đầu ≤ bây giờ < giờ kết thúc) → thợ đang làm (theo dõi vượt 20′)
  const ongoing = await client.query(
    `UPDATE appointments SET status = 'in_progress', confirmed_at = COALESCE(confirmed_at, start_at - interval '1 day'),
            arrived_at = COALESCE(arrived_at, start_at - interval '5 minutes'), checked_in_by = COALESCE(checked_in_by, $1),
            started_at = COALESCE(started_at, start_at)
      WHERE status IN ('confirmed', 'arrived') AND start_at <= now() AND end_at > now()
        AND (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${VN_TODAY}`, [by]);
  if (ongoing.rowCount) done.push(`${ongoing.rowCount} lịch đang diễn ra chuyển sang "Đang làm" (S3-08)`);

  // S4-01: lịch HÔM NAY vừa làm xong, khách đang chờ thanh toán (chưa có phiếu)
  const waiting = Number((await one(
    `SELECT COUNT(*) AS n FROM appointments a WHERE a.status = 'completed' AND a.start_at > now() - interval '3 days'
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)`)).n);
  if (!waiting) {
    const todayDone = (await client.query(
      `SELECT a.id FROM appointments a WHERE a.status IN ('confirmed','arrived','in_progress') AND a.end_at < now()
          AND (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${VN_TODAY}
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.appointment_id = a.id)
        ORDER BY a.end_at DESC LIMIT 2`)).rows;
    for (const a of todayDone) {
      await client.query(
        `UPDATE appointments SET status = 'completed', arrived_at = COALESCE(arrived_at, start_at - interval '5 minutes'),
                checked_in_by = COALESCE(checked_in_by, $2), started_at = COALESCE(started_at, start_at), completed_at = end_at,
                actual_duration_minutes = total_duration_minutes WHERE id = $1`, [a.id, by]);
    }
    if (todayDone.length) done.push(`${todayDone.length} lịch hôm nay vừa xong, chờ lập phiếu thu (S4-01)`);
  }

  // S4-01: phiếu điều chỉnh — khách phản ánh màu nhuộm chưa đều, tiệm giảm 50.000 đ
  const adj = Number((await one('SELECT COUNT(*) AS n FROM invoices WHERE adjusts_invoice_id IS NOT NULL')).n);
  if (!adj) {
    const origin = await one(
      `SELECT i.* FROM invoices i WHERE i.status = 'closed' AND i.adjusts_invoice_id IS NULL AND i.voucher_id IS NULL
          AND i.subtotal >= 400000 AND i.closed_at BETWEEN now() - interval '10 days' AND now() - interval '2 days'
        ORDER BY i.closed_at DESC LIMIT 1`);
    if (origin) {
      const items = (await client.query('SELECT service_id, name, unit_price, quantity, line_total FROM invoice_items WHERE invoice_id = $1', [origin.id])).rows;
      const sub = Number(origin.subtotal);
      const date = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
      const created = await client.query(
        `INSERT INTO invoices (code, appointment_id, customer_id, stylist_id, subtotal, discount_amount, total, payment_method, transfer_note,
                               status, created_by, paid_at, closed_at, adjusts_invoice_id, adjust_reason)
         VALUES ($1, $2, $3, $4, $5, 50000, $6, $7, $8, 'closed', $9, now(), now(), $10,
                 'Khách phản ánh màu nhuộm chưa đều phần chân tóc — tiệm giảm 50.000 đ và hẹn dặm lại miễn phí') RETURNING id`,
        [invoiceCode(date, `adj|${origin.code}`), origin.appointment_id, origin.customer_id, origin.stylist_id, sub, sub - 50000,
          origin.payment_method, origin.transfer_note, by, origin.id]);
      for (const i of items) {
        await client.query('INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total) VALUES ($1, $2, $3, $4, $5, $6)',
          [created.rows[0].id, i.service_id, i.name, i.unit_price, i.quantity, i.line_total]);
      }
      await client.query(`UPDATE invoices SET status = 'adjusted' WHERE id = $1 AND status = 'closed'`, [origin.id]);
      done.push(`Phiếu điều chỉnh cho ${origin.code}: giảm 50.000 đ vì màu nhuộm chưa đều (S4-01)`);
    }
  }

  // Số liệu tổng hợp trên hồ sơ khách theo dữ liệu mới
  await client.query(`
    UPDATE customers c SET total_visits = COALESCE(t.visits, 0), no_show_count = COALESCE(t.no_shows, 0), total_appointments = COALESCE(t.total, 0)
      FROM (SELECT customer_id, COUNT(*) FILTER (WHERE status = 'completed') AS visits, COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
                   COUNT(*) AS total FROM appointments GROUP BY customer_id) t
     WHERE t.customer_id = c.id AND (c.total_visits, c.no_show_count, c.total_appointments) IS DISTINCT FROM (t.visits, t.no_shows, t.total)`);
  return done;
}

/** Chạy trọn lớp "đời thực": lão hoá dữ liệu cũ → (seed chính do nơi gọi chạy) → bổ sung tình huống backlog. */
export async function ageThenLog(client: Client, log: (m: string) => void = console.log): Promise<void> {
  const aged = await ageStaleAppointments(client);
  if (aged) log(`  Chốt ${aged} lịch đã qua ngày (hoàn tất kèm phiếu thu / không đến / huỷ) như ngày làm việc thật.`);
}

export async function scenariosThenLog(client: Client, log: (m: string) => void = console.log): Promise<void> {
  const done = await seedScenarios(client);
  for (const d of done) log(`  + ${d}`);
}
