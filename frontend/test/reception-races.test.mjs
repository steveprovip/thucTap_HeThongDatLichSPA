import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Nạp hàm thuần từ một file giao diện: mọi phụ thuộc (React, API, component con…) để ngoài và thay bằng đối tượng rỗng. */
const load = async (file) => {
  const out = await build({
    entryPoints: [resolve(root, file)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [{
      name: 'externals',
      setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.kind === 'entry-point' ? undefined : { path: a.path, external: true })); },
    }],
  });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, require: () => ({}) });
  return module.exports;
};
const { freshHits } = await load('src/components/CommandPalette.tsx');
const { patchStatus } = await load('src/pages/reception/DayTimelinePage.tsx');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('Bảng lệnh: kết quả máy chủ của truy vấn cũ không hiện, Enter không mở nhầm', () => {
  const stale = { q: '0912', items: [{ id: 'lich-khach-X' }] };
  // Gõ tiếp '0912' → '0912345678', phản hồi cho truy vấn mới chưa về: bỏ kết quả của '0912'
  assert.deepEqual(plain(freshHits(stale, '0912345678')), []);
  assert.deepEqual(plain(freshHits(stale, '091')), []);
  // Đúng truy vấn đã sinh ra kết quả → dùng
  assert.deepEqual(plain(freshHits(stale, '0912')), [{ id: 'lich-khach-X' }]);
  // Chưa gõ gì: không có kết quả máy chủ
  assert.deepEqual(plain(freshHits({ q: '', items: [{ id: 'cu' }] }, '')), []);
});

const day = (statusX) => ({
  date: '2026-10-16',
  columns: [
    { stylistId: 's1', appointments: [{ id: 'X', status: statusX }, { id: 'Y', status: 'confirmed' }] },
    { stylistId: 's2', appointments: [{ id: 'Z', status: 'arrived' }] },
  ],
});
const statuses = (d) => Object.fromEntries(d.columns.flatMap((c) => c.appointments.map((a) => [a.id, a.status])));

test('Lịch ngày: cập nhật lạc quan đổi đúng một thẻ, không sửa dữ liệu gốc', () => {
  const before = day('confirmed');
  const after = patchStatus(before, 'X', 'arrived');
  assert.deepEqual(plain(statuses(after)), { X: 'arrived', Y: 'confirmed', Z: 'arrived' });
  assert.deepEqual(statuses(before), { X: 'confirmed', Y: 'confirmed', Z: 'arrived' });
});

test('Lịch ngày: lỗi chuyển trạng thái chỉ trả lại thẻ còn đang hiện trạng thái lạc quan', () => {
  // Thẻ vẫn ở 'arrived' (lạc quan) → trả về 'confirmed' lúc bấm
  assert.deepEqual(plain(statuses(patchStatus(day('arrived'), 'X', 'confirmed', 'arrived'))), { X: 'confirmed', Y: 'confirmed', Z: 'arrived' });
  // Trong lúc chờ, đồng bộ ngầm đã ghi 'cancelled' (quầy khác vừa huỷ) → giữ trạng thái máy chủ, không ghi đè bằng 'confirmed'
  assert.deepEqual(plain(statuses(patchStatus(day('cancelled'), 'X', 'confirmed', 'arrived'))), { X: 'cancelled', Y: 'confirmed', Z: 'arrived' });
  // Thẻ khác đang cùng trạng thái 'arrived' không bị đụng tới
  assert.equal(statuses(patchStatus(day('arrived'), 'X', 'confirmed', 'arrived')).Z, 'arrived');
});
