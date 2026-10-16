import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, tomorrowISO } from './setup-app';

/**
 * S2-08 — "Kiểm thử bắn 20 yêu cầu đặt đồng thời vào một khung giờ chỉ có đúng
 * 1 yêu cầu thành công". Đây là bộ kiểm thử bắt buộc chạy trong CI mỗi lần đẩy mã.
 */
describe('Chống đặt trùng khi nhiều khách chốt cùng lúc (S2-08)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  }, 60000);

  afterAll(async () => { await app?.close(); });

  it('20 yêu cầu đồng thời vào cùng khung giờ của cùng một thợ: đúng 1 thành công', async () => {
    const catalog = await request(server).get('/api/public/catalog').expect(200);
    const service = catalog.body.data
      .flatMap((g: { services: { id: string; durationMinutes: number }[] }) => g.services)
      // Fixture seed cố định; không chọn dịch vụ QA không có ca do suite khác tạo.
      .find((s: { id: string }) => s.id === '55555555-5555-4555-8555-000000000001');
    expect(service).toBeDefined();

    // Ca mẫu có ngày nghỉ theo tuần; không giả định ngày +6 luôn còn thợ rảnh.
    let date = '';
    let slot: { time: string; stylistIds: string[] } | undefined;
    for (let day = 6; day < 20 && !slot; day += 1) {
      date = tomorrowISO(day);
      const availability = await request(server)
        .get('/api/public/availability')
        .query({ date, serviceIds: service.id })
        .expect(200);
      slot = availability.body.data.slots.find(
        (s: { stylistIds: string[] }) => s.stylistIds.length > 0,
      );
    }
    expect(slot).toBeDefined();
    if (!slot) throw new Error('Không có khung giờ để kiểm thử đồng thời');
    const stylistId = slot.stylistIds[0];

    const runBase = Number(String(Date.now()).slice(-7));
    const requests = Array.from({ length: 20 }, (_, i) =>
      request(server).post('/api/public/bookings').send({
        serviceIds: [service.id],
        date,
        time: slot.time,
        stylistId,
        fullName: `Khach Dong Thoi ${i}`,
        // SĐT khác nhau giữa các lần chạy: lặp lại bộ kiểm thử trên cùng CSDL không chạm giới hạn 3 lịch/SĐT
        phone: `098${String((runBase + i) % 10_000_000).padStart(7, '0')}`,
      }),
    );

    const results = await Promise.all(requests);
    const ok = results.filter((r) => r.status === 201 || r.status === 200);
    const rejected = results.filter((r) => r.status !== 201 && r.status !== 200);

    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('Khung giờ vừa có người đặt, vui lòng chọn khung giờ khác');
    }

    // Khung giờ đó biến mất khỏi danh sách của thợ vừa nhận lịch
    const after = await request(server)
      .get('/api/public/availability')
      .query({ date, serviceIds: service.id, stylistId })
      .expect(200);
    expect(after.body.data.slots.map((s: { time: string }) => s.time)).not.toContain(slot.time);
  }, 120000);

  it('Ràng buộc EXCLUDE ở tầng CSDL chặn cả khi ghi thẳng vào bảng', async () => {
    const { DataSource } = await import('typeorm');
    const ds = app.get(DataSource);
    const [appt] = await ds.query(
      `SELECT id, stylist_id, start_at, end_at, customer_id FROM appointments
        WHERE status IN ('pending','confirmed') ORDER BY start_at DESC LIMIT 1`,
    );
    expect(appt).toBeDefined();

    await expect(
      ds.query(
        `INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at,
                                   total_duration_minutes, status, source)
         VALUES ('DUPTEST1', $1, $2, $3, $4, 30, 'confirmed', 'online')`,
        [appt.customer_id, appt.stylist_id, appt.start_at, appt.end_at],
      ),
    ).rejects.toThrow(/appointments_no_overlap|exclusion/i);
  }, 60000);

  it('mốc sớm nhất còn đặt được: hôm nay trả số phút (đã cộng thời gian đặt trước), ngày khác trả null', async () => {
    const serviceId = '55555555-5555-4555-8555-000000000001';
    const now = new Date(); // setup-app đặt TZ = giờ tiệm
    const pad = (n: number): string => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const res = await request(server).get('/api/public/availability').query({ date: today, serviceIds: serviceId }).expect(200);
    const earliest = res.body.data.earliestStartMinutes as number;
    expect(typeof earliest).toBe('number');
    expect(earliest).toBeGreaterThanOrEqual(nowMinutes);
    for (const s of res.body.data.slots as { time: string }[]) {
      expect(Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3, 5))).toBeGreaterThanOrEqual(earliest);
    }
    const later = await request(server).get('/api/public/availability').query({ date: tomorrowISO(3), serviceIds: serviceId }).expect(200);
    expect(later.body.data.earliestStartMinutes).toBeNull();
  });
});
