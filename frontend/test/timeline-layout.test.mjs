import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [resolve(root, 'src/utils/timelineLayout.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const m = module.exports;
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const packOverlappingAppointments = (arr) => plain(m.packOverlappingAppointments(arr));

test('Overlap Packing: danh sách rỗng trả về rỗng', () => {
  assert.deepEqual(packOverlappingAppointments([]), []);
});

test('Overlap Packing: các lịch không trùng giờ giữ nguyên laneIndex=0, totalLanes=1', () => {
  const apts = [
    { id: '1', startTime: '09:00', totalDurationMinutes: 60 },
    { id: '2', startTime: '10:00', totalDurationMinutes: 30 },
    { id: '3', startTime: '11:00', totalDurationMinutes: 45 },
  ];
  const packed = packOverlappingAppointments(apts);
  assert.equal(packed.length, 3);
  for (const item of packed) {
    assert.equal(item.laneIndex, 0);
    assert.equal(item.totalLanes, 1);
  }
});

test('Overlap Packing: 2 lịch trùng giờ hoàn toàn được chia thành 2 làn (0 và 1, totalLanes=2)', () => {
  const apts = [
    { id: '1', startTime: '09:00', totalDurationMinutes: 60 },
    { id: '2', startTime: '09:00', totalDurationMinutes: 45 },
  ];
  const packed = packOverlappingAppointments(apts);
  assert.equal(packed.length, 2);
  assert.equal(packed[0].laneIndex, 0);
  assert.equal(packed[0].totalLanes, 2);
  assert.equal(packed[1].laneIndex, 1);
  assert.equal(packed[1].totalLanes, 2);
});

test('Overlap Packing: 3 lịch gối đầu nhau được phân cụm và chia làn chính xác', () => {
  const apts = [
    { id: '1', startTime: '09:00', totalDurationMinutes: 60 }, // 09:00 - 10:00 (lane 0)
    { id: '2', startTime: '09:15', totalDurationMinutes: 30 }, // 09:15 - 09:45 (lane 1)
    { id: '3', startTime: '09:45', totalDurationMinutes: 30 }, // 09:45 - 10:15 (reuses lane 1)
  ];
  const packed = packOverlappingAppointments(apts);
  assert.equal(packed.length, 3);
  const byId = Object.fromEntries(packed.map((p) => [p.item.id, p]));
  assert.equal(byId['1'].laneIndex, 0);
  assert.equal(byId['2'].laneIndex, 1);
  assert.equal(byId['3'].laneIndex, 1);
  assert.equal(byId['1'].totalLanes, 2);
  assert.equal(byId['2'].totalLanes, 2);
  assert.equal(byId['3'].totalLanes, 2);
});
