import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, ACCOUNTS } from './setup-app';

/**
 * S1-01, S1-03, S4-10 — đối chiếu từng API với vai trò được phép.
 * Chạy được bộ này nghĩa là "không có trường hợp nào sai" trong bảng phân quyền.
 */
describe('Xác thực và phân quyền (S1-01, S1-03, S4-10)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    for (const [role, acc] of Object.entries(ACCOUNTS)) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(acc)
        .expect(200);
      tokens[role] = res.body.data.accessToken;
    }
  }, 60000);

  afterAll(async () => { await app?.close(); });

  it('Đăng nhập sai trả về thông báo chung, không tiết lộ email có tồn tại', async () => {
    const existing = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ACCOUNTS.owner.email, password: 'SaiMatKhau123' })
      .expect(401);
    const notExisting = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'khong-ton-tai@salon.vn', password: 'SaiMatKhau123' })
      .expect(401);

    expect(existing.body.message).toBe('Email hoặc mật khẩu không đúng');
    expect(notExisting.body.message).toBe(existing.body.message);
  });

  it('Không có token thì mọi API nội bộ trả về 401', async () => {
    await request(app.getHttpServer()).get('/api/appointments/pending').expect(401);
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('Trang công khai không cần đăng nhập', async () => {
    await request(app.getHttpServer()).get('/api/public/catalog').expect(200);
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  /** Bảng đối chiếu API ↔ vai trò. allow = kỳ vọng KHÔNG nhận 403. */
  const MATRIX: { method: 'get' | 'post' | 'patch' | 'put' | 'delete'; url: string; allow: string[] }[] = [
    { method: 'get', url: '/api/users', allow: ['admin', 'owner'] },
    { method: 'post', url: '/api/users', allow: ['admin'] },
    { method: 'get', url: '/api/audit-logs', allow: ['admin', 'owner'] },
    { method: 'get', url: '/api/services', allow: ['admin', 'owner', 'receptionist', 'stylist'] },
    { method: 'post', url: '/api/services', allow: ['owner'] },
    { method: 'put', url: '/api/working-hours', allow: ['owner'] },
    { method: 'get', url: '/api/stylists', allow: ['admin', 'owner', 'receptionist', 'stylist'] },
    { method: 'post', url: '/api/stylists', allow: ['owner'] },
    { method: 'get', url: '/api/appointments/pending', allow: ['receptionist', 'owner', 'admin'] },
    { method: 'post', url: '/api/appointments/walk-in', allow: ['receptionist', 'owner'] },
    { method: 'get', url: '/api/customers', allow: ['receptionist', 'owner', 'admin'] },
    { method: 'get', url: '/api/invoices', allow: ['receptionist', 'owner', 'admin'] },
    { method: 'post', url: '/api/invoices', allow: ['receptionist', 'owner'] },
    { method: 'get', url: '/api/analytics/revenue', allow: ['owner', 'admin', 'receptionist'] },
    { method: 'get', url: '/api/analytics/slot-density', allow: ['owner', 'admin'] },
    { method: 'get', url: '/api/reviews/stylist-ratings', allow: ['owner', 'admin'] },
    { method: 'get', url: '/api/notifications', allow: ['admin', 'owner', 'receptionist', 'stylist'] },
  ];

  it.each(MATRIX)('$method $url — chỉ $allow được phép', async ({ method, url, allow }) => {
    for (const role of Object.keys(ACCOUNTS)) {
      const res = await request(app.getHttpServer())[method](url)
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({});
      if (allow.includes(role)) {
        expect(res.status).not.toBe(403);
      } else {
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Bạn không có quyền thực hiện thao tác này');
      }
    }
  }, 60000);

  it('Khoá tài khoản 15 phút sau 5 lần sai mật khẩu liên tiếp', async () => {
    const email = 'stylist5@salon.vn';
    // Mở khoá trước để bộ kiểm thử chạy lại được nhiều lần
    const users = await request(app.getHttpServer())
      .get('/api/users').query({ search: email })
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const target = users.body.data.items[0];
    await request(app.getHttpServer())
      .post(`/api/users/${target.id}/unlock`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(201);

    let lastMessage = '';
    for (let i = 1; i <= 5; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login').send({ email, password: 'SaiMatKhau123' });
      lastMessage = res.body.message;
    }
    expect(lastMessage).toContain('bị khoá');
    expect(lastMessage).toContain('15 phút');

    // Đúng mật khẩu vẫn bị chặn khi đang khoá
    const blocked = await request(app.getHttpServer())
      .post('/api/auth/login').send({ email, password: 'Stylist@123' });
    expect(blocked.status).toBe(401);
    expect(blocked.body.message).toContain('bị khoá');

    // Dọn dẹp
    await request(app.getHttpServer())
      .post(`/api/users/${target.id}/unlock`)
      .set('Authorization', `Bearer ${tokens.admin}`);
  }, 60000);
});
