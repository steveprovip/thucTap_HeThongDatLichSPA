import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [resolve(root, 'src/utils/opsHelpers.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, Intl });
const { describeAppointmentChange: rawDescribe, sortPending: rawSort } = module.exports;
// Kết quả tạo trong vm context khác realm → chuẩn hoá về realm hiện tại trước khi deepStrictEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));
const describeAppointmentChange = (c) => plain(rawDescribe(c));
const sortPending = (items, mode) => plain(rawSort(items, mode));

test('lịch sử thay đổi hiển thị tiếng Việt, không lộ tên cột kỹ thuật', () => {
  assert.deepEqual(describeAppointmentChange({ field: 'status', oldValue: 'pending', newValue: 'confirmed' }),
    { label: 'Trạng thái', from: 'Chờ xác nhận', to: 'Đã xác nhận' });
  assert.equal(describeAppointmentChange({ field: 'start_at', oldValue: '09:00', newValue: '14:30' }).label, 'Giờ hẹn');
  assert.equal(describeAppointmentChange({ field: 'stylist', oldValue: null, newValue: 'Hà' }).from, '—');
  assert.equal(describeAppointmentChange({ field: 'xyz', oldValue: 'a', newValue: 'b' }).label, 'Cập nhật');
});

test('Chờ xác nhận: lịch quá hạn 12 giờ luôn lên đầu, rồi theo lựa chọn sắp xếp', () => {
  const items = [
    { id: 'a', startAt: '2026-10-12T02:00:00Z', customer: { fullName: 'Trần Bình' } },
    { id: 'b', startAt: '2026-10-11T02:00:00Z', customer: { fullName: 'Ánh Dương' }, pendingOverdue: true },
    { id: 'c', startAt: '2026-10-13T02:00:00Z', customer: { fullName: 'An Khang' } },
    { id: 'd', startAt: '2026-10-14T02:00:00Z', customer: { fullName: 'Đỗ Mai' }, pendingOverdue: true },
  ];
  assert.deepEqual(sortPending(items, 'start_asc').map((x) => x.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(sortPending(items, 'start_desc').map((x) => x.id), ['d', 'b', 'c', 'a']);
  // A–Z theo tiếng Việt: "Ánh" đứng cạnh "An", "Đ" sau "D"
  assert.deepEqual(sortPending(items, 'name_asc').map((x) => x.id), ['b', 'd', 'c', 'a']);
  assert.equal(items[0].id, 'a', 'không sửa mảng gốc');
});
