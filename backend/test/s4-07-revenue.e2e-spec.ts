import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';

/**
 * [S4-07] Doanh thu theo thợ và theo dịch vụ trong khoảng ngày tự chọn (EP-06).
 * Kiểm thử nghiệm thu trên máy chủ thật:
 *  - Khoảng ngày: mặc định tháng hiện tại, tối đa 365 ngày, ngày kết thúc không trước ngày bắt đầu
 *  - Bảng theo thợ: số lượt hoàn tất, doanh thu thực thu, trung bình mỗi lượt
 *  - Bảng theo dịch vụ: số lượt và tổng tiền, sắp xếp giảm dần theo doanh thu
 *  - Chỉ tính phiếu đã đóng (không tính phiếu nháp, không tính phiếu ngoài khoảng ngày),
 *    tổng các bảng khớp tổng phiếu trong cùng khoảng ngày
 *  - CSV UTF-8 có BOM, chỉ chủ tiệm / quản trị được tải
 * Dữ liệu mẫu được chèn trực tiếp vào bảng phiếu trong MỘT NGÀY CÁCH ĐÂY 200 NGÀY để không lẫn với bộ kiểm thử khác.
 */
describe('S4-07 — báo cáo doanh thu theo thợ và theo dịch vụ', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let owner = '';
  let receptionist = '';
  let stylistToken = '';
  let categoryId = '';
  const runId = Date.now().toString().slice(-7);
  const as = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
  const phone = (n: number): string => `096${String((Number(runId) + n) % 10_000_000).padStart(7, '0')}`;

  // Ngày có phiếu mẫu và ngày nằm ngoài khoảng xem
  const reportDay = tomorrowISO(-200);
  const outsideDay = tomorrowISO(-203);

  interface Hours { open: string; close: string }
  const hoursOf = async (date: string): Promise<Hours | undefined> => {
    const dow = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    const [row] = await ds.query(
      `SELECT to_char(open_time, 'HH24:MI') AS open, to_char(close_time, 'HH24:MI') AS close
         FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
    return row as Hours | undefined;
  };
  const openDay = async (start: number): Promise<{ date: string; hours: Hours }> => {
    for (let d = start; d < start + 40; d += 1) {
      const date = tomorrowISO(d);
      const [holiday] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      const hours = await hoursOf(date);
      if (!holiday && hours) return { date, hours };
    }
    throw new Error('Không tìm được ngày mở cửa');
  };
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Dữ liệu mẫu dùng chung cho các test bên dưới
  const seeded = { stylistA: '', stylistB: '', nameA: '', nameB: '', serviceX: '', serviceY: '', nameX: '', nameY: '' };

  /** Chèn một phiếu cùng các dòng dịch vụ, trả về mã phiếu. */
  const insertInvoice = async (opts: {
    n: number; appointmentId: string; status: 'closed' | 'draft'; closedAt: string | null;
    items: { serviceId: string; name: string; price: number }[];
  }): Promise<void> => {
    const [appt] = await ds.query('SELECT customer_id, stylist_id FROM appointments WHERE id = $1', [opts.appointmentId]);
    const total = opts.items.reduce((sum, it) => sum + it.price, 0);
    const [inv] = await ds.query(
      `INSERT INTO invoices (code, appointment_id, customer_id, stylist_id, subtotal, discount_amount, total, status, closed_at)
       VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7) RETURNING id`,
      [`S407${runId}${opts.n}`, opts.appointmentId, appt.customer_id, appt.stylist_id, total, opts.status, opts.closedAt],
    );
    for (const it of opts.items) {
      await ds.query(
        `INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, 1, $4)`,
        [inv.id, it.serviceId, it.name, it.price],
      );
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const login = async (acc: { email: string; password: string }): Promise<string> =>
      (await request(server).post('/api/auth/login').send(acc).expect(200)).body.data.accessToken as string;
    owner = await login(ACCOUNTS.owner);
    receptionist = await login(ACCOUNTS.receptionist);
    stylistToken = await login(ACCOUNTS.stylist);
    const cats = await request(server).get('/api/service-categories').set(as(owner)).expect(200);
    categoryId = cats.body.data[0].id as string;

    // 2 dịch vụ + 2 thợ biết làm cả hai dịch vụ
    const mkService = async (name: string, price: number): Promise<{ id: string; name: string }> => {
      const res = await request(server).post('/api/services').set(as(owner))
        .send({ categoryId, name: `${name} ${runId}`, durationMinutes: 30, price }).expect(201);
      return { id: res.body.data.id as string, name: `${name} ${runId}` };
    };
    const svcX = await mkService('S407 Dịch vụ X', 200000);
    const svcY = await mkService('S407 Dịch vụ Y', 100000);
    const mkStylist = async (name: string): Promise<{ id: string; name: string }> => {
      const res = await request(server).post('/api/stylists').set(as(owner))
        .send({ fullName: `${name} ${runId}`, gender: 'female', serviceIds: [svcX.id, svcY.id] }).expect(201);
      return { id: res.body.data.id as string, name: `${name} ${runId}` };
    };
    const styA = await mkStylist('S407 Thợ A');
    const styB = await mkStylist('S407 Thợ B');
    Object.assign(seeded, {
      stylistA: styA.id, stylistB: styB.id, nameA: styA.name, nameB: styB.name,
      serviceX: svcX.id, serviceY: svcY.id, nameX: svcX.name, nameY: svcY.name,
    });

    // 5 lịch hẹn thật (mỗi phiếu gốc cần đúng một lịch hẹn): A 2 lịch, B 3 lịch
    const { date, hours } = await openDay(150);
    for (const sid of [styA.id, styB.id]) {
      await request(server).post(`/api/stylists/${sid}/shifts`).set(as(owner))
        .send({ shifts: [{ workDate: date, startTime: hours.open, endTime: plus(hours.open, 360) }] }).expect(201);
    }
    const book = async (stylistId: string, minutes: number, n: number): Promise<string> => {
      const res = await request(server).post('/api/appointments/walk-in').set(as(receptionist))
        .send({ serviceIds: [svcX.id], date, time: plus(hours.open, minutes), stylistId, fullName: `Khách S407 ${n}`, phone: phone(n) })
        .expect(201);
      return res.body.data.appointmentId as string;
    };
    const a1 = await book(styA.id, 0, 1);
    const a2 = await book(styA.id, 60, 2);
    const b1 = await book(styB.id, 0, 3);
    const b2 = await book(styB.id, 60, 4);
    const b3 = await book(styB.id, 120, 5);

    const inDay = `${reportDay}T12:00:00+07:00`;
    const X = { serviceId: svcX.id, name: svcX.name, price: 200000 };
    const Y = { serviceId: svcY.id, name: svcY.name, price: 100000 };
    // Trong khoảng, đã đóng: A = 200.000 + 300.000, B = 100.000
    await insertInvoice({ n: 1, appointmentId: a1, status: 'closed', closedAt: inDay, items: [X] });
    await insertInvoice({ n: 2, appointmentId: a2, status: 'closed', closedAt: inDay, items: [X, Y] });
    await insertInvoice({ n: 3, appointmentId: b1, status: 'closed', closedAt: inDay, items: [Y] });
    // Phiếu nháp (chưa đóng): không được tính
    await insertInvoice({ n: 4, appointmentId: b2, status: 'draft', closedAt: null, items: [{ ...Y, price: 999000 }] });
    // Phiếu đã đóng nhưng ngoài khoảng ngày xem: không được tính
    await insertInvoice({ n: 5, appointmentId: b3, status: 'closed', closedAt: `${outsideDay}T12:00:00+07:00`, items: [{ ...X, price: 500000 }] });
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  const revenue = (from: string, to: string) =>
    request(server).get('/api/analytics/revenue').query({ from, to }).set(as(owner));

  it('khoảng ngày: mặc định tháng hiện tại, tối đa 365 ngày, ngày kết thúc không trước ngày bắt đầu', async () => {
    const def = await request(server).get('/api/analytics/revenue').set(as(owner)).expect(200);
    expect(def.body.data.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(def.body.data.to >= def.body.data.from).toBe(true);

    await revenue(tomorrowISO(-30), tomorrowISO(0)).expect(200);

    const tooLong = await revenue(tomorrowISO(-400), tomorrowISO(0));
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(tooLong.body)).toContain('365 ngày');

    const reversed = await revenue(tomorrowISO(0), tomorrowISO(-5));
    expect(reversed.status).toBe(400);
  }, 60000);

  it('bảng theo thợ: số lượt hoàn tất, doanh thu thực thu, trung bình mỗi lượt; chỉ tính phiếu đã đóng trong khoảng', async () => {
    const res = await revenue(reportDay, reportDay).expect(200);
    const rows = (res.body.data.byStylist as { stylistId: string; completedCount: number; revenue: number; avgPerVisit: number }[])
      .filter((r) => [seeded.stylistA, seeded.stylistB].includes(r.stylistId));

    // Thợ A (500.000 / 2 lượt) đứng trước thợ B (100.000 / 1 lượt); phiếu nháp và phiếu ngoài khoảng không được tính
    expect(rows.map((r) => r.stylistId)).toEqual([seeded.stylistA, seeded.stylistB]);
    expect(rows[0]).toMatchObject({ completedCount: 2, revenue: 500000, avgPerVisit: 250000 });
    expect(rows[1]).toMatchObject({ completedCount: 1, revenue: 100000, avgPerVisit: 100000 });
  }, 60000);

  it('bảng theo dịch vụ: số lượt và tổng tiền, sắp xếp giảm dần theo doanh thu', async () => {
    const res = await revenue(reportDay, reportDay).expect(200);
    const all = res.body.data.byService as { serviceId: string; quantity: number; revenue: number }[];
    const rows = all.filter((r) => [seeded.serviceX, seeded.serviceY].includes(r.serviceId));

    expect(rows.map((r) => r.serviceId)).toEqual([seeded.serviceX, seeded.serviceY]);
    expect(rows[0]).toMatchObject({ quantity: 2, revenue: 400000 });
    expect(rows[1]).toMatchObject({ quantity: 2, revenue: 200000 });

    // Toàn bảng phải được sắp xếp giảm dần theo doanh thu
    const revenues = all.map((r) => r.revenue);
    expect(revenues).toEqual([...revenues].sort((a, b) => b - a));
  }, 60000);

  it('số liệu khớp 100%: tổng theo thợ = tổng theo dịch vụ = tổng phiếu đã đóng trong cùng khoảng ngày', async () => {
    const res = await revenue(reportDay, reportDay).expect(200);
    const { summary, byStylist, byService } = res.body.data as {
      summary: { invoiceCount: number; total: number };
      byStylist: { revenue: number; completedCount: number }[];
      byService: { revenue: number }[];
    };
    const sum = (list: { revenue: number }[]): number => list.reduce((s, r) => s + r.revenue, 0);

    expect(summary.total).toBe(sum(byStylist));
    expect(summary.total).toBe(sum(byService));
    expect(summary.invoiceCount).toBe(byStylist.reduce((s, r) => s + r.completedCount, 0));

    // Đối chiếu trực tiếp với bảng phiếu trong CSDL
    const [row] = await ds.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::bigint AS total
         FROM invoices
        WHERE status = 'closed'
          AND (closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date`, [reportDay]);
    expect(summary.invoiceCount).toBe(row.n);
    expect(summary.total).toBe(Number(row.total));
  }, 60000);

  it('xuất CSV: UTF-8 có BOM, đúng tiếng Việt, đúng thứ tự giảm dần; chỉ chủ tiệm / quản trị được tải', async () => {
    const csvOf = async (kind: 'stylists' | 'services') => {
      const res = await request(server).get(`/api/analytics/export/${kind}.csv`)
        .query({ from: reportDay, to: reportDay }).set(as(owner))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      return res;
    };

    const stylists = await csvOf('stylists');
    expect(stylists.status).toBe(200);
    expect(stylists.headers['content-type']).toContain('text/csv');
    expect(stylists.headers['content-type'].toLowerCase()).toContain('utf-8');
    const buf = stylists.body as Buffer;
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 để Excel mở đúng tiếng Việt
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    expect(text.split('\r\n')[0]).toBe('Thợ,Số lượt hoàn tất,Tổng doanh thu (đ),Trung bình mỗi lượt (đ)');
    expect(text.indexOf(seeded.nameA)).toBeGreaterThan(-1);
    expect(text.indexOf(seeded.nameA)).toBeLessThan(text.indexOf(seeded.nameB));

    const services = await csvOf('services');
    expect(services.status).toBe(200);
    const svcText = (services.body as Buffer).toString('utf8').replace(/^\uFEFF/, '');
    expect(svcText.split('\r\n')[0]).toBe('Dịch vụ,Số lượt,Tổng doanh thu (đ)');
    expect(svcText.indexOf(seeded.nameX)).toBeLessThan(svcText.indexOf(seeded.nameY));

    // Phân quyền: thợ không được tải tệp doanh thu
    await request(server).get('/api/analytics/export/stylists.csv')
      .query({ from: reportDay, to: reportDay }).set(as(stylistToken)).expect(403);
  }, 60000);
});
