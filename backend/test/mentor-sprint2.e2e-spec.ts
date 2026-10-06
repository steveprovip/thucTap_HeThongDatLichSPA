import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * Góp ý Mentor Sprint 2 (06/10/2026) trên máy chủ THẬT (PostgreSQL), mỗi mục một khối describe.
 * Dữ liệu tự tạo dùng năm/ngày ở xa để không ảnh hưởng các bộ kiểm thử khác chạy chung CSDL.
 */
describe('Mentor Sprint 2', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const as = (role: keyof typeof ACCOUNTS): { Authorization: string } => ({ Authorization: `Bearer ${tokens[role]}` });

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    for (const role of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
      const res = await request(server).post('/api/auth/login').send(ACCOUNTS[role]).expect(200);
      tokens[role] = res.body.data.accessToken as string;
    }
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  describe('Mục 5 — AI sinh ngày lễ cả năm', () => {
    const YEAR = 2099;
    afterAll(async () => {
      await ds.query(`DELETE FROM salon_holidays WHERE start_date >= '2099-01-01'`);
    });

    it('đề xuất đủ ngày lễ, đánh dấu ngày đang có lịch khách là conflict và KHÔNG tự tạo ngày đó', async () => {
      // Một lịch hẹn giả đúng ngày Quốc khánh 2099 để kiểm tra "không chèn lên lịch khách"
      const [stylist] = await ds.query('SELECT id FROM stylists WHERE is_active LIMIT 1');
      const [customer] = await ds.query('SELECT id FROM customers LIMIT 1');
      await ds.query(
        `INSERT INTO appointments (code, customer_id, stylist_id, start_at, end_at, total_duration_minutes, status, source)
         VALUES ('HOL2099X', $1, $2, '2099-09-02T02:00:00Z', '2099-09-02T02:30:00Z', 30, 'confirmed', 'online')`,
        [customer.id, stylist.id],
      );
      try {
        const res = await request(server).get(`/api/holidays/suggestions?year=${YEAR}`).set(as('owner')).expect(200);
        const list = res.body.data as { key: string; status: string; startDate: string; endDate: string }[];
        expect(list).toHaveLength(7);
        expect(list.find((h) => h.key === '2099-quoc-khanh')?.status).toBe('conflict');
        expect(list.find((h) => h.key === '2099-tet-duong-lich')?.status).toBe('ready');

        const gen = await request(server).post('/api/holidays/generate').set(as('owner')).send({ year: YEAR }).expect(201);
        expect(gen.body.data.created).toHaveLength(6);
        expect(gen.body.data.skipped.map((s: { key: string }) => s.key)).toEqual(['2099-quoc-khanh']);

        // Chạy lại: mọi ngày đã có -> không tạo trùng
        const again = await request(server).post('/api/holidays/generate').set(as('owner')).send({ year: YEAR }).expect(201);
        expect(again.body.data.created).toHaveLength(0);

        const [{ count }] = await ds.query(`SELECT COUNT(*)::int AS count FROM audit_logs WHERE summary LIKE 'Sinh tự động%2099'`);
        expect(count).toBeGreaterThanOrEqual(1);
      } finally {
        await ds.query(`DELETE FROM appointments WHERE code = 'HOL2099X'`);
      }
    });

    it('chỉ Chủ tiệm được áp dụng; Lễ tân chỉ xem đề xuất; năm sai bị từ chối', async () => {
      await request(server).get(`/api/holidays/suggestions?year=${YEAR}`).set(as('receptionist')).expect(200);
      await request(server).post('/api/holidays/generate').set(as('receptionist')).send({ year: YEAR }).expect(403);
      await request(server).get('/api/holidays/suggestions?year=1800').set(as('owner')).expect(400);
    });
  });
});
