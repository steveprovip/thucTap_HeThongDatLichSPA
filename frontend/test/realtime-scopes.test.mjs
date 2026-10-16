import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [resolve(root, 'src/utils/realtimeScopes.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const { domainsOf, missedSince, scopeOfUrl, shouldSync } = module.exports;

test('Phân kênh: đổi bảng giá không làm danh sách lịch hẹn tải lại', () => {
  const list = ['appointments', 'shifts', 'invoices'];
  assert.equal(shouldSync({ scope: 'services' }, list), false);
  assert.equal(shouldSync({ scope: 'service-categories' }, list), false);
  assert.equal(shouldSync({ scope: 'appointments' }, list), true);
  assert.equal(shouldSync({ scope: 'invoices' }, ['appointments']), true); // chốt hoá đơn đổi trạng thái lịch
  assert.equal(shouldSync({ scope: 'vouchers' }, ['shifts']), false);
});

test('Phân kênh: thiếu phạm vi hoặc phạm vi lạ → luôn làm mới (an toàn hơn bỏ sót)', () => {
  assert.equal(shouldSync({}, ['shifts']), true);
  assert.equal(shouldSync(undefined, ['shifts']), true);
  assert.equal(shouldSync({ scope: 'something-new' }, ['shifts']), true);
  assert.equal(domainsOf('something-new'), null);
  assert.equal(shouldSync({ scope: 'services' }, ['general']), true);
});

test('scopeOfUrl khớp RealtimeInterceptor ở máy chủ', () => {
  assert.equal(scopeOfUrl('/appointments/9/confirm'), 'appointments');
  assert.equal(scopeOfUrl('appointments?page=2'), 'appointments');
  assert.equal(scopeOfUrl('/public/bookings'), 'appointments');
  assert.equal(scopeOfUrl('/stylists/1/time-off'), 'time-off');
  assert.equal(scopeOfUrl('/invoices/3/pay'), 'invoices');
  assert.equal(scopeOfUrl(''), undefined);
});

test('Nối lại luồng: chỉ làm mới khi đã lỡ sự kiện', () => {
  const at = { bootId: 'a1', seq: 41 };
  assert.equal(missedSince(at, { bootId: 'a1', seq: 41 }), false); // nối lại theo lịch 20 phút, không có gì đổi
  assert.equal(missedSince(at, { bootId: 'a1', seq: 44 }), true); // có 3 thay đổi trong lúc mất kết nối
  assert.equal(missedSince(at, { bootId: 'b2', seq: 41 }), true); // máy chủ khởi động lại
  assert.equal(missedSince(null, at), true);
});
