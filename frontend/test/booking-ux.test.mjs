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
