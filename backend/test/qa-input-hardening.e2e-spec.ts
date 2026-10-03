import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp, tomorrowISO } from './setup-app';

/**
 * Chặn đầu vào sai định dạng NGAY Ở LỚP DTO (400), không để lọt xuống CSDL thành lỗi 500:
 * QA-05 (mảng thợ của dịch vụ), QA-07/08 (giờ nghỉ giữa ca), QA-13 (dịch vụ trùng lặp),
 * QA-15 (chuyển lô), QA-14 (ngày không tồn tại trên lịch).
 * Chạy trên CSDL thật đã nạp schema.sql + seed.sql: `npm run test:e2e`.
 */
describe('QA — chặn đầu vào sai định dạng ở lớp DTO', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let owner = '';
  let receptionist = '';
  let serviceId = '';
  let categoryId = '';

  const BAD_UUID = 'khong-phai-uuid';
  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    owner = await login(ACCOUNTS.owner.email, ACCOUNTS.owner.password);
    receptionist = await login(ACCOUNTS.receptionist.email, ACCOUNTS.receptionist.password);
    [{ id: serviceId, category_id: categoryId }] = await ds.query(
      'SELECT id, category_id FROM services WHERE is_active = TRUE ORDER BY created_at LIMIT 1',
    );
  }, 60000);

  afterAll(async () => { await app?.close(); });

  it('QA-13: /public/availability từ chối dịch vụ trùng lặp (không nhân đôi thời lượng)', async () => {
    const res = await request(server)
      .get('/api/public/availability')
      .query({ date: tomorrowISO(3), serviceIds: `${serviceId},${serviceId}` });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Mỗi dịch vụ chỉ được chọn một lần');
  });

  it('QA-13: /public/stylists từ chối mã dịch vụ không phải UUID (trước đây rơi xuống CSDL -> 500)', async () => {
    const res = await request(server).get('/api/public/stylists').query({ serviceIds: BAD_UUID });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Mã dịch vụ không hợp lệ');
  });

  it('QA-13: /public/stylists vẫn nhận danh sách UUID hợp lệ phân tách bằng dấu phẩy', async () => {
    const res = await request(server).get('/api/public/stylists').query({ serviceIds: serviceId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('QA-14: ngày không tồn tại trên lịch (2099-02-31) bị từ chối bằng 400', async () => {
    const res = await request(server).post('/api/public/bookings').send({
      serviceIds: [serviceId], date: '2099-02-31', time: '10:00', fullName: 'QA Ngay Sai', phone: '0987000111',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Ngày hẹn không hợp lệ');
  });

  it('QA-05: tạo dịch vụ với stylistIds không phải UUID -> 400 (không phải 500)', async () => {
    const res = await request(server).post('/api/services').set('Authorization', `Bearer ${owner}`).send({
      categoryId, name: `QA dich vu ${Date.now()}`, durationMinutes: 30, price: 100000, stylistIds: [BAD_UUID],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Mã thợ không hợp lệ');
  });

  it('QA-05: sửa dịch vụ với stylistIds không phải mảng -> 400', async () => {
    const res = await request(server).patch(`/api/services/${serviceId}`).set('Authorization', `Bearer ${owner}`)
      .send({ stylistIds: 'abc' });
    expect(res.status).toBe(400);
  });

  it('QA-15: tạo/sửa thợ với serviceIds không phải UUID -> 400', async () => {
    const created = await request(server).post('/api/stylists').set('Authorization', `Bearer ${owner}`)
      .send({ fullName: 'Tho Kiem Thu', serviceIds: [BAD_UUID] });
    expect(created.status).toBe(400);
    expect(created.body.message).toBe('Mã dịch vụ không hợp lệ');

    const [{ id: stylistId }] = await ds.query('SELECT id FROM stylists ORDER BY created_at LIMIT 1');
    const updated = await request(server).patch(`/api/stylists/${stylistId}`).set('Authorization', `Bearer ${owner}`)
      .send({ serviceIds: [BAD_UUID] });
    expect(updated.status).toBe(400);
  });

  it('QA-07/QA-08: sửa ca với giờ nghỉ giữa ca sai định dạng -> 400', async () => {
    const [{ id: shiftId }] = await ds.query('SELECT id FROM stylist_shifts ORDER BY work_date DESC LIMIT 1');
    for (const body of [{ breakStart: '25:99', breakEnd: '26:00' }, { breakStart: 'abc' }, { breakEnd: 1230 }]) {
      const res = await request(server).patch(`/api/shifts/${shiftId}`).set('Authorization', `Bearer ${owner}`).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('QA-07: sửa ca vẫn cho phép xoá giờ nghỉ bằng null', async () => {
    const [{ id: shiftId }] = await ds.query(
      'SELECT id FROM stylist_shifts WHERE break_start IS NULL ORDER BY work_date DESC LIMIT 1',
    );
    const res = await request(server).patch(`/api/shifts/${shiftId}`).set('Authorization', `Bearer ${owner}`)
      .send({ breakStart: null, breakEnd: null });
    expect(res.status).toBe(200);
  });

  it('QA-08: tạo ca / khai báo nghỉ với ngày không tồn tại trên lịch (2099-02-31) -> 400', async () => {
    const [{ id: stylistId }] = await ds.query('SELECT id FROM stylists ORDER BY created_at LIMIT 1');
    const shift = await request(server).post(`/api/stylists/${stylistId}/shifts`).set('Authorization', `Bearer ${owner}`)
      .send({ shifts: [{ workDate: '2099-02-31', startTime: '09:00', endTime: '17:00' }] });
    expect(shift.status).toBe(400);
    expect(shift.body.message).toBe('Ngày làm việc không hợp lệ');

    const off = await request(server).post(`/api/stylists/${stylistId}/time-off`).set('Authorization', `Bearer ${owner}`)
      .send({ offDate: '2099-02-31' });
    expect(off.status).toBe(400);
    expect(off.body.message).toBe('Ngày nghỉ không hợp lệ');
  });

  it('QA-15: chuyển lô với phần tử sai kiểu / sai UUID -> 400 (không phải 500)', async () => {
    for (const items of [[null], [1], [{ appointmentId: BAD_UUID }], [{ appointmentId: serviceId, targetTime: '99:99' }]]) {
      const res = await request(server).post('/api/appointments/bulk-reassign')
        .set('Authorization', `Bearer ${receptionist}`).send({ items });
      expect(res.status).toBe(400);
    }
  });
});
