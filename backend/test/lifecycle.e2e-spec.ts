import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, ACCOUNTS, tomorrowISO } from './setup-app';

/**
 * Kịch bản nghiệm thu Sprint 4: khách đặt → tiệm xác nhận → check-in →
 * thợ hoàn tất → lập phiếu → thanh toán → đóng phiếu → khách chấm 5 sao →
 * chủ tiệm thấy doanh thu cộng vào đúng thợ.
 */
describe('Luồng end-to-end từ đặt lịch tới đánh giá', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const token: Record<string, string> = {};

  const login = async (key: keyof typeof ACCOUNTS) => {
    const res = await request(server).post('/api/auth/login').send(ACCOUNTS[key]).expect(200);
    token[key] = res.body.data.accessToken;
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    for (const key of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) await login(key);
  }, 60000);

  afterAll(async () => { await app?.close(); });

  it('Chạy trọn vòng đời một lịch hẹn', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Lấy dịch vụ ngắn nhất để dễ xếp lịch
    const catalog = await request(server).get('/api/public/catalog').expect(200);
    const service = catalog.body.data
      .flatMap((g: { services: { id: string; durationMinutes: number }[] }) => g.services)
      .sort((a: { durationMinutes: number }, b: { durationMinutes: number }) =>
        a.durationMinutes - b.durationMinutes)[0];

    // 2. Khung giờ hôm nay (màn hình nội bộ bỏ qua ràng buộc đặt trước 60 phút)
    const av = await request(server)
      .get('/api/appointments/availability')
      .query({ date: today, serviceIds: service.id })
      .set('Authorization', `Bearer ${token.receptionist}`)
      .expect(200);

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const candidate = av.body.data.slots.find((s: { time: string; stylistIds: string[] }) => {
      const [h, m] = s.time.split(':').map(Number);
      const delta = h * 60 + m - nowMinutes;
      return delta > 1 && delta < 55 && s.stylistIds.length > 0;
    });
    if (!candidate) {
      // Ngoài giờ mở cửa hoặc đã kín — bỏ qua thay vì báo lỗi giả
      console.warn('Không có khung giờ gần hiện tại để chạy kịch bản check-in, bỏ qua bước này.');
      return;
    }

    // 3. Lễ tân tạo lịch tại quầy (vào thẳng Đã xác nhận)
    const created = await request(server)
      .post('/api/appointments/walk-in')
      .set('Authorization', `Bearer ${token.receptionist}`)
      .send({
        serviceIds: [service.id],
        date: today,
        time: candidate.time,
        stylistId: candidate.stylistIds[0],
        fullName: 'Khach Kiem Thu E2E',
        phone: '0988000111',
        email: 'e2e@example.com',
      })
      .expect(201);

    const apptId: string = created.body.data.appointmentId;
    const code: string = created.body.data.code;
    expect(code).toHaveLength(8);
    expect(created.body.data.status).toBe('confirmed');

    // 4. Check-in
    const checkedIn = await request(server)
      .patch(`/api/appointments/${apptId}/check-in`)
      .set('Authorization', `Bearer ${token.receptionist}`)
      .expect(200);
    expect(checkedIn.body.data.status).toBe('arrived');

    // 5. Thợ bắt đầu và hoàn tất — đăng nhập đúng thợ được gán
    const detail = await request(server)
      .get(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${token.receptionist}`)
      .expect(200);
    const stylistName: string = detail.body.data.stylist.fullName;

    const users = await request(server)
      .get('/api/users').query({ role: 'stylist', search: stylistName })
      .set('Authorization', `Bearer ${token.admin}`)
      .expect(200);
    const stylistUser = users.body.data.items[0];
    const stylistLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: stylistUser.email, password: 'Stylist@123' })
      .expect(200);
    const stylistToken = stylistLogin.body.data.accessToken;

    await request(server).patch(`/api/appointments/${apptId}/start`)
      .set('Authorization', `Bearer ${stylistToken}`).expect(200);

    // Thợ thấy số điện thoại đã che
    const stylistView = await request(server).get(`/api/appointments/${apptId}`)
      .set('Authorization', `Bearer ${stylistToken}`).expect(200);
    expect(stylistView.body.data.customer.phone).toBe('098***0111');
    expect(stylistView.body.data.customer.phoneMasked).toBe(true);

    await request(server).post(`/api/appointments/${apptId}/service-note`)
      .set('Authorization', `Bearer ${stylistToken}`)
      .send({ content: 'Ghi chú kỹ thuật kiểm thử tự động' }).expect(201);

    const completed = await request(server).patch(`/api/appointments/${apptId}/complete`)
      .set('Authorization', `Bearer ${stylistToken}`).expect(200);
    expect(completed.body.data.status).toBe('completed');

    // 6. Lập phiếu tính tiền
    const invoice = await request(server).post('/api/invoices')
      .set('Authorization', `Bearer ${token.receptionist}`)
      .send({ appointmentId: apptId }).expect(201);
    const invoiceId: string = invoice.body.data.id;
    expect(invoice.body.data.totalText).toMatch(/đ$/);

    // Chưa thanh toán thì KHÔNG đóng được
    const closeTooEarly = await request(server).patch(`/api/invoices/${invoiceId}/close`)
      .set('Authorization', `Bearer ${token.receptionist}`).send({});
    expect(closeTooEarly.status).toBe(400);

    // Chuyển khoản thiếu ghi chú đối soát thì bị chặn
    const payNoNote = await request(server).patch(`/api/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${token.receptionist}`).send({ paymentMethod: 'transfer' });
    expect(payNoNote.status).toBe(400);

    await request(server).patch(`/api/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${token.receptionist}`)
      .send({ paymentMethod: 'cash' }).expect(200);

    const closed = await request(server).patch(`/api/invoices/${invoiceId}/close`)
      .set('Authorization', `Bearer ${token.receptionist}`).send({}).expect(200);
    expect(closed.body.data.status).toBe('closed');

    // Phiếu đã đóng thì không sửa được
    const editClosed = await request(server).patch(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token.receptionist}`)
      .send({ items: [{ name: 'X', unitPrice: 1000, quantity: 1 }] });
    expect(editClosed.status).toBe(409);

    // 7. Khách mở biểu mẫu đánh giá bằng mã và chấm 5 sao
    const form = await request(server).get('/api/reviews/by-code').query({ code }).expect(200);
    const reviewToken: string = form.body.data.token;
    const submitted = await request(server).post(`/api/reviews/token/${reviewToken}`)
      .send({ rating: 5, comment: 'Kiểm thử tự động' }).expect(201);
    expect(submitted.body.data.rating).toBe(5);

    // Liên kết chỉ dùng được một lần
    const reuse = await request(server).post(`/api/reviews/token/${reviewToken}`).send({ rating: 1 });
    expect(reuse.status).toBe(400);

    // 8. Chủ tiệm thấy doanh thu cộng vào đúng thợ
    const report = await request(server).get('/api/analytics/revenue')
      .query({ from: today, to: today })
      .set('Authorization', `Bearer ${token.owner}`).expect(200);
    const row = report.body.data.byStylist.find(
      (r: { stylistName: string }) => r.stylistName === stylistName,
    );
    expect(row).toBeDefined();
    expect(row.revenue).toBeGreaterThan(0);

    // Tổng báo cáo khớp với tổng các dòng theo thợ
    const sum = report.body.data.byStylist.reduce(
      (acc: number, r: { revenue: number }) => acc + r.revenue, 0,
    );
    expect(sum).toBe(report.body.data.summary.total);

    // 9. Khách tra cứu bằng mã
    const lookup = await request(server).post('/api/public/lookup').send({ code }).expect(200);
    expect(lookup.body.data[0].statusLabel).toBe('Hoàn tất');
  }, 180000);

  it('Ràng buộc đặt lịch công khai: sát giờ, quá số dịch vụ, sai số điện thoại', async () => {
    const catalog = await request(server).get('/api/public/catalog').expect(200);
    const services = catalog.body.data.flatMap((g: { services: { id: string }[] }) => g.services);

    // Quá 5 dịch vụ
    const tooMany = await request(server).post('/api/public/bookings').send({
      serviceIds: services.slice(0, 6).map((s: { id: string }) => s.id),
      date: tomorrowISO(2), time: '10:00', fullName: 'A', phone: '0900000001',
    });
    expect(tooMany.status).toBe(400);

    // Sai định dạng số điện thoại
    const badPhone = await request(server).post('/api/public/bookings').send({
      serviceIds: [services[0].id], date: tomorrowISO(2), time: '10:00',
      fullName: 'A', phone: '12345',
    });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.message).toContain('10 chữ số');

    // Ngày trong quá khứ
    const past = await request(server).post('/api/public/bookings').send({
      serviceIds: [services[0].id], date: tomorrowISO(-3), time: '10:00',
      fullName: 'A', phone: '0900000002',
    });
    expect(past.status).toBe(400);
  }, 60000);
});
