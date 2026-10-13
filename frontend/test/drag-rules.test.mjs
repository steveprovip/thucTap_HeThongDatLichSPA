import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [resolve(root, 'src/utils/dragRules.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const m = module.exports;
// Mảng / đối tượng tạo trong vm khác "realm" → chuẩn hoá qua JSON trước khi so sánh sâu
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const boardMove = (a, b) => plain(m.boardMove(a, b));
const { snapStart, minutesToHHmm } = m;
const TIMELINE_DRAGGABLE = plain(m.TIMELINE_DRAGGABLE);

test('Kanban: mỗi bước kéo ứng với đúng API trạng thái', () => {
  assert.deepEqual(boardMove('pending', 'confirmed'), { ok: true, actions: ['confirm'], needsReason: false, label: 'Xác nhận lịch' });
  assert.deepEqual(boardMove('pending', 'arrived').actions, ['confirm', 'checkIn']);
  assert.deepEqual(boardMove('confirmed', 'arrived').actions, ['checkIn']);
  assert.deepEqual(boardMove('arrived', 'in_progress').actions, ['start']);
  assert.deepEqual(boardMove('in_progress', 'completed').actions, ['complete']);
  assert.deepEqual(boardMove('confirmed', 'no_show').actions, ['noShow']);
  assert.deepEqual(boardMove('no_show', 'confirmed').actions, ['undoNoShow']);
});

test('Kanban: huỷ / từ chối bắt buộc nhập lý do', () => {
  assert.equal(boardMove('pending', 'cancelled').needsReason, true);
  assert.deepEqual(boardMove('pending', 'cancelled').actions, ['reject']);
  assert.equal(boardMove('confirmed', 'cancelled').needsReason, true);
  assert.deepEqual(boardMove('arrived', 'cancelled').actions, ['cancel']);
});

test('Kanban: bước sai luồng bị chặn kèm lý do dễ hiểu; thả lại chỗ cũ không làm gì', () => {
  assert.equal(boardMove('confirmed', 'confirmed'), null);
  for (const [from, to] of [['confirmed', 'in_progress'], ['pending', 'completed'], ['completed', 'confirmed'], ['cancelled', 'pending'],
    ['in_progress', 'cancelled'], ['pending', 'no_show'], ['arrived', 'confirmed'], ['no_show', 'arrived']]) {
    const r = boardMove(from, to);
    assert.equal(r.ok, false, `${from} → ${to} phải bị chặn`);
    assert.ok(r.reason.length > 10);
  }
  assert.match(boardMove('confirmed', 'in_progress').reason, /check-in/);
});

test('Lịch ngày: kéo dọc bắt bước 15 phút, không ra ngoài giờ mở cửa', () => {
  // ô 15′ cao 30px; mở 08:00 (480) – đóng 20:00 (1200); lịch 60′ lúc 10:00
  assert.equal(snapStart(600, 0, 30, 15, 480, 1200, 60), 600);
  assert.equal(snapStart(600, 44, 30, 15, 480, 1200, 60), 615); // 44px ≈ 1,5 ô → làm tròn 1 ô
  assert.equal(snapStart(600, 46, 30, 15, 480, 1200, 60), 630);
  assert.equal(snapStart(600, -1000, 30, 15, 480, 1200, 60), 480); // không trước giờ mở
  assert.equal(snapStart(600, 5000, 30, 15, 480, 1200, 60), 1140); // kết thúc không quá giờ đóng
  assert.equal(minutesToHHmm(615), '10:15');
  assert.deepEqual([...TIMELINE_DRAGGABLE], ['pending', 'confirmed', 'arrived']);
});
