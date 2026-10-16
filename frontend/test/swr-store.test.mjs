import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({ entryPoints: [resolve(root, 'src/utils/swrStore.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
const module = { exports: {} };
runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, Date, Promise });
const { SwrStore } = module.exports;

/** Request giả do test tự quyết định lúc nào trả về (không phụ thuộc đồng hồ). */
const deferred = () => {
  let resolveFn;
  const promise = new Promise((ok) => { resolveFn = ok; });
  return { promise, resolve: resolveFn };
};

test('SWR: tải lại sau khi ghi (force) gửi request mới, không dùng chung GET đã đọc CSDL trước khi ghi', async () => {
  const store = new SwrStore();
  let server = 'confirmed';
  const before = deferred();
  const after = deferred();
  let calls = 0;
  // t=0: sự kiện đồng bộ trước đó mở GET R1 — máy chủ chụp trạng thái lúc này
  const r1 = store.fetch('appointments:list', () => { calls += 1; const snap = server; return before.promise.then(() => snap); });
  server = 'arrived'; // check-in vừa ghi xong
  // tải lại sau khi ghi: phải là request mới, đọc trạng thái SAU khi ghi
  const r2 = store.fetch('appointments:list', () => { calls += 1; const snap = server; return after.promise.then(() => snap); }, true);
  assert.equal(calls, 2);
  after.resolve();
  assert.equal(await r2, 'arrived');
  assert.equal(store.get('appointments:list').data, 'arrived');
  before.resolve(); // R1 (ảnh chụp trước khi ghi) về muộn
  assert.equal(await r1, 'confirmed'); // người gọi cũ vẫn nhận kết quả của chính nó…
  assert.equal(store.get('appointments:list').data, 'arrived'); // …nhưng không được đè đệm bằng trạng thái cũ
});

test('SWR: chỉ request mới nhất ghi đệm; request cũ xong trước không xoá request mới đang chạy', async () => {
  const store = new SwrStore();
  const d1 = deferred();
  const d2 = deferred();
  let calls = 0;
  const r1 = store.fetch('k', () => { calls += 1; return d1.promise; });
  const r2 = store.fetch('k', () => { calls += 1; return d2.promise; }, true);
  d1.resolve('cu');
  assert.equal(await r1, 'cu');
  assert.equal(store.get('k'), undefined); // R1 không còn là request mới nhất → không ghi đệm
  const r3 = store.fetch('k', () => { calls += 1; return Promise.resolve('khac'); });
  assert.equal(r3, r2); // lần tải đầu (không force) vẫn gộp vào request MỚI NHẤT đang chạy
  assert.equal(calls, 2);
  d2.resolve('moi');
  assert.equal(await r3, 'moi');
  assert.equal(store.get('k').data, 'moi');
});

test('SWR: clear() xoá đệm của người dùng trước, phản hồi của phiên trước về muộn không ghi lại', async () => {
  const store = new SwrStore();
  store.set('appointments:list:{}', { items: [{ phone: '0987654321' }] });
  const old = deferred();
  const late = store.fetch('palette:stylists', () => old.promise);
  store.clear(); // đăng xuất / đổi tài khoản
  assert.equal(store.size, 0);
  assert.equal(store.get('appointments:list:{}'), undefined);

  // Người đăng nhập sau mở bảng lệnh: không gộp vào request của phiên trước
  const fresh = deferred();
  let calls = 0;
  const next = store.fetch('palette:stylists', () => { calls += 1; return fresh.promise; });
  assert.equal(calls, 1);
  assert.notEqual(next, late);
  old.resolve(['du lieu nguoi truoc']);
  await late;
  assert.equal(store.get('palette:stylists'), undefined); // vé cũ không trùng vé mới dù khoá giống nhau
  fresh.resolve(['du lieu nguoi sau']);
  await next;
  assert.equal(store.get('palette:stylists').data[0], 'du lieu nguoi sau');
});

test('SWR: clear() khi không có request mới — phản hồi cũ về muộn vẫn không ghi đệm', async () => {
  const store = new SwrStore();
  const old = deferred();
  const late = store.fetch('k', () => old.promise);
  store.clear();
  old.resolve('cu');
  await late;
  assert.equal(store.get('k'), undefined);
  assert.equal(await store.fetch('k', () => Promise.resolve('moi')), 'moi'); // request sau vẫn chạy và ghi đệm bình thường
  assert.equal(store.get('k').data, 'moi');
});
