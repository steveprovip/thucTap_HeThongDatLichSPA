import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';
import { AppointmentsService } from '../src/modules/booking-engine/appointments.service';

/**
 * Vòng QA 11/10 + TASK v2.0 (Part 1/3/4/5) trên máy chủ THẬT:
 *  - Email: khách có email nhận thư ở CẢ BA luồng đặt / dời / huỷ (kể cả khách tự huỷ bằng mã); bật
 *    BOOKING_REQUIRE_EMAIL thì đặt online thiếu email bị chặn, tại quầy vẫn cho qua.
 *  - Tìm khách theo TÊN không còn trả về toàn bộ danh sách.
 *  - Bất biến thợ–dịch vụ: không bỏ được kỹ năng khi thợ còn lịch sắp tới cần kỹ năng đó.
 *  - Danh sách lịch hẹn: phân trang con trỏ (keyset) không trùng / không sót so với phân trang số trang.
 *  - Thông báo yêu cầu ca/nghỉ nêu rõ loại + ngày.
 *  - Trợ lý AI: chỉ Chủ tiệm / Lễ tân; không cấu hình mô hình vẫn trả lời bằng số liệu.
 */
describe('QA 11/10 — email, tìm khách, bất biến kỹ năng, phân trang con trỏ, trợ lý AI', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS) => ({ Authorization: `Bearer ${tokens[role]}` });
  const runId = Date.now().toString().slice(-6);
  let categoryId = '';
  let date = '';
  let open = '';

  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const setup = async (tag: string, extraServices = 0) => {
    const ids: string[] = [];
    for (let i = 0; i <= extraServices; i += 1) {
      const svc = await request(server).post('/api/services').set(as('owner'))
        .send({ categoryId, name: `QA1110 ${tag}${i} ${runId}`, durationMinutes: 30, price: 120000 }).expect(201);
      ids.push(svc.body.data.id as string);
    }
    const sty = await request(server).post('/api/stylists').set(as('owner'))
      .send({ fullName: `QA1110 ${tag} ${runId}`, gender: 'female', serviceIds: ids }).expect(201);
    const stylistId = sty.body.data.id as string;
    await request(server).post(`/api/stylists/${stylistId}/shifts`).set(as('owner'))
      .send({ shifts: [{ workDate: date, startTime: open, endTime: plus(open, 480) }] }).expect(201);
    return { serviceIds: ids, stylistId };
  };
  const mails = async (appointmentId: string): Promise<string[]> =>
    (await ds.query('SELECT kind FROM email_queue WHERE appointment_id = $1 ORDER BY created_at', [appointmentId]))
      .map((r: { kind: string }) => r.kind);

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    for (const role of ['owner', 'receptionist', 'stylist'] as const) {
      const r = await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200);
      tokens[role] = r.body.data.accessToken as string;
    }
    categoryId = (await request(server).get('/api/service-categories').set(as('owner')).expect(200)).body.data[0].id;
    // Ngày mở cửa đủ xa, không trùng ngày nghỉ lễ / bộ kiểm thử khác
    for (let d = 75; d < 120; d += 1) {
      const cand = tomorrowISO(d);
      const dow = new Date(`${cand}T12:00:00+07:00`).getUTCDay();
      const [wh] = await ds.query(
        `SELECT to_char(open_time, 'HH24:MI') AS open FROM salon_working_hours WHERE day_of_week = $1 AND NOT is_closed`, [dow]);
      const [hol] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [cand]);
      if (wh && !hol) { date = cand; open = wh.open; break; }
    }
    expect(date).not.toBe('');
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('email: đặt online → xác nhận; nhân viên dời → thư đổi lịch; nhân viên huỷ / khách tự huỷ → thư huỷ', async () => {
    const { serviceIds, stylistId } = await setup('MAIL');
    const book = (i: number, time: string) => request(server).post('/api/public/bookings')
      .send({ serviceIds, date, time, stylistId, fullName: 'Khách Thư', phone: `097${runId}${i}`.slice(0, 10), email: `mail${i}.${runId}@example.com` });

    const a = await book(1, plus(open, 60)).expect(201);
    const id = a.body.data.appointmentId as string;
    expect(await mails(id)).toEqual(['booking_confirmation']);
    await request(server).patch(`/api/appointments/${id}/reschedule`).set(as('receptionist'))
      .send({ date, time: plus(open, 120) }).expect(200);
    expect(await mails(id)).toContain('booking_changed');
    await request(server).patch(`/api/appointments/${id}/cancel`).set(as('receptionist')).send({ reason: 'Khách báo bận' }).expect(200);
    expect(await mails(id)).toContain('booking_cancelled');

    const b = await book(2, plus(open, 240)).expect(201);
    await request(server).post('/api/public/cancel').send({ code: b.body.data.code, reason: 'Đổi kế hoạch' }).expect(200);
    expect(await mails(b.body.data.appointmentId)).toEqual(['booking_confirmation', 'booking_cancelled']);
  }, 60000);

  it('BOOKING_REQUIRE_EMAIL: đặt online thiếu email → 400 field=email; salon-info báo cấu hình; tại quầy vẫn tạo được', async () => {
    const { serviceIds, stylistId } = await setup('REQ');
    const cfg = app.get(ConfigService);
    const realGet = cfg.get.bind(cfg);
    const spy = jest.spyOn(cfg, 'get').mockImplementation(((key: string) =>
      (key === 'business.requireBookingEmail' ? true : realGet(key))) as typeof cfg.get);
    try {
      const info = await request(server).get('/api/public/salon-info').expect(200);
      expect(info.body.data.booking).toEqual({ requireEmail: true });
      const res = await request(server).post('/api/public/bookings')
        .send({ serviceIds, date, time: plus(open, 60), stylistId, fullName: 'Không Email', phone: `096${runId}1`.slice(0, 10) }).expect(400);
      expect(res.body.field ?? res.body.error?.field).toBe('email');
      await request(server).post('/api/appointments/walk-in').set(as('receptionist'))
        .send({ serviceIds, date, time: plus(open, 60), stylistId, fullName: 'Khách quầy', phone: `096${runId}2`.slice(0, 10) }).expect(201);
    } finally {
      spy.mockRestore();
    }
  }, 60000);

  it('tìm khách theo TÊN chỉ trả khách khớp tên (trước đây phone LIKE "%%" khớp mọi khách)', async () => {
    const total = Number((await ds.query('SELECT count(*)::int AS n FROM customers'))[0].n);
    const res = await request(server).get('/api/customers').query({ q: 'Không-ai-tên-này-zzq' }).set(as('receptionist')).expect(200);
    expect(res.body.data.total).toBe(0);
    expect(total).toBeGreaterThan(0);
    const byPhone = await request(server).get('/api/customers').query({ q: '0901' }).set(as('receptionist')).expect(200);
    for (const c of byPhone.body.data.items as { phone: string }[]) expect(c.phone).toContain('0901');
  });

  it('sửa / xoá dữ liệu khách: sửa tên + xoá email; khách có lịch → ẩn danh (giữ lịch & doanh thu); hồ sơ trống → xoá hẳn; xem hồ sơ được ghi nhật ký', async () => {
    const { serviceIds, stylistId } = await setup('GDPR');
    const walk = await request(server).post('/api/appointments/walk-in').set(as('receptionist'))
      .send({ serviceIds, date, time: plus(open, 300), stylistId, fullName: 'Khách Riêng Tư', phone: `092${runId}7`.slice(0, 10), email: `rieng.${runId}@example.com`, note: 'dị ứng' })
      .expect(201);
    const [used] = await ds.query('SELECT customer_id AS id FROM appointments WHERE id = $1', [walk.body.data.appointmentId]);
    await request(server).get(`/api/customers/${used.id}`).set(as('receptionist')).expect(200);
    let viewLog: unknown[] = [];
    for (let i = 0; i < 20 && !viewLog.length; i += 1) { // nhật ký ghi bất đồng bộ sau khi trả kết quả
      viewLog = await ds.query(`SELECT 1 FROM audit_logs WHERE action = 'view' AND entity_type = 'customer' AND entity_id = $1`, [used.id]);
      if (!viewLog.length) await new Promise((r) => setTimeout(r, 50));
    }
    expect(viewLog).toHaveLength(1);
    await request(server).delete(`/api/customers/${used.id}`).set(as('receptionist')).expect(403);
    const anon = await request(server).delete(`/api/customers/${used.id}`).set(as('owner')).expect(200);
    expect(anon.body.data.mode).toBe('anonymized');
    const [row] = await ds.query('SELECT full_name, phone, email, note FROM customers WHERE id = $1', [used.id]);
    expect(row).toMatchObject({ full_name: 'Khách đã xoá dữ liệu', email: null, note: null });
    expect(row.phone).toMatch(/^00\d{8}$/);
    expect(await ds.query('SELECT 1 FROM appointments WHERE customer_id = $1', [used.id])).toHaveLength(1);
    expect(await ds.query('SELECT 1 FROM email_queue WHERE appointment_id = $1', [walk.body.data.appointmentId])).toHaveLength(0);
    const [fresh] = await ds.query(
      `INSERT INTO customers (full_name, phone, email) VALUES ('Tạo Nhầm', $1, 'nham@example.com') RETURNING id`, [`093${runId}9`.slice(0, 10)]);
    await request(server).patch(`/api/customers/${fresh.id}`).set(as('receptionist')).send({ fullName: '  ' }).expect(400);
    const upd = await request(server).patch(`/api/customers/${fresh.id}`).set(as('receptionist'))
      .send({ fullName: 'Tên Đúng', email: null }).expect(200);
    expect(upd.body.data).toMatchObject({ fullName: 'Tên Đúng', email: null });
    await request(server).delete(`/api/customers/${fresh.id}`).set(as('owner')).expect(200);
    expect(await ds.query('SELECT 1 FROM customers WHERE id = $1', [fresh.id])).toHaveLength(0);
  });

  it('bất biến thợ–dịch vụ: bỏ kỹ năng khi còn lịch sắp tới cần kỹ năng đó → 409 SKILL_IN_USE; bỏ kỹ năng không dùng → OK', async () => {
    const { serviceIds, stylistId } = await setup('SKILL', 1);
    const walk = await request(server).post('/api/appointments/walk-in').set(as('receptionist'))
      .send({ serviceIds: [serviceIds[0]], date, time: plus(open, 90), stylistId, fullName: 'Khách Kỹ Năng', phone: `095${runId}1`.slice(0, 10) })
      .expect(201);
    const blocked = await request(server).patch(`/api/stylists/${stylistId}`).set(as('owner')).send({ serviceIds: [serviceIds[1]] }).expect(409);
    expect(blocked.body.code ?? blocked.body.error?.code).toBe('SKILL_IN_USE');
    expect(JSON.stringify(blocked.body)).toContain(walk.body.data.code);
    await request(server).patch(`/api/stylists/${stylistId}`).set(as('owner')).send({ serviceIds: [serviceIds[0]] }).expect(200);
    // Cùng họ bất biến: ngưng hoạt động thợ còn lịch sắp tới → 409, chuyển / huỷ lịch xong mới ngưng được
    const off = await request(server).patch(`/api/stylists/${stylistId}`).set(as('owner')).send({ isActive: false }).expect(409);
    expect(off.body.code ?? off.body.error?.code).toBe('STYLIST_HAS_FUTURE_APPOINTMENTS');
    await request(server).patch(`/api/appointments/${walk.body.data.appointmentId}/cancel`).set(as('owner')).send({ reason: 'Thợ nghỉ việc' }).expect(200);
    await request(server).patch(`/api/stylists/${stylistId}`).set(as('owner')).send({ isActive: false }).expect(200);
  }, 60000);

  it('danh sách lịch hẹn: lật bằng con trỏ cho đúng các dòng như lật số trang, không trùng', async () => {
    const page1 = await request(server).get('/api/appointments').query({ limit: 7 }).set(as('owner')).expect(200);
    const page2 = await request(server).get('/api/appointments').query({ limit: 7, page: 2 }).set(as('owner')).expect(200);
    expect(page1.body.data.nextCursor).toEqual(expect.any(String));
    const viaCursor = await request(server).get('/api/appointments')
      .query({ limit: 7, cursor: page1.body.data.nextCursor }).set(as('owner')).expect(200);
    const ids = (r: request.Response) => (r.body.data.items as { id: string }[]).map((x) => x.id);
    expect(ids(viaCursor)).toEqual(ids(page2));
    expect(ids(viaCursor).some((x) => ids(page1).includes(x))).toBe(false);
    await request(server).get('/api/appointments').query({ cursor: 'rác' }).set(as('owner')).expect(400);
  });

  it('thông báo yêu cầu nghỉ của thợ nêu rõ loại + ngày cho chủ tiệm', async () => {
    const off = tomorrowISO(27); // trong hạn đăng ký trước (SHIFT_REQUEST_HORIZON_DAYS = 60)
    await request(server).post('/api/shift-requests').set(as('stylist'))
      .send({ items: [{ kind: 'time_off', workDate: off, note: 'Việc gia đình' }] }).expect(201);
    const [n] = await ds.query(
      `SELECT n.title, n.body FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE u.email = $1 AND n.type = 'shift_request_new' ORDER BY n.created_at DESC LIMIT 1`, [ACCOUNTS.owner.email]);
    expect(n.title).toContain('xin nghỉ 1 ngày');
    expect(n.body).toContain(`${off.slice(8)}/${off.slice(5, 7)}/${off.slice(0, 4)}: Nghỉ cả ngày — "Việc gia đình"`);
  });

  it('lịch đang làm vượt chuẩn > 20′ → cảnh báo NGAY cho lễ tân kèm lịch kế tiếp, chỉ một lần (không lặp khi Hoàn tất)', async () => {
    const { serviceIds, stylistId } = await setup('OVR');
    const mk = (i: number, time: string) => request(server).post('/api/appointments/walk-in').set(as('receptionist'))
      .send({ serviceIds, date, time, stylistId, fullName: `Khách Vượt ${i}`, phone: `094${runId}${i}`.slice(0, 10) }).expect(201);
    const first = await mk(1, plus(open, 60));
    const next = await mk(2, plus(open, 180));
    const id = first.body.data.appointmentId as string;
    await ds.query(`UPDATE appointments SET status = 'in_progress', started_at = now() - interval '55 minutes' WHERE id = $1`, [id]);
    const svc = app.get(AppointmentsService);
    expect(await svc.watchOverruns()).toBeGreaterThanOrEqual(1);
    const rows = await ds.query(`SELECT title, body FROM notifications WHERE appointment_id = $1 AND type = 'overrun_warning'`, [id]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].body).toContain(`Lịch kế tiếp ${next.body.data.code} lúc ${plus(open, 180)}`);
    await svc.watchOverruns();
    await request(server).patch(`/api/appointments/${id}/complete`).set(as('owner')).expect(200);
    const after = await ds.query(`SELECT count(*)::int AS n FROM notifications WHERE appointment_id = $1 AND type = 'overrun_warning'`, [id]);
    expect(after[0].n).toBe(rows.length);
  }, 60000);

  it('trợ lý AI: thợ bị chặn 403; lễ tân hỏi được, chưa cấu hình mô hình thì trả lời theo số liệu', async () => {
    await request(server).get('/api/assistant/insights').set(as('stylist')).expect(403);
    const ins = await request(server).get('/api/assistant/insights').set(as('receptionist')).expect(200);
    expect(ins.body.data).toMatchObject({ windowDays: 90, goldenHours: expect.any(Array), combos: expect.any(Array) });
    const gaps = await request(server).get('/api/assistant/shift-suggestions').query({ days: 3 }).set(as('owner')).expect(200);
    expect(gaps.body.data.gaps).toEqual(expect.any(Array));
    const chat = await request(server).post('/api/assistant/chat').set(as('receptionist')).send({ message: 'Giờ vàng là mấy giờ?' }).expect(200);
    expect(chat.body.data).toMatchObject({ intent: 'golden', source: 'rules' });
    expect(chat.body.data.answer.length).toBeGreaterThan(10);
    await request(server).post('/api/assistant/chat').set(as('receptionist')).send({ message: '' }).expect(400);
  }, 60000);
});
