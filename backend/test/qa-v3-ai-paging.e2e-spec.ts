import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ACCOUNTS, createTestApp } from './setup-app';

/**
 * TASK v3.0 trên máy chủ THẬT:
 *  - NV1: AI tư vấn khách (công khai, không đăng nhập) — chào hỏi tự nhiên, tư vấn theo nhu cầu bằng DANH MỤC THẬT,
 *    gợi ý có id / giá / thời lượng để điền vào wizard; trợ lý quản lý hiểu "alo", "bạn là ai".
 *  - NV2: Chờ xác nhận phân trang ở máy chủ, lịch quá hạn 12 giờ luôn ở đầu trang 1; không gửi page thì trả mảng như cũ.
 */
describe('TASK v3 — AI đàm thoại + phân trang Chờ xác nhận', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let owner = '';

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    // Bộ đếm AI khách theo IP nằm trong CSDL dùng chung: mọi bộ test gọi từ 127.0.0.1 cùng một xô 20 lượt / 10 phút
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'public_assistant_ip'`);
    owner = (await request(server).post('/api/auth/login').send(ACCOUNTS.owner).expect(200)).body.data.accessToken;
  }, 60000);
  afterAll(async () => { await app?.close(); });

  it('AI khách: chào hỏi → lời chào, không đổ bảng giá; hỏi bảng giá / nhu cầu → dịch vụ thật có giá và thời lượng', async () => {
    const hi = await request(server).post('/api/public/assistant/chat').send({ message: 'alo shop ơi' }).expect(200);
    expect(hi.body.data).toMatchObject({ intent: 'greeting', source: 'rules', suggestions: [] });
    expect(hi.body.data.answer).toMatch(/^Chào bạn!/);

    const price = await request(server).post('/api/public/assistant/chat').send({ message: 'Xem bảng giá' }).expect(200);
    expect(price.body.data.intent).toBe('price_list');
    expect(price.body.data.quickReplies.length).toBeGreaterThan(0);

    const [svc] = await ds.query(
      `SELECT s.id, s.name, s.duration_minutes AS d FROM services s
        WHERE s.is_active AND EXISTS (SELECT 1 FROM stylist_services ss JOIN stylists st ON st.id = ss.stylist_id
                                       WHERE ss.service_id = s.id AND st.is_active)
        ORDER BY s.name LIMIT 1`);
    const need = await request(server).post('/api/public/assistant/chat')
      .send({ message: `mình muốn đặt lịch ${svc.name}`, history: [{ role: 'user', content: 'chào' }, { role: 'assistant', content: 'Chào bạn!' }] })
      .expect(200);
    expect(need.body.data.intent).toBe('book');
    expect(need.body.data.suggestions[0]).toMatchObject({ id: svc.id, durationMinutes: svc.d, priceText: expect.any(String) });
    await request(server).post('/api/public/assistant/chat').send({ message: 'x'.repeat(501) }).expect(400);
  });

  it('trợ lý quản lý: "alo" và "bạn là ai" được trả lời như hội thoại, kèm câu hỏi gợi ý', async () => {
    const auth = { Authorization: `Bearer ${owner}` };
    const hi = await request(server).post('/api/assistant/chat').set(auth).send({ message: 'alo' }).expect(200);
    expect(hi.body.data.intent).toBe('greeting');
    expect(hi.body.data.answer).toMatch(/^Chào /);
    expect(hi.body.data.quickReplies.length).toBeGreaterThan(0);
    const who = await request(server).post('/api/assistant/chat').set(auth).send({ message: 'bạn là ai' }).expect(200);
    expect(who.body.data.intent).toBe('identity');
  });

  it('Chờ xác nhận: phân trang máy chủ, quá hạn 12 giờ đứng đầu, tổng / số trang đúng, kiểu cũ vẫn trả mảng', async () => {
    const auth = { Authorization: `Bearer ${owner}` };
    const all = await request(server).get('/api/appointments/pending').set(auth).expect(200);
    expect(Array.isArray(all.body.data)).toBe(true);
    const total = all.body.data.length as number;

    const p1 = await request(server).get('/api/appointments/pending').query({ page: 1, limit: 10, sort: 'start_desc' }).set(auth).expect(200);
    expect(p1.body.data).toMatchObject({ total, page: 1, limit: 10, totalPages: Math.max(1, Math.ceil(total / 10)) });
    const flags = (p1.body.data.items as { pendingOverdue: boolean }[]).map((a) => a.pendingOverdue);
    // quá hạn luôn đứng trước: không có lịch quá hạn nào nằm sau một lịch chưa quá hạn
    expect(flags.indexOf(false) === -1 || !flags.slice(flags.indexOf(false)).includes(true)).toBe(true);
    if (p1.body.data.overdueCount > 0) expect(flags[0]).toBe(true);
    await request(server).get('/api/appointments/pending').query({ page: 1, sort: 'random' }).set(auth).expect(400);
  });
});
