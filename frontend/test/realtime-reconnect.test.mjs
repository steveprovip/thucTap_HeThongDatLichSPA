import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Thay phụ thuộc mạng / React bằng bản giả: chỉ kiểm tra logic nối lại luồng của realtime.ts (realtimeScopes là bản thật)
const stubs = {
  react: 'export const useSyncExternalStore = () => undefined;',
  '@/api/client': "export const BASE_URL = '/api'; export const tokenStore = { access: 'tok' }; export const api = { get: () => Promise.resolve({ data: { data: { version: 'v1' } } }) };",
  '@/api/demoMode': 'export const DEMO_MODE = false;',
  './liveSync': 'export const dispatchRemoteChange = (change = {}) => { dispatched.push(change); };',
};
const out = await build({
  entryPoints: [resolve(root, 'src/utils/realtime.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^(react|@\/api\/client|@\/api\/demoMode|\.\/liveSync)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
    },
  }],
});

const winListeners = new Map();
const docListeners = new Map();
const on = (m) => (type, fn) => { if (!m.has(type)) m.set(type, new Set()); m.get(type).add(fn); };
const off = (m) => (type, fn) => { m.get(type)?.delete(fn); };
const fire = (m, type) => { [...(m.get(type) ?? [])].forEach((fn) => fn()); };

/** Hẹn giờ thật nhưng không giữ tiến trình test sống (watchdog 60 giây, chờ lời chào 10 giây). */
const window = {
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },
  clearTimeout: (t) => clearTimeout(t),
  addEventListener: on(winListeners),
  removeEventListener: off(winListeners),
};
const document = { visibilityState: 'visible', addEventListener: on(docListeners), removeEventListener: off(docListeners) };
const navigator = { onLine: true };
const dispatched = [];
const streams = [];
const encoder = new TextEncoder();

/** Luồng SSE giả: test tự gửi sự kiện, đóng êm (máy chủ đóng theo kế hoạch) hoặc làm rớt (lỗi mạng). */
function fakeFetch(_url, init) {
  const queue = [];
  let waiting = null;
  let failure = null;
  let ended = false;
  const settle = () => {
    if (!waiting) return;
    const w = waiting;
    if (queue.length) { waiting = null; w.resolve({ done: false, value: queue.shift() }); }
    else if (failure) { waiting = null; w.reject(failure); }
    else if (ended) { waiting = null; w.resolve({ done: true, value: undefined }); }
  };
  const stream = {
    /** Đang chờ dữ liệu = đã xử lý xong mọi sự kiện gửi trước đó. */
    get idle() { return waiting !== null && queue.length === 0; },
    send(event, data) { queue.push(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); settle(); },
    end() { ended = true; settle(); },
    fail(err = new TypeError('network error')) { failure = err; settle(); },
  };
  init.signal.addEventListener('abort', () => stream.fail(new Error('aborted')));
  streams.push(stream);
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader: () => ({
        read: () => new Promise((ok, ko) => { waiting = { resolve: ok, reject: ko }; settle(); }),
        cancel: () => Promise.resolve(),
      }),
    },
  });
}

const module = { exports: {} };
runInNewContext(out.outputFiles[0].text, {
  module, exports: module.exports, window, document, navigator, fetch: fakeFetch, dispatched,
  TextDecoder, AbortController, Date, Promise,
});
const { startRealtime, stopRealtime, getRealtimeStatus } = module.exports;

const tick = () => new Promise((ok) => setTimeout(ok, 0));
/** Chờ điều kiện; mỗi vòng phát 'online' để đánh thức giấc ngủ chờ nối lại (onOnline → wakeAll) thay vì đợi 1–3 giây. */
async function until(cond, label) {
  for (let i = 0; i < 500; i += 1) {
    if (cond()) return;
    fire(winListeners, 'online');
    await tick();
  }
  assert.fail(`Hết thời gian chờ: ${label}`);
}

/** Bắt đầu phiên, nhận lời chào seq 41 rồi một sự kiện seq 42 (màn hình đã được báo tải lại một lần). */
async function liveAfterOneChange() {
  streams.length = 0;
  dispatched.length = 0;
  navigator.onLine = true;
  startRealtime();
  await until(() => streams.length === 1, 'mở luồng đầu');
  streams[0].send('hello', { bootId: 'b1', seq: 41 });
  await until(() => streams[0].idle && getRealtimeStatus() === 'live', 'lời chào đầu');
  assert.equal(dispatched.length, 0); // lần nối đầu: chỉ ghi mốc
  streams[0].send('change', { seq: 42, scope: 'appointments' });
  await until(() => streams[0].idle, 'sự kiện 42');
  assert.equal(dispatched.length, 1);
}

async function reconnectWithSameSeq() {
  await until(() => streams.length === 2, 'nối lại');
  streams[1].send('hello', { bootId: 'b1', seq: 42 }); // mốc không đổi so với sự kiện cuối đã nhận
  await until(() => streams[1].idle, 'lời chào khi nối lại');
}

/** Mỗi kịch bản luôn dừng luồng ở cuối (kể cả khi assert hỏng) để kịch bản sau bắt đầu từ trạng thái sạch. */
const scenario = (name, fn) => test(name, async () => {
  try {
    await fn();
  } finally {
    stopRealtime();
    await tick();
  }
});

scenario('Nối lại theo kế hoạch (máy chủ đóng luồng sau 20 phút), mốc không đổi → không tải lại', async () => {
  await liveAfterOneChange();
  streams[0].end();
  await reconnectWithSameSeq();
  assert.equal(dispatched.length, 1);
});

scenario('Tab hiện lại (chủ động nối lại), mốc không đổi → không tải lại', async () => {
  await liveAfterOneChange();
  fire(docListeners, 'visibilitychange');
  await reconnectWithSameSeq();
  assert.equal(dispatched.length, 1);
});

scenario('Luồng rớt vì lỗi mạng ngay sau sự kiện (lần tải theo sự kiện có thể đã hỏng) → nối lại luôn tải lại dù mốc không đổi', async () => {
  await liveAfterOneChange();
  streams[0].fail();
  await reconnectWithSameSeq();
  assert.equal(dispatched.length, 2);
  assert.equal(dispatched[1].scope, undefined); // không rõ phạm vi → mọi màn hình làm mới
});

scenario('Mất mạng (offline) rồi có mạng lại → nối lại tải lại dù mốc không đổi', async () => {
  await liveAfterOneChange();
  navigator.onLine = false;
  streams[0].end();
  await until(() => getRealtimeStatus() === 'offline', 'chuyển sang offline');
  navigator.onLine = true;
  await reconnectWithSameSeq();
  assert.equal(dispatched.length, 2);
});

scenario('Đã tải lại sau lần rớt → lần nối lại êm tiếp theo không tải lại nữa', async () => {
  await liveAfterOneChange();
  streams[0].fail();
  await reconnectWithSameSeq();
  assert.equal(dispatched.length, 2);
  streams[1].end();
  await until(() => streams.length === 3, 'nối lại lần hai');
  streams[2].send('hello', { bootId: 'b1', seq: 42 });
  await until(() => streams[2].idle, 'lời chào lần hai');
  assert.equal(dispatched.length, 2);
});
