import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';

/**
 * S3-07 — Nhập lịch cho khách vãng lai gọi điện hoặc đi ngang qua tiệm.
 * Mỗi nhóm test tương ứng một tiêu chí chấp nhận (AC) của ticket, chạy trên máy chủ thật.
 */
describe('S3-07 — lịch khách vãng lai tại quầy', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let token = '';
  let categoryId = '';
  const runId = Date.now().toString().slice(-7);
  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
  const phone = (n: number): string => `097${String((Number(runId) + n) % 10_000_000).padStart(7, '0')}`;

  interface Hours { open: string; close: string }
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const hoursOf = async (date: string): Promise<Hours | undefined> => {
    const dow = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    const [row] = await ds.query(
      `SELECT to_char(open_time, 'HH24:MI') AS open, to_char(close_time, 'HH24:MI') AS close
         FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
    return row as Hours | undefined;
  };
  /** Ngày mở cửa, không trùng ngày nghỉ lễ, đủ xa để không đụng các bộ test khác. */
  const openDay = async (start: number): Promise<{ date: string; hours: Hours }> => {
    for (let d = start; d < start + 40; d += 1) {
      const date = tomorrowISO(d);
      const [holiday] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      const hours = await hoursOf(date);
      if (!holiday && hours) return { date, hours };
    }
    throw new Error('Không tìm được ngày mở cửa');
  };
  const createService = async (name: string): Promise<string> => {
    const res = await request(server).post('/api/services').set(auth())
      .send({ categoryId, name: `${name} ${runId}`, durationMinutes: 30, price: 100000 }).expect(201);
    return res.body.data.id as string;
  };
  const createStylist = async (name: string, serviceIds: string[]): Promise<string> => {
    const res = await request(server).post('/api/stylists').set(auth())
      .send({ fullName: `${name} ${runId}`, gender: 'female', serviceIds }).expect(201);
    return res.body.data.id as string;
  };
  const addShift = (stylistId: string, workDate: string, startTime: string, endTime: string) =>
    request(server).post(`/api/stylists/${stylistId}/shifts`).set(auth()).send({ shifts: [{ workDate, startTime, endTime }] });
  const walkIn = (body: Record<string, unknown>) =>
    request(server).post('/api/appointments/walk-in').set(auth()).send(body);

  let serviceId = '';
  let otherServiceId = '';
  let stylistId = '';
  let day: { date: string; hours: Hours };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const login = await request(server).post('/api/auth/login')
      .send({ email: ACCOUNTS.owner.email, password: ACCOUNTS.owner.password }).expect(200);
    token = login.body.data.accessToken as string;
    const cats = await request(server).get('/api/service-categories').set(auth()).expect(200);
    categoryId = cats.body.data[0].id as string;

    serviceId = await createService('S307 DV chính');
    otherServiceId = await createService('S307 DV khác');
    // Thợ chỉ làm được serviceId — dùng để kiểm tra ràng buộc kỹ năng
    stylistId = await createStylist('S307 Thợ', [serviceId]);
    day = await openDay(150);
    await addShift(stylistId, day.date, day.hours.open, plus(day.hours.open, 360)).expect(201);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('AC5: lịch tạo tại quầy vào thẳng trạng thái Đã xác nhận và nguồn là walk_in', async () => {
    const res = await walkIn({
      serviceIds: [serviceId], date: day.date, time: day.hours.open, stylistId,
      fullName: 'Khách AC5', phone: phone(1),
    }).expect(201);
    expect(res.body.data.status).toBe('confirmed');

    const detail = await request(server).get(`/api/appointments/${res.body.data.appointmentId}`).set(auth()).expect(200);
    expect(detail.body.data).toMatchObject({ status: 'confirmed', source: 'walk_in' });
  }, 60000);

  it('AC2: gõ SĐT đã có -> trả hồ sơ + lịch sử gần nhất; SĐT mới -> found = false', async () => {
    const p = phone(2);
    const first = await walkIn({
      serviceIds: [serviceId], date: day.date, time: plus(day.hours.open, 60), stylistId,
      fullName: 'Khách quen AC2', phone: p,
    }).expect(201);

    const known = await request(server).get(`/api/customers/by-phone/${p}`).set(auth()).expect(200);
    expect(known.body.data.found).toBe(true);
    expect(known.body.data.customer.fullName).toBe('Khách quen AC2');
    expect(known.body.data.history.map((h: { appointmentId: string }) => h.appointmentId))
      .toContain(first.body.data.appointmentId);

    const unknown = await request(server).get(`/api/customers/by-phone/${phone(900)}`).set(auth()).expect(200);
    expect(unknown.body.data).toMatchObject({ found: false, customer: null, history: [] });
  }, 60000);

  it('AC4: vẫn chặn trùng lịch và thợ không đủ kỹ năng như đặt lịch online', async () => {
    const time = plus(day.hours.open, 120);
    await walkIn({ serviceIds: [serviceId], date: day.date, time, stylistId, fullName: 'Khách A', phone: phone(3) }).expect(201);

    // Cùng thợ, cùng giờ -> 409
    await walkIn({ serviceIds: [serviceId], date: day.date, time, stylistId, fullName: 'Khách B', phone: phone(4) }).expect(409);

    // Thợ chưa làm được dịch vụ -> bị từ chối (4xx), không tạo lịch
    const noSkill = await walkIn({
      serviceIds: [otherServiceId], date: day.date, time: plus(day.hours.open, 180), stylistId,
      fullName: 'Khách C', phone: phone(5),
    });
    expect(noSkill.status).toBeGreaterThanOrEqual(400);
    expect(noSkill.status).toBeLessThan(500);
    const rows = await ds.query(
      `SELECT 1 FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE c.phone = $1`, [phone(5)]);
    expect(rows).toHaveLength(0);
  }, 60000);

  it('AC1: thiếu tên, SĐT sai hoặc chưa chọn dịch vụ -> 400', async () => {
    const base = { serviceIds: [serviceId], date: day.date, time: day.hours.open, stylistId, fullName: 'Khách AC1', phone: phone(6) };
    await walkIn({ ...base, fullName: '' }).expect(400);
    await walkIn({ ...base, phone: '12345' }).expect(400);
    await walkIn({ ...base, serviceIds: [] }).expect(400);
  }, 60000);

  it('AC3: bỏ qua ràng buộc đặt trước 60 phút — online bị chặn, quầy tạo được cùng khung giờ', async () => {
    const today = tomorrowISO(0);
    const hours = await hoursOf(today);
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
    const nowMin = Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5));
    const slotMin = Math.ceil((nowMin + 5) / 15) * 15; // trong vòng 60 phút tới, bước 15 phút
    const slot = plus('00:00', slotMin);
    // Test phụ thuộc giờ thật: chỉ chạy khi tiệm đang mở và còn đủ chỗ cho dịch vụ 30 phút
    if (!hours || slot < hours.open || plus(slot, 30) > hours.close) return;

    const sid = await createStylist('S307 Thợ hôm nay', [serviceId]);
    const shift = await addShift(sid, today, hours.open, hours.close);
    if (shift.status !== 201) return;

    const body = { serviceIds: [serviceId], date: today, time: slot, stylistId: sid };
    const online = await request(server).post('/api/public/bookings')
      .send({ ...body, fullName: 'Khách online', phone: phone(7) });
    expect(online.status).toBe(400);

    const counter = await walkIn({ ...body, fullName: 'Khách quầy', phone: phone(8) });
    expect(counter.status).toBe(201);
    expect(counter.body.data.status).toBe('confirmed');
  }, 60000);
});
