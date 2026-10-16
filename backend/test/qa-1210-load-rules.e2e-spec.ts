import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { createTestApp } from './setup-app';
import { fire, ipOf, summary } from './support/load';

/**
 * QA 12/10 — "1000 người hỏi AI cùng lúc" (chế độ trả lời theo luật / số liệu thật, không có mô hình) trên máy chủ THẬT
 * (HTTP thật + PostgreSQL). Ngưỡng thời gian rộng để chạy ổn trên máy yếu; số liệu thật in ra log `[load]`.
 */
describe('Chịu tải — 1000 khách hỏi trợ lý AI cùng lúc (chế độ số liệu)', () => {
  let app: INestApplication;
  let base = '';

  beforeAll(async () => {
    app = await createTestApp();
    // Bộ đếm AI khách theo IP nằm trong CSDL dùng chung: câu khởi động (không X-Forwarded-For) không được 429 vì lượt của bộ khác
    await app.get(DataSource).query(`DELETE FROM rate_limits WHERE scope = 'public_assistant_ip'`);
    // Mô phỏng 1000 khách ở 1000 địa chỉ khác nhau phía sau proxy tin cậy (Nginx / Vite dev proxy)
    app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  }, 60000);
  afterAll(async () => { await app?.close(); });

  const QUESTIONS = ['có bao nhiêu dịch vụ ?', 'dịch vụ rẻ nhất là', 'combo có gì hot ?', 'combo có gì khác so với bình thường ?',
    'tóc mình khô xơ quá', 'Xem bảng giá', 'đặt lịch có cần cọc không', 'mấy giờ mở cửa', 'alo shop ơi', 'mỏi vai gáy quá'];

  it('1000 khách khác nhau hỏi cùng lúc: 100% trả lời 200, không lỗi, độ trễ thấp', async () => {
    const warm = await fetch(`${base}/public/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'xin chào' }) });
    expect(warm.status).toBe(200);

    const r = await fire<{ data: { intent: string; answer: string; source: string } }>(1000, (i) => ({
      url: `${base}/public/assistant/chat`, ip: ipOf(i + 1), body: { message: QUESTIONS[i % QUESTIONS.length] },
    }));
    console.log(summary('AI khách · 1000 khách đồng thời · chế độ số liệu', r));
    expect(r.status).toEqual({ 200: 1000 });
    expect(r.p95).toBeLessThan(15000);
    // Câu trả lời ổn định: cùng câu hỏi → cùng ý định cho mọi khách
    const intents = new Map<string, Set<string>>();
    r.bodies.forEach((b, i) => {
      const q = QUESTIONS[i % QUESTIONS.length];
      intents.set(q, (intents.get(q) ?? new Set()).add(b.data.intent));
    });
    for (const [, set] of intents) expect(set.size).toBe(1);
    expect([...intents.get('combo có gì hot ?')!]).toEqual(['hot']);
  }, 120000);

  it('1000 câu từ CÙNG một IP cùng lúc: đúng 20 câu được trả lời, còn lại 429 (giới hạn tần suất nguyên tử)', async () => {
    const r = await fire(1000, () => ({ url: `${base}/public/assistant/chat`, ip: '172.31.0.9', body: { message: 'Xem bảng giá' } }));
    console.log(summary('AI khách · 1000 câu cùng IP', r));
    expect(r.status[200]).toBe(20);
    expect(r.status[429]).toBe(980);
  }, 120000);

  it('1000 lượt tải danh mục công khai cùng lúc: 100% 200', async () => {
    const r = await fire(1000, (i) => ({ url: `${base}/public/catalog`, ip: ipOf(5000 + i) }));
    console.log(summary('GET /public/catalog · 1000 đồng thời', r));
    expect(r.status).toEqual({ 200: 1000 });
  }, 120000);
});
