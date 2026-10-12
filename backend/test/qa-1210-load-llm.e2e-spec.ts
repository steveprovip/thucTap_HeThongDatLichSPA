import http from 'http';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { fire, ipOf, summary } from './support/load';

/**
 * QA 12/10 — 1000 khách hỏi trợ lý AI cùng lúc KHI CÓ mô hình ngôn ngữ. Máy chủ mô hình giả lập đúng như llama-server
 * `-np 1`: xử lý TỪNG câu một, mỗi câu 250 ms, và trả lời kèm markdown / nút giả "**[Đặt lịch]**" như Spark-X2.5-4B thật.
 * Không có cổng chặn: 1000 câu xếp hàng ~250 giây → gần như mọi khách chờ hết AI_TIMEOUT_MS. Có cổng chặn: tối đa 2 câu
 * gọi mô hình + 6 câu chờ, phần dư trả lời NGAY bằng số liệu thật; câu giống nhau dùng chung một lời gọi.
 */
describe('Chịu tải — 1000 khách hỏi trợ lý AI cùng lúc (có mô hình ngôn ngữ, 1 luồng)', () => {
  let app: INestApplication;
  let base = '';
  let llm: http.Server;
  const stat = { calls: 0, inflight: 0, peak: 0 };
  let chain: Promise<void> = Promise.resolve();

  beforeAll(async () => {
    llm = http.createServer((req, res) => {
      const send = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      if (req.url?.endsWith('/models')) return send({ data: [{ id: 'mock-4b' }] });
      req.resume();
      stat.calls += 1;
      stat.inflight += 1;
      stat.peak = Math.max(stat.peak, stat.inflight);
      // Một luồng: câu sau chỉ bắt đầu khi câu trước xong (như -np 1)
      chain = chain.then(() => new Promise<void>((done) => setTimeout(() => {
        stat.inflight -= 1;
        send({ choices: [{ message: { content: 'Bạn thử **Gội đầu dưỡng sinh** nhé, thư giãn lắm! **[Đặt lịch]**' } }] });
        done();
      }, 250)));
    });
    await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
    Object.assign(process.env, {
      AI_LLM_LEAD: '1', // bài tải đo đường gọi mô hình: bật câu dẫn của mô hình cho câu tư vấn nhu cầu
      AI_PROVIDER: 'openai', AI_BASE_URL: `http://127.0.0.1:${(llm.address() as AddressInfo).port}/v1`, AI_MODEL: 'mock-4b',
      AI_TIMEOUT_MS: '20000', AI_MAX_CONCURRENCY: '2', AI_MAX_QUEUE: '6', AI_QUEUE_WAIT_MS: '3000', AI_CACHE_MINUTES: '10',
    });
    // Nạp ứng dụng SAU khi đặt biến môi trường AI (cấu hình đọc process.env lúc dựng module)
    const { createTestApp } = await import('./setup-app');
    app = await createTestApp();
    app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await new Promise((r) => llm?.close(r));
  });

  it('1000 câu cùng lúc: 100% trả lời, không ai chờ hết timeout, mô hình không bao giờ bị dồn quá 2 câu', async () => {
    type Body = { data: { intent: string; answer: string; source: string; suggestions: unknown[] } };
    const r = await fire<Body>(1000, (i) => ({
      url: `${base}/public/assistant/chat`, ip: ipOf(20000 + i),
      // 40% cùng một câu (gộp chung một lời gọi), 40% câu riêng từng khách, 20% câu số liệu (không cần mô hình)
      body: { message: i % 5 < 2 ? 'Tóc mình khô xơ nên làm gì' : i % 5 < 4 ? `Mình bị mỏi vai gáy, khách số ${i}` : 'dịch vụ rẻ nhất là' },
    }));
    const llmAnswers = r.bodies.filter((b) => b?.data?.source === 'llm');
    console.log(summary('AI khách · 1000 đồng thời · có mô hình 1 luồng (250 ms/câu)', r));
    console.log(`[load] gọi mô hình ${stat.calls} lần (đỉnh ${stat.peak} câu đồng thời) · ${llmAnswers.length} câu trả lời từ mô hình · `
      + `${1000 - llmAnswers.length} câu trả lời ngay bằng số liệu`);

    expect(r.status).toEqual({ 200: 1000 });
    expect(stat.peak).toBeLessThanOrEqual(2);
    expect(stat.calls).toBeLessThanOrEqual(20); // không phải 800 lời gọi xếp hàng
    expect(r.p95).toBeLessThan(10000); // trước đây: chờ tới AI_TIMEOUT_MS
    // 400 khách hỏi cùng một câu → dùng chung câu trả lời của mô hình
    expect(llmAnswers.length).toBeGreaterThanOrEqual(400);
    // Câu trả lời của mô hình đã được làm sạch: không còn ** hay nút giả [Đặt lịch]
    for (const b of llmAnswers) expect(b.data.answer).not.toMatch(/\*\*|\[Đặt lịch\]/);
    // Câu số liệu không đi qua mô hình
    expect(r.bodies.filter((_, i) => i % 5 === 4).every((b) => b.data.source === 'rules' && b.data.intent === 'cheapest_service')).toBe(true);
  }, 120000);

  it('đợt hỏi lại câu mở đầu giống hệt: trả từ bộ nhớ đệm, không gọi mô hình thêm', async () => {
    const before = stat.calls;
    const r = await fire<{ data: { source: string } }>(500, (i) => ({
      url: `${base}/public/assistant/chat`, ip: ipOf(40000 + i), body: { message: 'Tóc mình khô xơ nên làm gì' },
    }));
    console.log(summary('AI khách · 500 câu lặp lại (bộ nhớ đệm)', r));
    expect(r.status).toEqual({ 200: 500 });
    expect(r.bodies.every((b) => b.data.source === 'llm')).toBe(true);
    expect(stat.calls).toBe(before);
  }, 120000);
});
