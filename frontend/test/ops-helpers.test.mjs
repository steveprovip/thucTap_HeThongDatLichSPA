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

test('phân trang: dãy số trang có "…", câu "Hiển thị X – Y trên tổng số Z"', () => {
  const { pageItems, rangeText } = module.exports;
  const items = (p, n) => JSON.parse(JSON.stringify(pageItems(p, n)));
  assert.deepEqual(items(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(items(5, 10), [1, '…', 4, 5, 6, '…', 10]);
  assert.deepEqual(items(1, 10), [1, 2, 3, 4, '…', 10]);
  assert.deepEqual(items(10, 10), [1, '…', 7, 8, 9, 10]);
  assert.deepEqual(items(3, 9), [1, 2, 3, 4, '…', 9]);
  assert.equal(rangeText(2, 20, 135), 'Hiển thị 21 – 40 trên tổng số 135 bản ghi');
  assert.equal(rangeText(7, 20, 135), 'Hiển thị 121 – 135 trên tổng số 135 bản ghi');
  assert.equal(rangeText(1, 10, 0), 'Không có bản ghi nào');
});

test('bảng ca: phân loại ca, ca mẫu một chạm cắt theo giờ mở cửa, độ phủ tuần', () => {
  const { shiftKind, presetShift, weekCoveragePercent } = module.exports;
  assert.equal(shiftKind('08:00', '14:00'), 'morning');
  assert.equal(shiftKind('14:00', '20:00'), 'afternoon');
  assert.equal(shiftKind('09:00', '18:00'), 'full');
  assert.equal(shiftKind('17:00', '21:00'), 'afternoon');
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(presetShift('morning', '08:30', '20:00')), { startTime: '08:30', endTime: '14:00', breakStart: null, breakEnd: null });
  assert.deepEqual(plain(presetShift('full', '08:30', '20:00')), { startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' });
  assert.deepEqual(plain(presetShift('afternoon', '08:00', '19:00')), { startTime: '14:00', endTime: '19:00', breakStart: null, breakEnd: null });
  assert.equal(presetShift('afternoon', '08:00', '14:30'), null, 'còn dưới 60 phút → không có ca mẫu');
  assert.equal(presetShift('morning', null, null), null);
  assert.equal(weekCoveragePercent([
    { closedReason: null, openMinutes: 600, coveredMinutes: 600 },
    { closedReason: null, openMinutes: 600, coveredMinutes: 504 },
    { closedReason: 'Nghỉ lễ', openMinutes: 0, coveredMinutes: 0 },
  ]), 92);
});
