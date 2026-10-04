import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';

/**
 * Vòng QA 04/10 (Sprint 2): khoá bằng kiểm thử các luật nghiệp vụ trên máy chủ THẬT.
 *  - QA-01 ca phải nằm trong giờ mở cửa, thông báo nêu rõ khung giờ hợp lệ (S2-01)
 *  - QA-03 danh mục công khai chỉ hiện dịch vụ đang bán VÀ có thợ đang làm đảm nhận (S2-03)
 *  - QA-04 tổng thời lượng vượt ca dài nhất trong 7 ngày -> cảnh báo tách hai lần hẹn (S2-04)
 *  - QA-06 tối đa 5 lượt đặt / IP / giờ -> 429 + Retry-After (S2-07)
 *  - QA-08 thợ chưa xếp ca trong ngày KHÔNG nhận lịch và không hiện là rảnh (S2-05)
 * QA-02 (xoá ca có lịch), QA-05 (3 lịch / SĐT), QA-07 (khoá tra cứu) đã có trong qa-regression / qa-lookup-rate-limit.
 */
describe('QA vòng 04/10 — luật nghiệp vụ Sprint 2 trên máy chủ thật', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let owner = '';
  let categoryId = '';
  const runId = Date.now().toString().slice(-7);
  const previousIpLimit = process.env.BOOKING_IP_LIMIT_PER_HOUR;
  const phone = (prefix: string, n: number): string => `${prefix}${String((Number(runId) + n) % 10_000_000).padStart(7, '0')}`;
  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${owner}` });

  interface Hours { open: string; close: string }
  /** Giờ mở/đóng cửa của đúng thứ trong tuần của `date` (theo bảng working_hours đã seed). */
  const hoursOf = async (date: string): Promise<Hours> => {
    const dow = new Date(`${date}T12:00:00+07:00`).getUTCDay();
    const [row] = await ds.query(
      `SELECT to_char(open_time, 'HH24:MI') AS open, to_char(close_time, 'HH24:MI') AS close
         FROM salon_working_hours WHERE day_of_week = $1 AND is_closed = FALSE`, [dow]);
    return row as Hours;
  };
  /** Ngày mở cửa, đủ xa để không đụng các bộ kiểm thử khác. */
  const openDay = async (start: number): Promise<string> => {
    for (let d = start; d < start + 14; d += 1) {
      const date = tomorrowISO(d);
      const [holiday] = await ds.query('SELECT 1 FROM salon_holidays WHERE $1::date BETWEEN start_date AND end_date', [date]);
      if (!holiday && (await hoursOf(date))) return date;
    }
    throw new Error('Không tìm được ngày mở cửa');
  };
  const plus = (time: string, minutes: number): string => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const createStylist = async (name: string, serviceIds: string[] = []): Promise<string> => {
    const res = await request(server).post('/api/stylists').set(auth())
      .send({ fullName: name, gender: 'female', serviceIds }).expect(201);
    return res.body.data.id as string;
  };
  const createService = async (name: string, durationMinutes: number, stylistIds: string[] = []): Promise<string> => {
    const res = await request(server).post('/api/services').set(auth())
      .send({ categoryId, name, durationMinutes, price: 100000, stylistIds }).expect(201);
    return res.body.data.id as string;
  };
  const addShift = async (stylistId: string, workDate: string, startTime: string, endTime: string) =>
    request(server).post(`/api/stylists/${stylistId}/shifts`).set(auth()).send({ shifts: [{ workDate, startTime, endTime }] });

  beforeAll(async () => {
    process.env.BOOKING_IP_LIMIT_PER_HOUR = '5';
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const login = await request(server).post('/api/auth/login')
      .send({ email: ACCOUNTS.owner.email, password: ACCOUNTS.owner.password }).expect(200);
    owner = login.body.data.accessToken as string;
    const cats = await request(server).get('/api/service-categories').set(auth()).expect(200);
    categoryId = cats.body.data[0].id as string;
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'booking_ip'`);
  }, 60000);

  afterAll(async () => {
    await ds?.query(`DELETE FROM rate_limits WHERE scope = 'booking_ip'`);
    if (previousIpLimit === undefined) delete process.env.BOOKING_IP_LIMIT_PER_HOUR;
    else process.env.BOOKING_IP_LIMIT_PER_HOUR = previousIpLimit;
    await app?.close();
  });

  it('Giới tính thợ: bắt buộc Nam/Nữ khi tạo, sửa được, hiện ở danh sách nội bộ, trang công khai và lịch ngày', async () => {
    const serviceId = await createService(`GT DV ${runId}`, 30);
    const missing = await request(server).post('/api/stylists').set(auth()).send({ fullName: `GT Thiếu ${runId}`, serviceIds: [serviceId] });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('Vui lòng chọn giới tính Nam hoặc Nữ');
    const invalid = await request(server).post('/api/stylists').set(auth())
      .send({ fullName: `GT Sai ${runId}`, gender: 'khac', serviceIds: [serviceId] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('Vui lòng chọn giới tính Nam hoặc Nữ');

    const created = await request(server).post('/api/stylists').set(auth())
      .send({ fullName: `GT Nam ${runId}`, gender: 'male', serviceIds: [serviceId] }).expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.gender).toBe('male');

    // Sửa hồ sơ không gửi gender thì giữ nguyên; gửi gender mới thì đổi
    const keep = await request(server).patch(`/api/stylists/${id}`).set(auth()).send({ bio: 'Giữ nguyên giới tính' }).expect(200);
    expect(keep.body.data.gender).toBe('male');
    const changed = await request(server).patch(`/api/stylists/${id}`).set(auth()).send({ gender: 'female' }).expect(200);
    expect(changed.body.data.gender).toBe('female');
    await request(server).patch(`/api/stylists/${id}`).set(auth()).send({ gender: 'khac' }).expect(400);

    const pub = await request(server).get('/api/public/stylists').query({ serviceIds: serviceId }).expect(200);
    expect(pub.body.data.find((s: { id: string }) => s.id === id)).toMatchObject({ gender: 'female' });
    const list = await request(server).get('/api/stylists').set(auth()).expect(200);
    expect(list.body.data.find((s: { id: string }) => s.id === id)).toMatchObject({ gender: 'female' });

    // 5 thợ mẫu đã được seed giới tính (3 nữ, 2 nam)
    const seeded = await ds.query(`SELECT gender, COUNT(*)::int AS n FROM stylists WHERE phone LIKE '090200000%' GROUP BY gender ORDER BY gender`);
    expect(seeded).toEqual([{ gender: 'female', n: 3 }, { gender: 'male', n: 2 }]);
  }, 60000);

  it('QA-01: ca vượt ngoài giờ mở cửa bị từ chối, thông báo nêu rõ khung giờ hợp lệ (cả thêm lẫn sửa ca)', async () => {
    const date = await openDay(33);
    const hours = await hoursOf(date);
    const stylistId = await createStylist(`QA01 Thợ ${runId}`);

    const early = await addShift(stylistId, date, '06:00', '12:00');
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('SHIFT_OUTSIDE_OPERATING_HOURS');
    expect(early.body.message).toBe(`Ca làm phải nằm trong giờ mở cửa của tiệm hôm đó (${hours.open} - ${hours.close})`);
    expect(early.body.details).toMatchObject({ workDate: date, openTime: hours.open, closeTime: hours.close });

    const late = await addShift(stylistId, date, '13:00', '23:00');
    expect(late.status).toBe(400);
    expect(late.body.code).toBe('SHIFT_OUTSIDE_OPERATING_HOURS');

    const ok = await addShift(stylistId, date, hours.open, '12:00');
    expect(ok.status).toBe(201);
    const widen = await request(server).patch(`/api/shifts/${ok.body.data[0].id}`).set(auth()).send({ startTime: '05:30' });
    expect(widen.status).toBe(400);
    expect(widen.body.code).toBe('SHIFT_OUTSIDE_OPERATING_HOURS');
  }, 60000);

  it('QA-03: danh mục công khai chỉ hiện dịch vụ đang bán VÀ có ít nhất một thợ đang làm việc đảm nhận', async () => {
    const name = `QA03 Combo ${runId}`;
    const serviceId = await createService(name, 60);
    const names = async (): Promise<string[]> => {
      const res = await request(server).get('/api/public/catalog').expect(200);
      return res.body.data.flatMap((g: { services: { name: string }[] }) => g.services.map((s) => s.name));
    };
    expect(await names()).not.toContain(name); // đang bán nhưng chưa có thợ -> ẩn

    const stylistId = await createStylist(`QA03 Thợ ${runId}`, [serviceId]);
    expect(await names()).toContain(name);

    await request(server).patch(`/api/stylists/${stylistId}`).set(auth()).send({ isActive: false }).expect(200);
    expect(await names()).not.toContain(name); // thợ duy nhất nghỉ việc -> ẩn lại

    await request(server).patch(`/api/stylists/${stylistId}`).set(auth()).send({ isActive: true }).expect(200);
    await request(server).patch(`/api/services/${serviceId}`).set(auth()).send({ isActive: false }).expect(200);
    expect(await names()).not.toContain(name); // ngừng bán -> ẩn
  }, 60000);

  it('QA-04: tổng thời lượng vượt ca dài nhất trong 7 ngày tới -> cảnh báo tách hai lần hẹn', async () => {
    const stylistId = await createStylist(`QA04 Thợ ${runId}`);
    // Ca dài nhất của thợ trong tuần: 4 giờ (mở cửa -> +4h) ở một ngày mở cửa bất kỳ trong 7 ngày tới
    let shiftDate = '';
    for (let d = 1; d <= 6 && !shiftDate; d += 1) {
      const date = tomorrowISO(d);
      const hours = await hoursOf(date);
      if (!hours) continue;
      const res = await addShift(stylistId, date, hours.open, plus(hours.open, 240));
      if (res.status === 201) shiftDate = date;
    }
    expect(shiftDate).not.toBe('');
    const longId = await createService(`QA04 Dài ${runId}`, 240, [stylistId]);
    const shortId = await createService(`QA04 Ngắn ${runId}`, 60, [stylistId]);
    const extraId = await createService(`QA04 Thêm ${runId}`, 15, [stylistId]);
    await request(server).patch(`/api/stylists/${stylistId}`).set(auth()).send({ serviceIds: [longId, shortId, extraId] }).expect(200);

    // 240 phút = vừa đúng ca 4 giờ -> chưa cảnh báo
    const fits = await request(server).post('/api/public/quote').send({ serviceIds: [longId] }).expect(200);
    expect(fits.body.data).toMatchObject({ longestShiftMinutes: 240, exceedsLongestShift: false });

    // 240 + 60 = 300 phút > ca dài nhất 240 phút -> cảnh báo
    const over = await request(server).post('/api/public/quote').send({ serviceIds: [longId, shortId] }).expect(200);
    expect(over.body.data).toMatchObject({ longestShiftMinutes: 240, exceedsLongestShift: true, warningCode: 'EXCEEDS_LONGEST_SHIFT' });
  }, 60000);

  it('QA-08: thợ chưa xếp ca trong ngày không hiện là rảnh và không nhận được lịch (chọn đích danh lẫn thợ bất kỳ)', async () => {
    const date = await openDay(40);
    const hours = await hoursOf(date);
    const serviceId = await createService(`QA08 DV ${runId}`, 30);
    const withShift = await createStylist(`QA08 Có ca ${runId}`, [serviceId]);
    const noShift = await createStylist(`QA08 Chưa ca ${runId}`, [serviceId]);
    expect((await addShift(withShift, date, hours.open, plus(hours.open, 360))).status).toBe(201);
    const time = plus(hours.open, 120);

    const slots = await request(server).get('/api/public/availability').query({ date, serviceIds: serviceId }).expect(200);
    const slot = (slots.body.data.slots as { time: string; stylistIds: string[] }[]).find((s) => s.time === time);
    expect(slot).toBeDefined();
    expect(slot!.stylistIds).toContain(withShift);
    for (const s of slots.body.data.slots as { stylistIds: string[] }[]) expect(s.stylistIds).not.toContain(noShift);

    const picked = await request(server).post('/api/public/bookings').send({
      serviceIds: [serviceId], date, time, stylistId: noShift, fullName: 'QA 08 Đích danh', phone: phone('095', 1),
    });
    expect(picked.status).toBe(400);
    expect(picked.body.message).toBe('Khung giờ không hợp lệ hoặc không còn trống');

    const any = await request(server).post('/api/public/bookings').send({
      serviceIds: [serviceId], date, time, fullName: 'QA 08 Bất kỳ', phone: phone('095', 2),
    }).expect(201);
    expect(any.body.data.stylistName).toBe(`QA08 Có ca ${runId}`);
  }, 60000);

  it('QA-06: quá 5 lượt đặt từ một IP trong một giờ -> 429 + Retry-After, thông báo tiếng Việt', async () => {
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'booking_ip'`);
    const [{ id: serviceId }] = await ds.query('SELECT id FROM services WHERE is_active = TRUE ORDER BY created_at LIMIT 1');
    const attempt = (n: number) => request(server).post('/api/public/bookings').send({
      serviceIds: [serviceId], date: tomorrowISO(50), time: '03:00', fullName: 'QA 06', phone: phone('096', n),
    });
    for (let i = 1; i <= 5; i += 1) expect((await attempt(i)).status).not.toBe(429);
    const blocked = await attempt(6);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toMatch(/quá nhiều|thử lại/i);
  }, 60000);
});
