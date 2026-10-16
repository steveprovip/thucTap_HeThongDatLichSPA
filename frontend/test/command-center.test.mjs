import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (file) => {
  const out = await build({ entryPoints: [resolve(root, file)], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, Date, Promise });
  return module.exports;
};
const { SwrStore } = await load('src/utils/swrStore.ts');
const fuzzy = await load('src/utils/fuzzy.ts');
const ids = (list) => JSON.parse(JSON.stringify(list.map((p) => p.id)));

test('SWR: gộp request cùng khoá đang chạy, lưu đệm kết quả', async () => {
  const store = new SwrStore();
  let calls = 0;
  const fetcher = () => new Promise((ok) => setTimeout(() => ok(++calls), 10));
  const [a, b] = await Promise.all([store.fetch('k', fetcher), store.fetch('k', fetcher)]);
  assert.equal(calls, 1);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(store.get('k').data, 1);
  await store.fetch('k', fetcher); // xong rồi thì lần sau tải lại thật
  assert.equal(calls, 2);
});

test('SWR: lỗi không ghi đè đệm cũ, request sau vẫn chạy được', async () => {
  const store = new SwrStore();
  store.set('k', 'cu');
  await assert.rejects(store.fetch('k', () => Promise.reject(new Error('mat mang'))));
  assert.equal(store.get('k').data, 'cu');
  assert.equal(await store.fetch('k', () => Promise.resolve('moi')), 'moi');
});

test('SWR: LRU giới hạn số khoá, update lạc quan sửa mọi trang đã đệm', () => {
  const store = new SwrStore(3);
  store.set('appointments:1', { items: [{ id: 'a', status: 'pending' }] });
  store.set('appointments:2', { items: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }] });
  store.set('customers:1', { items: [] });
  store.get('appointments:1'); // vừa dùng → không bị đẩy ra
  store.set('appointments:3', { items: [] });
  assert.equal(store.size, 3);
  assert.equal(store.get('appointments:2'), undefined);
  store.update((k) => k.startsWith('appointments:'), (d) => ({ ...d, items: d.items.map((x) => (x.id === 'a' ? { ...x, status: 'confirmed' } : x)) }));
  assert.equal(store.get('appointments:1').data.items[0].status, 'confirmed');
  store.invalidate('appointments:');
  assert.equal(store.get('appointments:1'), undefined);
  assert.ok(store.get('customers:1'));
});

test('Command palette: tìm không dấu, AND nhiều từ, SĐT theo dãy số', () => {
  const people = [
    { id: 1, name: 'Nguyễn Thị Mai', phone: '0987 654 321', code: 'K7M2Q' },
    { id: 2, name: 'Trần Minh Tuấn', phone: '0912345678', code: 'AB12C' },
    { id: 3, name: 'Mai Anh', phone: '0909000111', code: 'ZZ99X' },
  ];
  const idx = fuzzy.buildIndex(people, (p) => [p.name, p.phone, p.code]);
  assert.deepEqual(ids(fuzzy.search(idx, 'mai')), [3, 1]); // đầu chuỗi trước
  assert.deepEqual(ids(fuzzy.search(idx, 'nguyen mai')), [1]);
  assert.deepEqual(ids(fuzzy.search(idx, 'tuấn')), [2]);
  assert.deepEqual(ids(fuzzy.search(idx, '0987654')), [1]);
  assert.deepEqual(ids(fuzzy.search(idx, 'k7m2')), [1]);
  assert.equal(fuzzy.search(idx, '   ').length, 0);
});

test('Command palette: 5.000 mục, mỗi lần gõ < 15 ms', () => {
  const names = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi'];
  const items = Array.from({ length: 5000 }, (_, i) => ({ name: `${names[i % 8]} Thị Khách ${i}`, phone: `09${String(i).padStart(8, '0')}` }));
  const idx = fuzzy.buildIndex(items, (x) => [x.name, x.phone]);
  const t0 = performance.now();
  for (const q of ['khach 49', 'dang thi', '0900004', 'bui khach 4999']) fuzzy.search(idx, q);
  const per = (performance.now() - t0) / 4;
  assert.ok(per < 15, `trung bình ${per.toFixed(2)} ms/lần`);
});
