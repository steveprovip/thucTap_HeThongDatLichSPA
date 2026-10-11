/**
 * Part 5 — gọi mô hình ngôn ngữ NHỎ cho Trợ lý AI, không thêm thư viện (fetch có sẵn trong Node 18+):
 *  - AI_PROVIDER=ollama : Qwen 2.5 3B/7B chạy cục bộ (`ollama pull qwen2.5:3b`), dữ liệu không rời máy tiệm.
 *  - AI_PROVIDER=openai : mọi API tương thích OpenAI (OpenAI, Groq, OpenRouter, LM Studio, vLLM…) — điền AI_API_KEY.
 *  - để trống / auto    : TASK v4 · NV5 — tự dò máy chủ AI local (model_AI_local/chay_ai_local.cmd: llama.cpp hoặc Ollama
 *                         chạy Spark-X2.5-4B tại http://localhost:11434/v1). Có → provider 'local'; không có → luật.
 *  - off                : tắt hẳn, Trợ lý trả lời bằng luật dựa trên số liệu (assistant-rules.ts).
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

/** Địa chỉ AI local mặc định — llama.cpp `--port 11434` và Ollama cùng phục vụ API tương thích OpenAI ở đây. */
export const DEFAULT_LOCAL_AI_URL = 'http://127.0.0.1:11434/v1';

/** Máy chủ suy luận chạy ngay trên máy này: được gửi thêm tham số riêng (tắt chế độ "suy nghĩ" của Spark-X2.5 / Qwen3). */
export const isLocalUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url.trim());

/** Bỏ khối suy luận <think>…</think> (kể cả khối bị cắt cụt do hết max_tokens) — khách chỉ thấy câu trả lời. */
export const stripThinking = (text: string): string =>
  text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/^\s*<\/think>/i, '').trim();

/** Họ model có chế độ suy nghĩ (thinking) mặc định — cần tắt để trả lời nhanh, gọn. */
const THINKING_MODEL = /(spark|qwen3|deepseek-r1|gpt-oss|magistral)/i;

export interface LocalProbe {
  ok: boolean;
  models: string[];
  /** 'ollama' → gọi /api/chat gốc (tắt suy nghĩ bằng think:false); 'openai' → llama.cpp / LM Studio qua /v1. */
  kind: 'ollama' | 'openai';
}

const getJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const res = await fetch(url, { signal });
  return res.ok ? res.json() : null;
};

/**
 * Hỏi máy chủ AI local đang nạp model nào (GET /models — llama.cpp, Ollama, LM Studio đều có) và có phải Ollama không
 * (GET /api/version). Tắt / chưa chạy / quá `timeoutMs` → ok:false. Không ném lỗi.
 */
export async function probeLocalServer(baseUrl: string, timeoutMs = 800): Promise<LocalProbe> {
  const base = baseUrl.replace(/\/+$/, '');
  const root = base.replace(/\/v1$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [list, version] = await Promise.all([
      getJson(`${/\/v1$/.test(base) ? base : `${base}/v1`}/models`, ctrl.signal).catch(() => null),
      getJson(`${root}/api/version`, ctrl.signal).catch(() => null),
    ]);
    const body = (list ?? {}) as { data?: { id?: unknown }[] };
    const ids = (body.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    const isOllama = typeof (version as { version?: unknown } | null)?.version === 'string';
    return { ok: ids.length > 0, models: Array.from(new Set(ids)), kind: isOllama ? 'ollama' : 'openai' };
  } catch {
    return { ok: false, models: [], kind: 'openai' };
  } finally {
    clearTimeout(timer);
  }
}

/** Chọn model để gọi: đúng AI_MODEL nếu máy chủ có nạp, rồi tới Spark-X2.5, rồi model đầu tiên. */
export function pickModel(models: string[], preferred = ''): string | null {
  if (preferred && models.includes(preferred)) return preferred;
  return models.find((m) => /spark/i.test(m)) ?? models[0] ?? null;
}

export function buildLlmRequest(cfg: LlmConfig, messages: LlmMessage[]): { url: string; init: RequestInit } | null {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  // AI local tự dò được (TASK v4 · NV5): llama-server / LM Studio nói giao thức OpenAI ở /v1
  // (Ollama được nhận diện riêng ở probeLocalServer và gọi qua /api/chat gốc để tắt được chế độ suy nghĩ).
  if (cfg.provider === 'local') return buildLlmRequest({ ...cfg, provider: 'openai', baseUrl: base || DEFAULT_LOCAL_AI_URL }, messages);
  // Ollama / LM Studio / llama.cpp đều có cổng tương thích OpenAI ở .../v1 (vd. http://localhost:11434/v1):
  // địa chỉ kết thúc bằng /v1 thì luôn gọi /chat/completions, bất kể AI_PROVIDER là ollama hay openai.
  if (cfg.provider === 'ollama' && /\/v1$/.test(base)) return buildLlmRequest({ ...cfg, provider: 'openai' }, messages);
  if (cfg.provider === 'ollama') {
    return {
      url: `${base || 'http://127.0.0.1:11434'}/api/chat`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // think:false — model "biết suy nghĩ" (Spark-X2.5, Qwen3…) trả lời thẳng, không tiêu hết token vào suy luận.
        // Chỉ gửi cho họ model đó: bản Ollama cũ / model thường không cần tham số này.
        body: JSON.stringify({
          model: cfg.model, messages, stream: false, ...(THINKING_MODEL.test(cfg.model) ? { think: false } : {}),
          options: { temperature: 0.3, num_predict: 512 },
        }),
      },
    };
  }
  if (cfg.provider === 'openai') {
    const local = isLocalUrl(base);
    return {
      url: `${base || 'https://api.openai.com/v1'}/chat/completions`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        // Máy chủ local (llama.cpp / vLLM) hiểu chat_template_kwargs; API đám mây (OpenAI…) từ chối tham số lạ nên chỉ gửi khi local
        body: JSON.stringify({
          model: cfg.model, messages, temperature: 0.4, max_tokens: local ? 512 : 320,
          ...(local ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
      },
    };
  }
  return null;
}

export function parseLlmResponse(provider: string, body: unknown): string | null {
  const b = body as { message?: { content?: unknown }; choices?: { message?: { content?: unknown } }[] };
  const text = provider === 'ollama' ? b?.message?.content : b?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return null;
  const answer = stripThinking(text);
  return answer ? answer.slice(0, 2000) : null;
}

export async function callLlm(cfg: LlmConfig, messages: LlmMessage[]): Promise<string | null> {
  const req = buildLlmRequest(cfg, messages);
  if (!req) return null;
  const format = cfg.provider === 'local' || (cfg.provider === 'ollama' && /\/v1\/?$/.test(cfg.baseUrl)) ? 'openai' : cfg.provider;
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
