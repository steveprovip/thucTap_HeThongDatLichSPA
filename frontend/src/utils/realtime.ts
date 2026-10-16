import { useSyncExternalStore } from 'react';
import { api, BASE_URL, tokenStore } from '@/api/client';
import { DEMO_MODE } from '@/api/mockBackend';
import { dispatchRemoteChange } from './liveSync';
import { missedSince, type LiveChange, type StreamCursor } from './realtimeScopes';

/**
 * Đồng bộ trực tiếp GIỮA CÁC THIẾT BỊ: lễ tân tạo lịch ở máy bàn → laptop và điện thoại tự làm mới trong chưa tới 1 giây.
 *
 * Cách làm: giữ MỘT kết nối Server-Sent Events tới GET /api/events/stream. Mỗi khi ai đó ghi dữ liệu thành công,
 * máy chủ đẩy sự kiện "change" (không kèm dữ liệu cá nhân) và ta phát lại sự kiện `salon:appointments-changed`
 * mà mọi màn hình đã lắng nghe sẵn (useAppointmentsSync) → chúng tự tải lại qua REST có kiểm tra quyền.
 *
 * Vì sao dùng fetch chứ không dùng EventSource: EventSource không gắn được header Authorization,
 * mà ta không muốn đặt token lên URL (lọt vào nhật ký proxy/tunnel).
 *
 * Khi luồng bị chặn (proxy đệm SSE, ví dụ Cloudflare Quick Tunnel) → tự chuyển sang "cập nhật định kỳ":
 * cứ 15 giây hỏi GET /api/events/version, đổi thì làm mới. Vẫn thử nối lại luồng trực tiếp mỗi phút.
 *
 * RFC-2026-SPA-V3 · Pillar II.3: sự kiện mang phạm vi dữ liệu (`scope`) để màn hình chỉ tải phần của mình; nối lại thì so
 * mốc (bootId + seq) trong lời chào với mốc đã nhận — không lỡ gì thì KHÔNG tải lại (không nháy mỗi 20 phút / mỗi lần đổi tab).
 */
export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'polling' | 'offline';

const POLL_MS = 15_000;
/** Máy chủ gửi nhịp tim mỗi 20 giây: quá 60 giây im lặng nghĩa là kết nối đã chết ngầm (ngủ máy, đổi mạng). */
const WATCHDOG_MS = 60_000;
/** Phải nhận được lời chào "hello" trong khoảng này, nếu không coi như proxy đang đệm luồng. */
const HELLO_TIMEOUT_MS = 10_000;
const MAX_FAST_FAILS = 3;
const RETRY_STREAM_AFTER_POLLING_MS = 60_000;

let status: RealtimeStatus = 'idle';
const listeners = new Set<() => void>();
const setStatus = (s: RealtimeStatus): void => {
  if (s === status) return;
  status = s;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const getRealtimeStatus = (): RealtimeStatus => status;
export const useRealtimeStatus = (): RealtimeStatus => useSyncExternalStore(subscribe, getRealtimeStatus, getRealtimeStatus);

class StreamError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); }
}

/** `polled`: đã từng rơi về chế độ hỏi định kỳ (lần nối luồng sau phải làm mới vì mốc không còn chính xác). */
interface PollState { version: string | null; polled: boolean }

let running = false;
let generation = 0;
let current: AbortController | null = null;
const wakers = new Set<() => void>();

/** Ngủ `ms` mili giây nhưng dậy ngay khi tab hiện lại / có mạng trở lại. */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const done = () => { window.clearTimeout(t); wakers.delete(done); resolve(); };
    const t = window.setTimeout(done, ms);
    wakers.add(done);
  });

const wakeAll = (): void => { [...wakers].forEach((w) => w()); };

/** Mốc dữ liệu đã nhận (lời chào / sự kiện cuối) — so với lời chào lần nối sau để biết có lỡ thay đổi không. */
let cursor: StreamCursor | null = null;

const onVisible = (): void => {
  if (document.visibilityState !== 'visible' || !running) return;
  // Trình duyệt di động hay âm thầm đóng kết nối khi tab ở nền -> nối lại NGAY; lời chào mới cho biết có lỡ thay đổi nào
  // không (missedSince) — có thì làm mới, không thì giữ nguyên màn hình. Đang hỏi định kỳ thì hỏi ngay một lượt.
  current?.abort();
  wakeAll();
};
const onOnline = (): void => { if (running) wakeAll(); };

/** Tách một khối SSE thành tên sự kiện + dữ liệu JSON (dữ liệu hỏng → null, không làm sập luồng). */
function parseBlock(block: string): { event: string; data: Record<string, unknown> | null } | null {
  let event = '';
  let raw = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) raw += line.slice(5).trim();
  }
  if (!event) return null;
  try { return { event, data: raw ? (JSON.parse(raw) as Record<string, unknown>) : null }; } catch { return { event, data: null }; }
}

async function readStream(res: Response, ctrl: AbortController, onMessage: (event: string, data: Record<string, unknown> | null) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let watchdog = window.setTimeout(() => ctrl.abort(), WATCHDOG_MS);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => ctrl.abort(), WATCHDOG_MS);
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const msg = parseBlock(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
        if (msg) onMessage(msg.event, msg.data);
      }
    }
  } finally {
    window.clearTimeout(watchdog);
    reader.cancel().catch(() => undefined);
  }
}

/** Mở luồng và chạy cho tới khi bị đóng. Trả true nếu đã từng nhận "hello" (kết nối thật sự hoạt động). */
async function runStream(onHello: (hello: StreamCursor | null) => void): Promise<boolean> {
  const ctrl = new AbortController();
  current = ctrl;
  let hello = false;
  const helloTimer = window.setTimeout(() => { if (!hello) ctrl.abort(); }, HELLO_TIMEOUT_MS);
  try {
    const token = tokenStore.access;
    if (!token) throw new StreamError(401, 'Chưa đăng nhập');
    const res = await fetch(`${BASE_URL}/events/stream`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !res.body || !type.includes('text/event-stream')) {
      throw new StreamError(res.status, `Luồng trực tiếp không khả dụng (${res.status})`);
    }
    await readStream(res, ctrl, (event, data) => {
      if (event === 'hello') {
        hello = true;
        window.clearTimeout(helloTimer);
        onHello(typeof data?.bootId === 'string' && typeof data.seq === 'number' ? { bootId: data.bootId, seq: data.seq } : null);
      } else if (event === 'change') {
        const seq = typeof data?.seq === 'number' ? data.seq : undefined;
        if (cursor && seq !== undefined) cursor = { ...cursor, seq };
        const change: LiveChange = { seq };
        if (typeof data?.scope === 'string') change.scope = data.scope;
        if (data?.kind === 'booking.created') change.kind = 'booking.created';
        dispatchRemoteChange(change);
      }
    });
    return hello;
  } catch (e) {
    if (e instanceof StreamError) throw e;
    // Bị huỷ (tab hiện lại, watchdog, hết thời gian chờ lời chào) hoặc lỗi mạng
    if (hello) return true;
    throw new StreamError(0, (e as Error).message || 'Mất kết nối');
  } finally {
    window.clearTimeout(helloTimer);
    if (current === ctrl) current = null;
  }
}

async function poll(id: number, ms: number, state: PollState): Promise<void> {
  state.polled = true;
  const end = Date.now() + ms;
  // Hỏi NGAY một lần để lấy mốc so sánh (nếu đợi 15 giây rồi mới hỏi, thay đổi xảy ra trong lúc đó sẽ bị coi là "mốc" và bị lỡ)
  while (running && id === generation && Date.now() < end) {
    try {
      const res = await api.get('/events/version');
      const version: string | undefined = res.data?.data?.version;
      if (version && state.version !== null && version !== state.version) dispatchRemoteChange();
      if (version) state.version = version;
      setStatus('polling');
    } catch {
      setStatus(navigator.onLine ? 'polling' : 'offline');
    }
    await sleep(POLL_MS);
  }
}

async function loop(id: number): Promise<void> {
  let fails = 0;
  let refreshedOnce = false;
  const pollState: PollState = { version: null, polled: false };

  while (running && id === generation) {
    if (!navigator.onLine) {
      setStatus('offline');
      await sleep(3000);
      continue;
    }
    // Nối lại theo kế hoạch (máy chủ đóng luồng sau 20 phút) thì giữ nguyên trạng thái "Trực tiếp", không nháy
    if (!(status === 'live' && fails === 0)) setStatus(fails >= MAX_FAST_FAILS ? 'polling' : 'connecting');
    try {
      const gotHello = await runStream((hello) => {
        fails = 0;
        refreshedOnce = false;
        setStatus('live');
        // Lần nối đầu tiên: màn hình vừa tải xong, chỉ ghi mốc. Nối lại: chỉ làm mới khi đã lỡ thay đổi (máy chủ khởi động lại
        // hoặc số thứ tự tăng trong lúc mất kết nối); lời chào thiếu mốc (máy chủ cũ) → làm mới cho chắc.
        const first = cursor === null && !pollState.polled;
        if (!first && (!hello || missedSince(cursor, hello))) dispatchRemoteChange();
        cursor = hello;
        pollState.version = null;
        pollState.polled = false;
      });
      if (!gotHello) { fails += 1; setStatus('connecting'); }
    } catch (e) {
      const err = e as StreamError;
      if (err.httpStatus === 401 && !refreshedOnce) {
        // Access token hết hạn: gọi một API thường để interceptor tự làm mới token, rồi nối lại NGAY (chỉ một lần)
        refreshedOnce = true;
        try { await api.get('/events/version'); continue; } catch { /* onUnauthorized sẽ đưa về trang đăng nhập */ }
      }
      fails += 1;
      setStatus('connecting');
    }
    if (!running || id !== generation) break;

    if (fails >= MAX_FAST_FAILS) {
      setStatus('polling');
      dispatchRemoteChange();
      await poll(id, RETRY_STREAM_AFTER_POLLING_MS, pollState);
    } else {
      await sleep(Math.min(1000 * 2 ** fails, 15_000));
    }
  }
}

/** Bắt đầu đồng bộ trực tiếp (gọi sau khi nhân viên đăng nhập). Gọi nhiều lần cũng chỉ có một kết nối. */
export function startRealtime(): void {
  if (running || DEMO_MODE || typeof window === 'undefined') return;
  running = true;
  cursor = null;
  generation += 1;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOnline);
  void loop(generation);
}

export function stopRealtime(): void {
  running = false;
  generation += 1;
  current?.abort();
  wakeAll();
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOnline);
  setStatus('idle');
}
