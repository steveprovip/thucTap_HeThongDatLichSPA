import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';

/**
 * Hồi quy cho các lỗi QA đã sửa (QA-03, 06, 07, 08, 09, 14, 15, 17).
 * Chạy trên CSDL thật đã nạp schema.sql + seed.sql: `npm run test:e2e`.
 */
describe('Hồi quy lỗi QA (EP-01 → EP-03)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const token: Record<string, string> = {};
  const runId = Date.now().toString().slice(-7);
  const phone = (prefix: string, n: number): string => `${prefix}${String((Number(runId) + n) % 10_000_000).padStart(7, '0')}`;

  interface Slot { time: string; stylistIds: string[] }
  interface PublicService { id: string; durationMinutes: number }

  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
    return res.body.data.accessToken as string;
  };
  const shortService = async (): Promise<PublicService> => {
    const catalog = await request(server).get('/api/public/catalog').expect(200);
    return catalog.body.data
      .flatMap((g: { services: PublicService[] }) => g.services)
      .find((s: PublicService) => s.durationMinutes <= 45);
  };
  const slotsOf = async (date: string, serviceId: string): Promise<Slot[]> => {
    const res = await request(server).get('/api/public/availability').query({ date, serviceIds: serviceId }).expect(200);
    return res.body.data.slots as Slot[];
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    token.admin = await login(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
    token.owner = await login(ACCOUNTS.owner.email, ACCOUNTS.owner.password);
  }, 60000);

  afterAll(async () => { await app?.close(); });

  it('QA-14: chọn đích danh thợ nhưng gửi giờ ngoài ca / lệch lưới 15 phút bị từ chối', async () => {
    const date = tomorrowISO(5);
    const service = await shortService();
    const slot = (await slotsOf(date, service.id)).find((s) => s.stylistIds.length > 0)!;
    const base = { serviceIds: [service.id], date, stylistId: slot.stylistIds[0], fullName: 'QA 14' };

    const night = await request(server).post('/api/public/bookings').send({ ...base, time: '03:00', phone: phone('094', 1) });
    expect(night.status).toBe(400);
    expect(night.body.message).toBe('Khung giờ không hợp lệ hoặc không còn trống');

    const offGrid = await request(server).post('/api/public/bookings').send({ ...base, time: '10:07', phone: phone('094', 2) });
    expect(offGrid.status).toBe(400);
  }, 60000);

  it('QA-15/QA-19: 20 khách "thợ bất kỳ" cùng giây -> phân lại sang thợ rảnh khác, không đặt trùng', async () => {
    // Tìm (dịch vụ, ngày, khung giờ) có ÍT NHẤT 2 thợ cùng rảnh
    const catalog = await request(server).get('/api/public/catalog').expect(200);
    const services: PublicService[] = catalog.body.data.flatMap((g: { services: PublicService[] }) => g.services);
    let pick: { service: PublicService; date: string; slot: Slot } | null = null;
    for (let d = 11; d <= 18 && !pick; d += 1) {
      for (const svc of services) {
        const best = (await slotsOf(tomorrowISO(d), svc.id)).sort((a, b) => b.stylistIds.length - a.stylistIds.length)[0];
        if (best && best.stylistIds.length >= 2) { pick = { service: svc, date: tomorrowISO(d), slot: best }; break; }
      }
    }
    expect(pick).not.toBeNull();
    const { service, date, slot } = pick!;

    // /public/stylists phải trả đủ họ tên (trước đây undefined do đọc cột snake_case)
    const named = await request(server).get('/api/public/stylists').query({ serviceIds: service.id }).expect(200);
    for (const s of named.body.data) expect(typeof s.fullName).toBe('string');

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      request(server).post('/api/public/bookings').send({
        serviceIds: [service.id], date, time: slot.time, fullName: `QA 15 - ${i}`, phone: phone('093', i),
      })));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);

    // Trước khi sửa: cả 20 cùng chọn MỘT thợ ít lịch nhất -> chỉ 1 lịch thành công dù còn thợ rảnh
    expect(ok.length).toBeGreaterThanOrEqual(2);
    expect(ok.length).toBeLessThanOrEqual(slot.stylistIds.length);
    const stylists = ok.map((r) => r.body.data.stylistName);
    expect(new Set(stylists).size).toBe(ok.length); // mỗi thợ đúng 1 lịch ở khung giờ này
    for (const r of rejected) expect(r.status).toBe(409);
  }, 120000);

  it('QA-17: cùng một SĐT gửi song song không vượt quá 3 lịch chưa hoàn tất', async () => {
    const p = phone('096', 0).replace(/^096/, '097');
    const service = await shortService();
    const first = (await slotsOf(tomorrowISO(9), service.id)).find((s) => s.stylistIds.length > 0)!;
    await request(server).post('/api/public/bookings')
      .send({ serviceIds: [service.id], date: tomorrowISO(9), time: first.time, fullName: 'QA 17', phone: p }).expect(201);

    // 5 cặp (thợ, giờ) không chồng lấn nhau trong cùng một ngày
    const date = tomorrowISO(10);
    const picks: { stylistId: string; time: string }[] = [];
    const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    for (const s of await slotsOf(date, service.id)) {
      for (const sid of s.stylistIds) {
        const clash = picks.some((x) => x.stylistId === sid && Math.abs(toMin(x.time) - toMin(s.time)) < service.durationMinutes);
        if (!clash && picks.length < 5) picks.push({ stylistId: sid, time: s.time });
      }
    }
    expect(picks).toHaveLength(5);

    const results = await Promise.all(picks.map((x) => request(server).post('/api/public/bookings').send({
      serviceIds: [service.id], date, time: x.time, stylistId: x.stylistId, fullName: 'QA 17', phone: p,
    })));
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(2);

    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM appointments a JOIN customers c ON c.id = a.customer_id
        WHERE c.phone = $1 AND a.status IN ('pending','confirmed','arrived','in_progress')`, [p]);
    expect(n).toBeLessThanOrEqual(3);

    // Đủ 3 lịch thì lượt tiếp theo bị từ chối kèm mã lỗi máy đọc được
    if (n === 3) {
      const extra = (await slotsOf(tomorrowISO(11), service.id)).find((s) => s.stylistIds.length > 0)!;
      const over = await request(server).post('/api/public/bookings')
        .send({ serviceIds: [service.id], date: tomorrowISO(11), time: extra.time, fullName: 'QA 17', phone: p });
      expect(over.status).toBe(400);
      expect(over.body.code).toBe('MAX_APPOINTMENTS_EXCEEDED');
    }
  }, 120000);

  it('QA-06: dịch vụ chỉ xuất hiện trên phiếu tính tiền cũng không xoá cứng được', async () => {
    const cats = await request(server).get('/api/service-categories').set('Authorization', `Bearer ${token.owner}`).expect(200);
    const created = await request(server).post('/api/services').set('Authorization', `Bearer ${token.owner}`)
      .send({ categoryId: cats.body.data[0].id, name: `QA06 dịch vụ ${runId}`, durationMinutes: 30, price: 100000 })
      .expect(201);
    const serviceId = created.body.data.id as string;
    await ds.query(
      `INSERT INTO invoice_items (invoice_id, service_id, name, unit_price, quantity, line_total)
       SELECT id, $1, 'QA06', 100000, 1, 100000 FROM invoices ORDER BY created_at LIMIT 1`, [serviceId]);

    const del = await request(server).delete(`/api/services/${serviceId}`).set('Authorization', `Bearer ${token.owner}`);
    expect(del.status).toBe(409);
    expect(del.body.message).toContain('phiếu tính tiền');

    await ds.query('DELETE FROM invoice_items WHERE service_id = $1', [serviceId]);
    await ds.query('DELETE FROM services WHERE id = $1', [serviceId]);
  }, 60000);

  describe('Ca làm (QA-07, QA-08, QA-09)', () => {
    let stylistId: string;
    let serviceId: string;
    const day = tomorrowISO(25);

    beforeAll(async () => {
      serviceId = (await shortService()).id;
      const res = await request(server).post('/api/stylists').set('Authorization', `Bearer ${token.owner}`)
        .send({ fullName: `QA Thợ ${runId}`, gender: 'female', phone: phone('035', 0), serviceIds: [serviceId] }).expect(201);
      stylistId = res.body.data.id;
    });

    afterAll(async () => {
      await ds.query(`UPDATE appointments SET status = 'cancelled' WHERE stylist_id = $1`, [stylistId]);
      await ds.query('UPDATE stylists SET is_active = FALSE WHERE id = $1', [stylistId]);
    });

    it('QA-07: thông báo chồng lấn nêu tên ca và khung giờ', async () => {
      const res = await request(server).post(`/api/stylists/${stylistId}/shifts`).set('Authorization', `Bearer ${token.owner}`)
        .send({ shifts: [
          { workDate: day, startTime: '09:00', endTime: '11:00', note: 'Ca sáng sớm' },
          { workDate: day, startTime: '10:00', endTime: '12:00' },
        ] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SHIFT_OVERLAP');
      expect(res.body.details.conflictWith).toMatchObject({ label: 'Ca sáng sớm', startTime: '09:00', endTime: '11:00' });
      expect(res.body.message).toContain('"Ca sáng sớm"');
      expect(res.body.message).toContain('09:00–11:00');
      expect(res.body.message).toContain('10:00–12:00');
    });

    it('QA-08: không xếp ca vào ngày nghỉ của tiệm', async () => {
      const holidayDay = tomorrowISO(26);
      const h = await request(server).post('/api/holidays').set('Authorization', `Bearer ${token.owner}`)
        .send({ startDate: holidayDay, endDate: holidayDay, reason: 'QA nghỉ đột xuất', force: true });
      expect([200, 201]).toContain(h.status);
      const res = await request(server).post(`/api/stylists/${stylistId}/shifts`).set('Authorization', `Bearer ${token.owner}`)
        .send({ shifts: [{ workDate: holidayDay, startTime: '09:00', endTime: '11:00' }] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SHIFT_OUTSIDE_OPERATING_HOURS');
      expect(res.body.message).toContain('QA nghỉ đột xuất');
      await request(server).delete(`/api/holidays/${h.body.data.id}`).set('Authorization', `Bearer ${token.owner}`).expect(200);
    });

    it('QA-09: xoá ca đang có lịch -> 409 + danh sách lịch hẹn có giờ HH:mm', async () => {
      const shift = await request(server).post(`/api/stylists/${stylistId}/shifts`).set('Authorization', `Bearer ${token.owner}`)
        .send({ shifts: [{ workDate: day, startTime: '13:00', endTime: '16:00' }] }).expect(201);
      const booked = await request(server).post('/api/public/bookings').send({
        serviceIds: [serviceId], date: day, time: '13:30', stylistId, fullName: 'QA 09', phone: phone('039', 9),
      }).expect(201);

      const res = await request(server).delete(`/api/shifts/${shift.body.data[0].id}`).set('Authorization', `Bearer ${token.owner}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SHIFT_HAS_APPOINTMENTS');
      expect(res.body.details.appointments[0]).toMatchObject({ code: booked.body.data.code, startTime: '13:30', customerName: 'QA 09' });
      expect(res.body.message).toContain(`${booked.body.data.code} (13:30–`);
    });
  });

  it('QA-03: hai admin ngưng hoạt động lẫn nhau cùng lúc -> hệ thống vẫn còn ít nhất một admin', async () => {
    const email = `qa03.${runId}@salon.vn`;
    const created = await request(server).post('/api/users').set('Authorization', `Bearer ${token.admin}`)
      .send({ fullName: 'QA Admin Hai', email, role: 'admin' }).expect(201);
    try {
      const temp = await login(email, created.body.data.tempPassword);
      await request(server).post('/api/auth/change-password').set('Authorization', `Bearer ${temp}`)
        .send({ currentPassword: created.body.data.tempPassword, newPassword: 'QaAdmin2026' }).expect(200);
      const second = await login(email, 'QaAdmin2026');
      const me = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${token.admin}`).expect(200);
      // Đúng 2 admin đang hoạt động: admin mẫu + admin vừa tạo
      await ds.query(`UPDATE users SET is_active = FALSE WHERE role = 'admin' AND email NOT IN ($1, $2)`, [ACCOUNTS.admin.email, email]);

      const [a, b] = await Promise.all([
        request(server).patch(`/api/users/${created.body.data.id}`).set('Authorization', `Bearer ${token.admin}`).send({ isActive: false }),
        request(server).patch(`/api/users/${me.body.data.id}`).set('Authorization', `Bearer ${second}`).send({ isActive: false }),
      ]);
      // Kiểu cũ: cả hai cùng đếm thấy 2 admin -> cả hai cùng 200 -> hệ thống không còn admin nào
      expect([a.status, b.status].sort()).toEqual([200, 400]);
      const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active`);
      expect(n).toBe(1);
    } finally {
      await ds.query(`UPDATE users SET is_active = TRUE WHERE email = $1`, [ACCOUNTS.admin.email]);
      await ds.query(`UPDATE users SET is_active = FALSE WHERE email = $1`, [email]);
    }
  }, 60000);
});
