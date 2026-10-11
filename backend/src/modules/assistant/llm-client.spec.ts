import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { buildLlmRequest, callLlm, LlmConfig, parseLlmResponse } from './llm-client';

const cfg = (over: Partial<LlmConfig>): LlmConfig => ({ provider: 'ollama', baseUrl: '', model: 'qwen2.5:3b', apiKey: '', timeoutMs: 500, ...over });
const msgs = [{ role: 'user' as const, content: 'xin chào' }];

describe('LLM client — Ollama / OpenAI-compatible, lỗi thì im lặng trả null (Part 5)', () => {
  let server: Server;
  let url = '';
  let delay = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(req.url === '/api/chat' ? JSON.stringify({ message: { content: ' Chào bạn ' } })
          : JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
      }, delay);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('dựng đúng endpoint theo nhà cung cấp; tắt khi để trống', () => {
    expect(buildLlmRequest(cfg({}), msgs)?.url).toBe('http://127.0.0.1:11434/api/chat');
    const o = buildLlmRequest(cfg({ provider: 'openai', baseUrl: 'https://x.ai/v1/', apiKey: 'k' }), msgs)!;
    expect(o.url).toBe('https://x.ai/v1/chat/completions');
    expect((o.init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(buildLlmRequest(cfg({ provider: '' }), msgs)).toBeNull();
    // Ollama qua cổng tương thích OpenAI (http://localhost:11434/v1) — Spark-X2.5-4B / Qwen 2.5 3B
    expect(buildLlmRequest(cfg({ baseUrl: 'http://localhost:11434/v1' }), msgs)?.url).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('đọc câu trả lời của cả hai định dạng', () => {
    expect(parseLlmResponse('ollama', { message: { content: 'a' } })).toBe('a');
    expect(parseLlmResponse('openai', { choices: [{ message: { content: 'b' } }] })).toBe('b');
    expect(parseLlmResponse('openai', {})).toBeNull();
  });

  it('gọi máy chủ thật; quá thời gian hoặc không kết nối được → null', async () => {
    delay = 0;
    await expect(callLlm(cfg({ baseUrl: url }), msgs)).resolves.toBe('Chào bạn');
    await expect(callLlm(cfg({ provider: 'openai', baseUrl: url }), msgs)).resolves.toBe('OK');
    await expect(callLlm(cfg({ baseUrl: `${url}/v1` }), msgs)).resolves.toBe('OK');
    delay = 300;
    await expect(callLlm(cfg({ baseUrl: url, timeoutMs: 50 }), msgs)).resolves.toBeNull();
    await expect(callLlm(cfg({ baseUrl: 'http://127.0.0.1:1' }), msgs)).resolves.toBeNull();
  });
});
