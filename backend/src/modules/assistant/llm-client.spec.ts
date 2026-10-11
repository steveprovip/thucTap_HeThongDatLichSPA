import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import {
  buildLlmRequest, callLlm, isLocalUrl, LlmConfig, parseLlmResponse, pickModel, probeLocalServer, stripThinking,
} from './llm-client';

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

describe('AI local Spark-X2.5-4B — tự dò máy chủ, tắt chế độ suy nghĩ (TASK v4 · NV5)', () => {
  let server: Server;
  let url = '';
  let ollama = false;
  let lastBody: Record<string, unknown> = {};
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/v1/models') return res.end(JSON.stringify({ object: 'list', data: [{ id: 'other-model' }, { id: 'spark-x2.5-4b' }] }));
        if (req.url === '/api/version') {
          if (!ollama) { res.statusCode = 404; return res.end('{}'); }
          return res.end(JSON.stringify({ version: '0.34.1' }));
        }
        lastBody = raw ? JSON.parse(raw) : {};
        return res.end(JSON.stringify({ choices: [{ message: { content: '<think>khách hỏi giá</think>\nDạ, cắt tóc nữ 180.000 ₫ ạ.' } }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('dò được máy chủ đang chạy + model đang nạp; phân biệt Ollama; tắt / sai cổng → ok:false', async () => {
    await expect(probeLocalServer(`${url}/v1`)).resolves.toEqual({ ok: true, models: ['other-model', 'spark-x2.5-4b'], kind: 'openai' });
    ollama = true;
    await expect(probeLocalServer(url)).resolves.toMatchObject({ ok: true, kind: 'ollama' });
    ollama = false;
    await expect(probeLocalServer('http://127.0.0.1:1/v1', 300)).resolves.toMatchObject({ ok: false, models: [] });
  });

  it('chọn đúng model: AI_MODEL nếu có nạp → Spark → model đầu tiên', () => {
    expect(pickModel(['a', 'spark-x2.5-4b'], 'a')).toBe('a');
    expect(pickModel(['a', 'spark-x2.5-4b'], 'khong-co')).toBe('spark-x2.5-4b');
    expect(pickModel(['a', 'b'])).toBe('a');
    expect(pickModel([])).toBeNull();
  });

  it('máy chủ local nhận chat_template_kwargs.enable_thinking=false; API đám mây không bị gửi tham số lạ', async () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLocalUrl('https://api.openai.com/v1')).toBe(false);
    const cloud = JSON.parse(String(buildLlmRequest(cfg({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' }), msgs)!.init.body));
    expect(cloud.chat_template_kwargs).toBeUndefined();
    await expect(callLlm(cfg({ provider: 'local', baseUrl: `${url}/v1`, model: 'spark-x2.5-4b' }), msgs)).resolves.toBe('Dạ, cắt tóc nữ 180.000 ₫ ạ.');
    expect(lastBody).toMatchObject({ model: 'spark-x2.5-4b', chat_template_kwargs: { enable_thinking: false } });
    const native = JSON.parse(String(buildLlmRequest(cfg({ baseUrl: url, model: 'spark-x2.5-4b' }), msgs)!.init.body));
    expect(native.think).toBe(false);
    const legacy = JSON.parse(String(buildLlmRequest(cfg({ baseUrl: url, model: 'qwen2.5:3b' }), msgs)!.init.body));
    expect(legacy.think).toBeUndefined();
  });

  it('bỏ khối <think> (kể cả bị cắt cụt), chỉ còn suy nghĩ thì coi như không trả lời', () => {
    expect(stripThinking('<think>a\nb</think> Xin chào')).toBe('Xin chào');
    expect(stripThinking('Trả lời')).toBe('Trả lời');
    expect(parseLlmResponse('openai', { choices: [{ message: { content: '<think>đang nghĩ dở…' } }] })).toBeNull();
  });
});
