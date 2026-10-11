/**
 * Part 5 — gọi mô hình ngôn ngữ NHỎ cho Trợ lý AI, không thêm thư viện (fetch có sẵn trong Node 18+):
 *  - AI_PROVIDER=ollama : Qwen 2.5 3B/7B chạy cục bộ (`ollama pull qwen2.5:3b`), dữ liệu không rời máy tiệm.
 *  - AI_PROVIDER=openai : mọi API tương thích OpenAI (OpenAI, Groq, OpenRouter, LM Studio, vLLM…) — điền AI_API_KEY.
 *  - để trống           : tắt, Trợ lý trả lời bằng luật dựa trên số liệu (assistant-rules.ts).
 * Hết AI_TIMEOUT_MS hoặc lỗi bất kỳ → trả null để tầng trên dùng câu trả lời theo luật; không bao giờ ném lỗi ra API.
 */
export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }

export function buildLlmRequest(cfg: LlmConfig, messages: LlmMessage[]): { url: string; init: RequestInit } | null {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  // Ollama / LM Studio / llama.cpp đều có cổng tương thích OpenAI ở .../v1 (vd. http://localhost:11434/v1):
  // địa chỉ kết thúc bằng /v1 thì luôn gọi /chat/completions, bất kể AI_PROVIDER là ollama hay openai.
  if (cfg.provider === 'ollama' && /\/v1$/.test(base)) return buildLlmRequest({ ...cfg, provider: 'openai' }, messages);
  if (cfg.provider === 'ollama') {
    return {
      url: `${base || 'http://127.0.0.1:11434'}/api/chat`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages, stream: false, options: { temperature: 0.3, num_predict: 320 } }),
      },
    };
  }
  if (cfg.provider === 'openai') {
    return {
      url: `${base || 'https://api.openai.com/v1'}/chat/completions`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.3, max_tokens: 320 }),
      },
    };
  }
  return null;
}

export function parseLlmResponse(provider: string, body: unknown): string | null {
  const b = body as { message?: { content?: unknown }; choices?: { message?: { content?: unknown } }[] };
  const text = provider === 'ollama' ? b?.message?.content : b?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 2000) : null;
}

export async function callLlm(cfg: LlmConfig, messages: LlmMessage[]): Promise<string | null> {
  const req = buildLlmRequest(cfg, messages);
  if (!req) return null;
  const format = cfg.provider === 'ollama' && /\/v1\/?$/.test(cfg.baseUrl) ? 'openai' : cfg.provider;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(req.url, { ...req.init, signal: ctrl.signal });
    if (!res.ok) return null;
    return parseLlmResponse(format, await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
