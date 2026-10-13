import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * Vòng QA 05/10 (Sprint 2) trên máy chủ THẬT:
 *  - Lỗi 1: số liệu khách (Lượt hoàn tất / Lượt không đến / Tổng lịch đã đặt) đều đếm từ bảng appointments
 *    và khớp nhau ở mọi màn hình (tra SĐT, hồ sơ, danh sách khách, chi tiết lịch hẹn).
 *  - Lỗi 2: ngày tiệm nghỉ cả ngày -> tạo lịch (tại quầy / online) và dời lịch bị chặn với thông báo nêu lý do.
 */
describe('QA vòng 05/10 — số liệu khách hàng và ngày nghỉ lễ trên máy chủ thật', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let owner = '';
  let categoryId = '';
  const runId = Date.now().toString().slice(-7);
  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${owner}` });
  const phone = (n: number): string => `098${String((Number(runId) + n) % 10_000_000).padStart(7, '0')}`;

  interface Hours { open: string; close: string }
  const hoursOf = async (date: string): Promise<Hours | undefined> => {
    const dow = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    const [row] = await ds.query(
      `SELECT to_char(open_time, 'HH24:MI') AS open, to_char(close_time, 'HH24:MI') AS close
         FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
    return row as Hours | undefined;
  };
  /**
   * Ngày mở cửa, không trùng ngày nghỉ lễ nào và TRỐNG HOÀN TOÀN (chưa có lịch hẹn / ca của bất kỳ ai).
   * Các bộ khác cũng chọn "ngày mở cửa đầu tiên từ +N" (vd. qa-1310-field-notes từ +110, invariants từ +70)
   * và để lại lịch hẹn; Jest đổi thứ tự tệp giữa các lần chạy -> chỉ chọn ngày trống để không phụ thuộc thứ tự.
   */
  const openDays = async (start: number, count: number): Promise<{ date: string; hours: Hours }[]> => {
    const found: { date: string; hours: Hours }[] = [];
    for (let d = start; d < start + 40 && found.length < count; d += 1) {
      const date = tomorrowISO(d);
      const [holiday] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      const [booked] = await ds.query(
        `SELECT 1 FROM appointments WHERE (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date LIMIT 1`, [date]);
      const [shift] = await ds.query('SELECT 1 FROM stylist_shifts WHERE work_date = $1::date LIMIT 1', [date]);
      const hours = await hoursOf(date);
      if (!holiday && !booked && !shift && hours) found.push({ date, hours });
    }
    if (found.length < count) throw new Error('Không tìm đủ ngày mở cửa');
    return found;
  };
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const setup = async (name: string): Promise<{ serviceId: string; stylistId: string }> => {
    const svc = await request(server).post('/api/services').set(auth())
      .send({ categoryId, name: `${name} DV ${runId}`, durationMinutes: 30, price: 100000 }).expect(201);
    const serviceId = svc.body.data.id as string;
    const sty = await request(server).post('/api/stylists').set(auth())
      .send({ fullName: `${name} Thợ ${runId}`, gender: 'female', serviceIds: [serviceId] }).expect(201);
    return { serviceId, stylistId: sty.body.data.id as string };
  };
  const addShift = (stylistId: string, workDate: string, startTime: string, endTime: string) =>
    request(server).post(`/api/stylists/${stylistId}/shifts`).set(auth()).send({ shifts: [{ workDate, startTime, endTime }] });
  const walkIn = (body: Record<string, unknown>) => request(server).post('/api/appointments/walk-in').set(auth()).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const login = await request(server).post('/api/auth/login')
      .send({ email: ACCOUNTS.owner.email, password: ACCOUNTS.owner.password }).expect(200);
    owner = login.body.data.accessToken as string;
    const cats = await request(server).get('/api/service-categories').set(auth()).expect(200);
    categoryId = cats.body.data[0].id as string;
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('Lỗi 1: Lượt hoàn tất / Lượt không đến / Tổng lịch đã đặt đếm từ bảng lịch hẹn và khớp ở mọi màn hình', async () => {
    const [{ date, hours }] = await openDays(60, 1);
    const { serviceId, stylistId } = await setup('SL');
    await addShift(stylistId, date, hours.open, plus(hours.open, 360)).then((r) => expect(r.status).toBe(201));
    const p = phone(1);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await walkIn({ serviceIds: [serviceId], date, time: plus(hours.open, i * 60), stylistId, fullName: 'Khách số liệu', phone: p });
      expect(res.status).toBe(201);
      ids.push(res.body.data.appointmentId as string);
      // Tạo lịch xong số liệu cập nhật ngay: Tổng lịch đã đặt tăng, chưa có lượt hoàn tất / không đến
      const look = await request(server).get(`/api/customers/by-phone/${p}`).set(auth()).expect(200);
      expect(look.body.data.customer).toMatchObject({ totalVisits: 0, noShowCount: 0, totalAppointments: i + 1, isNew: true });
    }

    // Lịch #1 đã hoàn tất, lịch #2 khách không đến (mô phỏng lịch sử), lịch #3 bị huỷ qua API -> máy chủ tính lại số liệu
    await ds.query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [ids[0]]);
    await ds.query(`UPDATE appointments SET status = 'no_show' WHERE id = $1`, [ids[1]]);
    await request(server).patch(`/api/appointments/${ids[2]}/cancel`).set(auth()).send({ reason: 'Khách báo bận việc đột xuất' }).expect(200);

    const expected = { totalVisits: 1, noShowCount: 1, totalAppointments: 3, isNew: false };
    const look = await request(server).get(`/api/customers/by-phone/${p}`).set(auth()).expect(200);
    expect(look.body.data.customer).toMatchObject(expected);
    const customerId = look.body.data.customer.id as string;
    const detail = await request(server).get(`/api/customers/${customerId}`).set(auth()).expect(200);
    expect(detail.body.data).toMatchObject(expected);
    const list = await request(server).get('/api/customers').query({ q: p }).set(auth()).expect(200);
    expect(list.body.data.items.find((c: { id: string }) => c.id === customerId)).toMatchObject(expected);
    const appt = await request(server).get(`/api/appointments/${ids[2]}`).set(auth()).expect(200);
    expect(appt.body.data.customer).toMatchObject({ totalVisits: 1, noShowCount: 1, totalAppointments: 3 });

    // Số liệu lưu trong CSDL = đếm trực tiếp từ bảng appointments
    const [row] = await ds.query(
      `SELECT c.total_visits, c.no_show_count, c.total_appointments,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS visits,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.customer_id = c.id AND a.status = 'no_show') AS no_shows,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.customer_id = c.id) AS total
         FROM customers c WHERE c.phone = $1`, [p]);
    expect([row.total_visits, row.no_show_count, row.total_appointments]).toEqual([row.visits, row.no_shows, row.total]);

    // Lịch sử trong chi tiết lịch hẹn: mới nhất trước, gồm cả lịch đang xem, số dòng khớp Tổng lịch đã đặt (≤ 10)
    const hist = await request(server).get(`/api/appointments/${ids[2]}/customer-history`).set(auth()).expect(200);
    expect(hist.body.data.isNewCustomer).toBe(false);
    expect(hist.body.data.history).toHaveLength(3);
    expect(hist.body.data.history.map((h: { appointmentId: string }) => h.appointmentId)).toEqual([ids[2], ids[1], ids[0]]);
  }, 60000);

  it('cảnh báo không lưu/log; xác nhận lưu PostgreSQL một lần và ẩn khung giờ ngày nghỉ', async () => {
    const [{ date, hours }] = await openDays(110, 1);
    const { serviceId, stylistId } = await setup('XN');
    await addShift(stylistId, date, hours.open, plus(hours.open, 360)).expect(201);
    const existing = await walkIn({ serviceIds: [serviceId], date, time: hours.open, stylistId,
      fullName: 'Khách trước ngày nghỉ', phone: phone(21) }).expect(201);
    const dto = { startDate: date, endDate: date, reason: `Lễ xác nhận QA ${runId}` };
    const audits = () => ds.query(
      `SELECT entity_id FROM audit_logs WHERE entity_type = 'salon_holiday' AND action = 'create' AND changes->>'reason' = $1`,
      [dto.reason],
    );
    const warning = await request(server).post('/api/holidays').set(auth()).send({ ...dto, force: false }).expect(201);
    expect(warning.body.data).toMatchObject({ affected: 1, codes: [existing.body.data.code], warning: expect.any(String) });
    await app.get(AuditService).beforeApplicationShutdown();
    expect(await ds.query('SELECT id FROM salon_holidays WHERE reason = $1', [dto.reason])).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
    const created = await request(server).post('/api/holidays').set(auth()).send({ ...dto, force: true }).expect(201);
    const holidayId = created.body.data.id as string;
    try {
      expect(await ds.query('SELECT id FROM salon_holidays WHERE reason = $1', [dto.reason])).toEqual([{ id: holidayId }]);
      await app.get(AuditService).beforeApplicationShutdown();
      expect(await audits()).toEqual([{ entity_id: holidayId }]);
      const available = await request(server).get('/api/public/availability')
        .query({ date, serviceIds: serviceId, stylistId }).expect(200);
      expect(available.body.data).toMatchObject({ salonClosed: true, closedReason: dto.reason, slots: [] });
      await walkIn({ serviceIds: [serviceId], date, time: plus(hours.open, 60), stylistId,
        fullName: 'Khách sau ngày nghỉ', phone: phone(22) }).expect(400)
        .then((res) => expect(res.body.code).toBe('SALON_CLOSED'));
    } finally {
      await request(server).delete(`/api/holidays/${holidayId}`).set(auth()).expect(200);
    }
  }, 60000);

  it('Lỗi 2: ngày nghỉ lễ — tạo lịch tại quầy / đặt online / dời lịch đều bị chặn kèm lý do, ngày thường vẫn chạy', async () => {
    const [holidayDay, normalDay, otherDay] = await openDays(70, 3);
    const { serviceId, stylistId } = await setup('NL');
    // Xếp ca TRƯỚC khi đặt ngày nghỉ (sau đó hệ thống không cho xếp ca vào ngày nghỉ) -> mô phỏng thợ đã có ca sẵn
    for (const d of [holidayDay, normalDay, otherDay]) {
      await addShift(stylistId, d.date, d.hours.open, plus(d.hours.open, 360)).then((r) => expect(r.status).toBe(201));
    }
    const reason = `Nghỉ Lễ QA ${runId}`;
    const created = await request(server).post('/api/holidays').set(auth())
      .send({ startDate: holidayDay.date, endDate: holidayDay.date, reason, force: true });
    expect([200, 201]).toContain(created.status);
    const holidayId = created.body.data.id as string;
    try {
      const timeline = await request(server).get('/api/appointments/timeline').query({ date: holidayDay.date }).set(auth()).expect(200);
      expect(timeline.body.data).toMatchObject({ salonClosed: true, closedReason: reason });

      const createMsg = `Tiệm nghỉ trong ngày này (${reason}). Không thể tạo lịch hẹn.`;
      const time = plus(holidayDay.hours.open, 60);
      const named = await walkIn({ serviceIds: [serviceId], date: holidayDay.date, time, stylistId, fullName: 'Khách ngày lễ', phone: phone(11) });
      expect(named.status).toBe(400);
      expect(named.body).toMatchObject({ message: createMsg, code: 'SALON_CLOSED', field: 'date' });
      expect(named.body.details).toMatchObject({ date: holidayDay.date, reason });
      const auto = await walkIn({ serviceIds: [serviceId], date: holidayDay.date, time, fullName: 'Khách ngày lễ', phone: phone(12) });
      expect(auto.status).toBe(400);
      expect(auto.body.message).toBe(createMsg);
      const online = await request(server).post('/api/public/bookings').send({
        serviceIds: [serviceId], date: holidayDay.date, time, stylistId, fullName: 'Khách ngày lễ', phone: phone(13),
      });
      expect(online.status).toBe(400);
      expect(online.body).toMatchObject({ message: createMsg, code: 'SALON_CLOSED' });
      const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM appointments WHERE start_at::date = $1::date AND stylist_id = $2`, [holidayDay.date, stylistId]);
      expect(n).toBe(0);

      // Dời lịch: ngày đích là ngày nghỉ lễ bị chặn, lịch giữ nguyên; dời sang ngày thường khác thì được
      const ok = await walkIn({ serviceIds: [serviceId], date: normalDay.date, time: plus(normalDay.hours.open, 30), stylistId, fullName: 'Khách dời lịch', phone: phone(14) });
      expect(ok.status).toBe(201);
      const apptId = ok.body.data.appointmentId as string;
      const blocked = await request(server).patch(`/api/appointments/${apptId}/reschedule`).set(auth())
        .send({ date: holidayDay.date, time });
      expect(blocked.status).toBe(400);
      expect(blocked.body).toMatchObject({
        message: `Tiệm nghỉ trong ngày này (${reason}). Không thể dời lịch hẹn vào ngày này.`, code: 'SALON_CLOSED',
      });
      const still = await request(server).get(`/api/appointments/${apptId}`).set(auth()).expect(200);
      expect(still.body.data.date).toBe(normalDay.date);
      const moved = await request(server).patch(`/api/appointments/${apptId}/reschedule`).set(auth())
        .send({ date: otherDay.date, time: plus(otherDay.hours.open, 30) });
      expect(moved.status).toBe(200);
      expect(moved.body.data.date).toBe(otherDay.date);
    } finally {
      await request(server).delete(`/api/holidays/${holidayId}`).set(auth());
    }
  }, 60000);
});
