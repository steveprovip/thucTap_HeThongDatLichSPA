import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';
import { fire, ipOf, summary } from './support/load';

/**
 * Yêu cầu PHI CHỨC NĂNG trong "3. Hệ thống đặt lịch Salon Spa.xlsx" (sheet 1 · Hiệu năng / Quy mô) đo trên máy chủ THẬT với
 * dữ liệu đúng quy mô tài liệu (trước đây chưa có kiểm thử tự động nào cho các con số này):
 *   - 20.000 bản ghi lịch hẹn tích luỹ, 5.000 hồ sơ khách, 10 thợ
 *   - khung giờ trống một ngày với 8 thợ và 120 lịch hẹn            < 800 ms   (NFR Hiệu năng, S2-05)
 *   - lịch ngày của lễ tân với 8 thợ (tài liệu: 60 lịch, ở đây 120)  < 2 giây  (S3-01)
 *   - tìm hồ sơ khách theo tên / SĐT với 5.000 hồ sơ                 < 1 giây  (S3-10)
 *   - báo cáo doanh thu một tháng, khớp 100% tổng phiếu đã đóng      < 3 giây  (S4-07, mục tiêu "khớp 100%")
 *   - 30 người dùng đồng thời trên trang công khai                    100% thành công (NFR Quy mô)
 * Dữ liệu khối lượng lớn nằm ở quá khứ xa (≈ 2 năm trước) và ngày tương lai xa với dịch vụ / thợ riêng của bài này,
 * nên không làm lệch số liệu các bộ kiểm thử khác.
 */
describe('NFR hiệu năng & quy mô theo tài liệu yêu cầu (dữ liệu 20.000 lịch hẹn)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let base = '';
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS) => ({ Authorization: `Bearer ${tokens[role]}` });
  const runId = Date.now().toString().slice(-6);
  let svc30 = '';
  let svc120 = '';
  let day = '';
  const stylistIds: string[] = [];
  const timed = async <T>(fn: () => Promise<T>): Promise<{ ms: number; res: T }> => {
    const t = performance.now();
    const res = await fn();
    return { ms: Math.round(performance.now() - t), res };
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
    for (const role of ['owner', 'receptionist'] as const) {
      tokens[role] = (await request(app.getHttpServer()).post('/api/auth/login').send(ACCOUNTS[role]).expect(200)).body.data.accessToken;
    }
    const server = app.getHttpServer();
    const categoryId = (await request(server).get('/api/service-categories').set(as('owner')).expect(200)).body.data[0].id;
    svc30 = (await request(server).post('/api/services').set(as('owner'))
      .send({ categoryId, name: `NFR Cắt ${runId}`, durationMinutes: 30, price: 200000 }).expect(201)).body.data.id;
    svc120 = (await request(server).post('/api/services').set(as('owner'))
      .send({ categoryId, name: `NFR Nhuộm ${runId}`, durationMinutes: 120, price: 650000 }).expect(201)).body.data.id;

    // Ngày mở cửa xa trong tương lai, không trùng ngày lễ
    let open = '';
    let close = '';
    for (let d = 160; d < 220 && !day; d += 1) {
      const cand = tomorrowISO(d);
      const dow = new Date(`${cand}T12:00:00+07:00`).getUTCDay();
      const [wh] = await ds.query(`SELECT to_char(open_time,'HH24:MI') AS o, to_char(close_time,'HH24:MI') AS c
                                     FROM salon_working_hours WHERE day_of_week = $1 AND NOT is_closed`, [dow]);
      const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [cand]);
      if (wh && !hol) { day = cand; open = wh.o; close = wh.c; }
    }
    expect(day).not.toBe('');

    // 10 thợ (tài liệu: tối đa 10 thợ), 8 thợ có ca kín ngày `day`
    for (let i = 0; i < 10; i += 1) {
      const [s] = await ds.query(`INSERT INTO stylists (full_name, gender, is_active) VALUES ($1, 'female', TRUE) RETURNING id`, [`NFR Thợ ${i} ${runId}`]);
      stylistIds.push(s.id);
      await ds.query('INSERT INTO stylist_services (stylist_id, service_id) VALUES ($1, $2), ($1, $3)', [s.id, svc30, svc120]);
    }
    for (const sid of stylistIds.slice(0, 8)) {
      await ds.query('INSERT INTO stylist_shifts (stylist_id, work_date, start_time, end_time) VALUES ($1, $2, $3, $4)', [sid, day, open, close]);
    }

    // 5.000 hồ sơ khách
    await ds.query(`INSERT INTO customers (full_name, phone, email)
      SELECT (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Vũ','Đặng','Bùi'])[1 + g % 8] || ' Thị NFR ' || g, '039' || lpad(g::text, 7, '0'), NULL
        FROM generate_series(1, 5000) g ON CONFLICT DO NOTHING`);

    // 120 lịch hẹn ngày `day` (15 lịch / thợ × 8 thợ, mỗi lịch 30 phút, cách đều trong giờ mở cửa)
    const openMin = Number(open.slice(0, 2)) * 60 + Number(open.slice(3, 5));
    const span = Number(close.slice(0, 2)) * 60 + Number(close.slice(3, 5)) - openMin;
    const step = Math.floor(span / 15);
    expect(step).toBeGreaterThanOrEqual(30);
    await ds.query(`
      INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at, total_duration_minutes, estimated_total, status, source)
      SELECT 'D' || lpad(to_hex(s.n * 100 + k), 7, '0'), c.id, s.id,
             ($1::date + make_interval(mins => $2 + k * $3)) AT TIME ZONE 'Asia/Ho_Chi_Minh',
             ($1::date + make_interval(mins => $2 + k * $3 + 30)) AT TIME ZONE 'Asia/Ho_Chi_Minh',
             30, 200000, 'confirmed', 'online'
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM stylists WHERE id = ANY($4::uuid[])) s
       CROSS JOIN generate_series(0, 14) k
       CROSS JOIN LATERAL (SELECT id FROM customers WHERE phone = '039' || lpad((s.n * 15 + k + 1)::text, 7, '0')) c`,
    [day, openMin, step, stylistIds.slice(0, 8)]);

    // 20.000 lịch hẹn lịch sử (≈ 2 năm trước), mỗi thợ một lịch / giờ — trạng thái hoàn tất
    await ds.query(`
      INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at, total_duration_minutes, estimated_total, status, source,
                                started_at, completed_at, actual_duration_minutes)
      SELECT 'H' || lpad(to_hex(g), 7, '0'),
             (SELECT id FROM customers WHERE phone = '039' || lpad((1 + g % 5000)::text, 7, '0')),
             ($1::uuid[])[1 + g % 10],
             t, t + interval '30 minutes', 30, 200000, 'completed', 'online', t, t + interval '30 minutes', 30
        FROM generate_series(1, 20000) g
       CROSS JOIN LATERAL (SELECT (date '${tomorrowISO(-760)}' + make_interval(hours => 8 + (g / 10) % 12, days => (g / 120))) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS t) x`,
    [stylistIds]);

    // Phiếu đã đóng cho các lượt trong một tháng của giai đoạn lịch sử (báo cáo doanh thu)
    await ds.query(`
      WITH a AS (SELECT id, customer_id, stylist_id, end_at FROM appointments WHERE code LIKE 'H%' AND stylist_id = ANY($1::uuid[])
                   AND start_at >= (date '${tomorrowISO(-700)}')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
                   AND start_at <  (date '${tomorrowISO(-670)}')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
           inv AS (
             INSERT INTO invoices (code, appointment_id, customer_id, stylist_id, subtotal, total, payment_method, status, paid_at, closed_at)
             SELECT 'NFR' || lpad(row_number() OVER (ORDER BY a.id)::text, 9, '0'), a.id, a.customer_id, a.stylist_id, 200000, 200000,
                    'cash', 'closed', a.end_at, a.end_at FROM a RETURNING id)
      INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total)
      SELECT inv.id, $2, 'NFR Cắt', 200000, 1, 200000 FROM inv`, [stylistIds, svc30]);
    await ds.query('ANALYZE appointments; ANALYZE customers; ANALYZE invoices; ANALYZE invoice_items');
  }, 180000);
  afterAll(async () => {
    // Dọn: dịch vụ / thợ riêng của bài này ngưng hoạt động để không lọt vào danh mục công khai của các bộ kiểm thử sau
    // (lịch hẹn / phiếu lịch sử được CSDL bảo vệ, nằm ở quá khứ xa nên không ảnh hưởng số liệu khác)
    if (ds && svc30) {
      await ds.query('UPDATE services SET is_active = FALSE WHERE id = ANY($1::uuid[])', [[svc30, svc120]]);
      await ds.query('UPDATE stylists SET is_active = FALSE WHERE id = ANY($1::uuid[])', [stylistIds]);
    }
    await app?.close();
  });

  it('quy mô dữ liệu đúng tài liệu', async () => {
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM appointments`);
    const [{ c }] = await ds.query(`SELECT count(*)::int AS c FROM customers`);
    const [{ d }] = await ds.query(`SELECT count(*)::int AS d FROM appointments WHERE stylist_id = ANY($1::uuid[])
                                     AND start_at::date >= $2::date - 1 AND start_at::date <= $2::date + 1 AND status = 'confirmed'`, [stylistIds, day]);
    console.log(`[nfr] dữ liệu: ${n} lịch hẹn, ${c} hồ sơ khách, ${d} lịch trong ngày ${day} của 8 thợ`);
    expect(n).toBeGreaterThanOrEqual(20000);
    expect(c).toBeGreaterThanOrEqual(5000);
    expect(d).toBe(120);
  });

  it('khung giờ trống một ngày (8 thợ, 120 lịch hẹn) < 800 ms', async () => {
    const url = `${base}/public/availability?date=${day}&serviceIds=${svc120}`;
    await fetch(url); // làm nóng
    const { ms, res } = await timed(() => fetch(url).then((r) => r.json() as Promise<{ data: unknown }>));
    console.log(`[nfr] GET /public/availability (8 thợ, 120 lịch): ${ms} ms`);
    expect(res.data).toBeDefined();
    expect(ms).toBeLessThan(800);
  });

  it('lịch ngày của lễ tân (8 thợ, 120 lịch) < 2 giây', async () => {
    const { ms, res } = await timed(() => request(app.getHttpServer()).get(`/api/appointments/timeline?date=${day}`).set(as('receptionist')));
    expect(res.status).toBe(200);
    const total = (res.body.data.columns as { appointments: unknown[] }[]).reduce((a, c) => a + c.appointments.length, 0);
    console.log(`[nfr] GET /appointments/timeline: ${ms} ms, ${total} lịch hẹn`);
    expect(total).toBeGreaterThanOrEqual(120);
    expect(ms).toBeLessThan(2000);
  });

  it('tìm hồ sơ khách theo tên / SĐT với 5.000 hồ sơ < 1 giây', async () => {
    for (const q of ['Phạm Thị NFR 42', 'pham thi nfr', '0390004242']) {
      const { ms, res } = await timed(() => request(app.getHttpServer()).get('/api/customers').query({ q }).set(as('receptionist')));
      console.log(`[nfr] GET /customers?q=${q}: ${ms} ms, ${res.body.data.total ?? res.body.data.items?.length} kết quả`);
      expect(res.status).toBe(200);
      expect(ms).toBeLessThan(1000);
    }
  });

  it('báo cáo doanh thu một tháng < 3 giây và khớp 100% tổng phiếu đã đóng', async () => {
    const from = tomorrowISO(-700);
    const to = tomorrowISO(-670);
    const { ms, res } = await timed(() => request(app.getHttpServer()).get('/api/analytics/revenue').query({ from, to }).set(as('owner')));
    expect(res.status).toBe(200);
    const [{ total, n }] = await ds.query(
      `SELECT COALESCE(sum(total), 0)::bigint AS total, count(*)::int AS n FROM invoices
        WHERE status = 'closed' AND closed_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
          AND closed_at < ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`, [from, to]);
    const byStylist = (res.body.data.byStylist as { revenue: number }[]).reduce((a, r) => a + Number(r.revenue), 0);
    const byService = (res.body.data.byService as { revenue: number }[]).reduce((a, r) => a + Number(r.revenue), 0);
    console.log(`[nfr] GET /analytics/revenue (1 tháng, ${n} phiếu): ${ms} ms · tổng phiếu ${total} · theo thợ ${byStylist} · theo dịch vụ ${byService}`);
    expect(n).toBeGreaterThan(1000);
    expect(byStylist).toBe(Number(total));
    expect(byService).toBe(Number(total));
    expect(ms).toBeLessThan(3000);
  });

  it('30 người dùng đồng thời trên trang công khai (danh mục + khung giờ): 100% thành công', async () => {
    const r = await fire(60, (i) => ({
      url: i % 2 ? `${base}/public/catalog` : `${base}/public/availability?date=${day}&serviceIds=${svc30}`, ip: ipOf(60000 + i),
    }), 30);
    console.log(summary('trang công khai · 30 người dùng đồng thời', r));
    expect(r.status).toEqual({ 200: 60 });
  });
});
