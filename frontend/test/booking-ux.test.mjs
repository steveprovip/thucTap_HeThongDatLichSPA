import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (file) => {
  const out = await build({ entryPoints: [resolve(root, file)], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': resolve(root, 'src') } });
  const module = { exports: {} };
  runInNewContext(out.outputFiles[0].text, { module, exports: module.exports, URL, URLSearchParams, TextEncoder });
  return module.exports;
};
const radar = await load('src/utils/slotRadar.ts');
const cal = await load('src/utils/calendarExport.ts');
const img = await load('src/utils/images.ts');
const clock = await load('src/utils/salonClock.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('Slot Radar: số mốc khả dĩ tôn trọng giờ đóng cửa và thời lượng gói', () => {
  // Buổi tối 17:00–24:00, tiệm đóng 20:00, gói 120 phút → mốc 17:00..18:00 = 5 mốc
  assert.equal(radar.possibleStarts(17 * 60, 24 * 60, 8 * 60, 20 * 60, 120), 5);
  // Buổi sáng, mở 08:30 → mốc đầu 08:30, tới 11:45
  assert.equal(radar.possibleStarts(0, 12 * 60, 8 * 60 + 30, 20 * 60, 30), 14);
  assert.equal(radar.possibleStarts(17 * 60, 24 * 60, 8 * 60, 18 * 60, 90), 0);
});

test('Slot Radar: gom theo buổi, độ trống thật, bỏ khung không còn thợ', () => {
  const slots = [
    { time: '09:00', stylistIds: ['a', 'b'] }, { time: '09:15', stylistIds: ['a'] }, { time: '10:00', stylistIds: [] },
    { time: '13:00', stylistIds: ['a', 'b'] }, { time: '18:00', stylistIds: ['b'] },
  ];
  const view = plain(radar.buildRadar(slots, { open: '09:00', close: '20:00', duration: 60 }));
  assert.deepEqual(view.map((s) => s.slots.map((x) => x.time)), [['09:00', '09:15'], ['13:00'], ['18:00']]);
  // Sáng: mốc 09:00..11:45 = 12 mốc × 2 thợ = 24 chỗ; còn 3 → 0.125
  assert.equal(view[0].capacity, 3 / 24);
  assert.deepEqual(view[0].range, ['09:00', '09:15']);
  assert.equal(radar.capacityLabel(view[0].capacity, 2), 'Sắp kín');
  assert.equal(radar.capacityLabel(0, 0), 'Đã kín');
  assert.equal(radar.freeLevel(2, 2), 3);
  assert.equal(radar.freeLevel(1, 3), 1);
});

test('Slot Radar hôm nay: mốc đã trôi qua không bị tính là "kín", buổi đã qua ghi "Đã qua"', () => {
  // Tiệm trống trơn 08:00–20:00, 3 thợ, gói 60 phút; 15:00 server chỉ trả 16:00..19:00 (đã bỏ mốc trước giờ + thời gian đặt trước)
  const at = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const slots = [];
  for (let t = 16 * 60; t <= 19 * 60; t += 15) slots.push({ time: at(Math.floor(t / 60), t % 60), stylistIds: ['a', 'b', 'c'] });
  const hours = { open: '08:00', close: '20:00', duration: 60 };
  const view = plain(radar.buildRadar(slots, { ...hours, now: 15 * 60 }));
  assert.deepEqual(view.map((s) => s.past), [true, false, false]);
  assert.equal(radar.capacityLabel(view[0].capacity, view[0].slots.length, view[0].past), 'Đã qua');
  // Chiều còn 8 mốc 15:00..16:45 chưa qua (giao diện không biết thời gian đặt trước) — 16:00..16:45 trống cả 3 thợ:
  // 12 / (8 × 3) = 0,5 → "Còn vừa chỗ", không còn "Sắp kín" như khi tính cả các mốc buổi sáng-trưa đã trôi qua
  assert.equal(view[1].capacity, 0.5);
  assert.equal(radar.capacityLabel(view[1].capacity, view[1].slots.length, view[1].past), 'Còn vừa chỗ');
  assert.equal(view[2].capacity, 1);
  // Ngày khác (không truyền now): giữ cách tính cũ, buổi không còn khung là "Đã kín"
  const future = plain(radar.buildRadar(slots, hours));
  assert.deepEqual(future.map((s) => s.past), [false, false, false]);
  assert.equal(radar.capacityLabel(future[0].capacity, future[0].slots.length, future[0].past), 'Đã kín');
  assert.equal(future[1].capacity, 4 / 20);
  // 13:00, chiều kín hết (khung trống đầu tiên 17:00): buổi chiều CHƯA qua → vẫn là "Đã kín"
  const busy = plain(radar.buildRadar(slots.filter((s) => s.time >= '17:00'), { ...hours, now: 13 * 60 }));
  assert.deepEqual(busy.map((s) => s.past), [true, false, false]);
  assert.equal(radar.capacityLabel(busy[1].capacity, busy[1].slots.length, busy[1].past), 'Đã kín');
  // 09:00, các mốc 10:00..11:30 đã kín, sáng chỉ còn 11:45: KHÔNG được lấy khung trống đầu tiên làm cận dưới
  // (mẫu số 1 mốc → "Còn nhiều chỗ") — sáng còn 12 mốc 09:00..11:45 chưa qua → 1/12, vẫn là "Sắp kín"
  const rest = slots.concat(Array.from({ length: 16 }, (_, i) => ({ time: at(12 + Math.floor(i / 4), (i % 4) * 15), stylistIds: ['a', 'b', 'c'] })));
  for (const [ids, now] of [[['a'], 9 * 60], [['a', 'b', 'c'], 9 * 60], [['a'], 8 * 60 + 30]]) {
    const morning = plain(radar.buildRadar([{ time: '11:45', stylistIds: ids }, ...rest], { ...hours, now }))[0];
    assert.equal(morning.slots.length, 1);
    assert.ok(morning.capacity < 0.3, `sáng chỉ còn 1 mốc phải là "Sắp kín" (now=${now}, thợ=${ids.length}, độ trống=${morning.capacity})`);
    assert.equal(radar.capacityLabel(morning.capacity, morning.slots.length, morning.past), 'Sắp kín');
  }
});

test('Slot Radar hôm nay theo mốc máy chủ (đã cộng thời gian đặt trước 60 phút)', () => {
  const hours = { open: '08:00', close: '20:00', duration: 60 };
  const free = (from, to) => {
    const out = [];
    for (let t = from; t <= to; t += 15) out.push({ time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, stylistIds: ['a', 'b', 'c'] });
    return out;
  };
  // 15:00 + 60 phút → mốc sớm nhất 16:00: chiều còn 16:00..16:45 trống cả 3 thợ = trống hoàn toàn, không phải "Còn vừa chỗ"
  const at15 = plain(radar.buildRadar(free(16 * 60, 19 * 60), { ...hours, now: 16 * 60 }));
  assert.equal(at15[1].capacity, 1);
  assert.equal(radar.capacityLabel(at15[1].capacity, at15[1].slots.length, at15[1].past), 'Còn nhiều chỗ');
  // 11:00 + 60 phút → mốc sớm nhất 12:00: buổi sáng (mốc cuối 11:45) đã qua, không phải "Đã kín"
  const at11 = plain(radar.buildRadar(free(12 * 60, 19 * 60), { ...hours, now: 12 * 60 }));
  assert.equal(at11[0].past, true);
  assert.equal(radar.capacityLabel(at11[0].capacity, at11[0].slots.length, at11[0].past), 'Đã qua');
  // Mốc sớm nhất trùng mốc cuối của buổi (11:45) vẫn đặt được → chưa qua; hết chỗ thì là "Đã kín"
  const edge = plain(radar.buildRadar(free(12 * 60, 19 * 60), { ...hours, now: 11 * 60 + 45 }));
  assert.equal(edge[0].past, false);
  assert.equal(radar.capacityLabel(edge[0].capacity, edge[0].slots.length, edge[0].past), 'Đã kín');
});

test('Lịch cá nhân: giờ Việt Nam đổi đúng sang UTC (kể cả qua nửa đêm)', () => {
  assert.equal(cal.toUtcStamp('2026-10-17', '09:30'), '20261017T023000Z');
  assert.equal(cal.toUtcStamp('2026-10-17', '06:15'), '20261016T231500Z');
  const url = new URL(cal.googleCalendarUrl({ uid: 'x', title: 'Hẹn spa', date: '2026-10-17', start: '09:30', end: '11:00', location: 'Q5', details: 'Mã ABC' }));
  assert.equal(url.searchParams.get('dates'), '20261017T023000Z/20261017T040000Z');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
});

test('Tệp .ics hợp lệ RFC 5545: CRLF, thoát ký tự, gập dòng theo byte UTF-8', () => {
  const ics = cal.icsContent({ uid: 'AB12CD34@huongsen', title: 'Hương Sen; cắt tóc, gội', date: '2026-10-17', start: '09:30', end: '11:00',
    location: '128 Nguyễn Văn Cừ, Quận 5', details: 'Mã tra cứu AB12CD34\nGọi 028 3838 6868' }, new Date(Date.UTC(2026, 9, 16, 1, 2, 3)));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.includes('DTSTART:20261017T023000Z\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261016T010203Z'));
  assert.ok(ics.includes('SUMMARY:Hương Sen\\; cắt tóc\\, gội'));
  assert.ok(ics.includes('DESCRIPTION:Mã tra cứu AB12CD34\\nGọi'));
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `dòng quá 75 byte: ${line}`);
  const long = cal.foldLine('DESCRIPTION:' + 'ằ'.repeat(60));
  assert.ok(long.split('\r\n ').every((l, i) => enc.encode(l).length <= (i === 0 ? 75 : 74)));
  assert.equal(long.split('\r\n ').join(''), 'DESCRIPTION:' + 'ằ'.repeat(60)); // không mất / vỡ ký tự
});

test('Ảnh: LQIP và srcset chỉ cho CDN Unsplash', () => {
  const src = 'https://images.unsplash.com/photo-1?w=800&q=80&auto=format&fit=crop';
  const lqip = new URL(img.lqipOf(src));
  assert.equal(lqip.searchParams.get('w'), '24');
  assert.equal(lqip.searchParams.get('blur'), '40');
  assert.equal(img.srcSetOf(src).split(', ').length, 4);
  assert.ok(img.srcSetOf(src).includes('w=1600') && img.srcSetOf(src).endsWith('1600w'));
  assert.equal(img.lqipOf('/uploads/a.jpg'), null);
  assert.equal(img.srcSetOf('/uploads/a.jpg'), undefined);
});

test('Trạng thái mở cửa theo giờ tiệm thật', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, dayLabel: `T${d}`, isClosed: d === 0, openTime: '08:30', closeTime: '20:00' }));
  assert.deepEqual(plain(clock.openState(hours, { dow: 1, minutes: 9 * 60 })), { kind: 'open', closeTime: '20:00' });
  assert.deepEqual(plain(clock.openState(hours, { dow: 1, minutes: 7 * 60 })), { kind: 'later-today', openTime: '08:30' });
  assert.deepEqual(plain(clock.openState(hours, { dow: 6, minutes: 21 * 60 })), { kind: 'closed', next: { dayLabel: 'T1', openTime: '08:30' } });
  assert.deepEqual(plain(clock.openState(hours, { dow: 2, minutes: 21 * 60 })), { kind: 'closed', next: { dayLabel: 'ngày mai', openTime: '08:30' } });
});
