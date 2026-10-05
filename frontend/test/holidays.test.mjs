import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  entryPoints: [resolve(root, 'src/api/mockBackend.ts')], bundle: true, write: false,
  platform: 'node', format: 'cjs', alias: { '@': resolve(root, 'src') },
  define: { 'import.meta.env': '{"VITE_DEMO_MODE":"true"}' },
});
const source = bundled.outputFiles[0].text;
const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('en-CA');
};

function demo(storage = new Map()) {
  const module = { exports: {} };
  runInNewContext(source, {
    module, exports: module.exports, crypto: webcrypto, console,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  module.exports.demoRole.set('owner');
  return {
    storage,
    call: async (method, url, data = {}, params = {}) =>
      (await module.exports.mockAdapter({ method, url, data, params })).data.data,
  };
}

test('demo warning excludes completed appointments and does not save or audit; confirmation persists once', async () => {
  const api = demo();
  const dto = { startDate: day(), endDate: day(), reason: ' Lễ ' };
  const warning = await api.call('post', '/holidays', { ...dto, force: false });
  assert.equal(warning.affected, 4);
  assert.equal(warning.codes.length, 4);
  assert.equal((await api.call('get', '/holidays')).length, 0);
  assert.equal((await api.call('get', '/audit-logs', {}, { entityType: 'salon_holiday' })).total, 0);
  const holiday = await api.call('post', '/holidays', { ...dto, force: true });
  assert.equal(holiday.reason, 'Lễ');
  const audit = await api.call('get', '/audit-logs', {}, { entityType: 'salon_holiday' });
  assert.equal(audit.total, 1);
  assert.equal(audit.items[0].entityId, holiday.id);
  assert.equal(audit.items[0].action, 'create');
  assert.equal(audit.items[0].changes.force, true);
  assert.equal((await demo(api.storage).call('get', '/holidays'))[0].id, holiday.id);
});

test('demo holiday without affected appointments hides slots and rejects walk-in, online and reschedule', async () => {
  const api = demo();
  const date = day(13);
  const holiday = await api.call('post', '/holidays', { startDate: date, endDate: date, reason: 'Lễ' });
  assert.ok(holiday.id);
  const available = await api.call('get', '/public/availability', {}, { date, serviceIds: 's5' });
  assert.equal(available.salonClosed, true);
  assert.equal(available.closedReason, 'Lễ');
  assert.equal(available.slots.length, 0);
  const body = { date, time: '10:00', serviceIds: ['s5'], phone: '0987654321', fullName: 'Khách QA' };
  for (const [method, path] of [
    ['post', '/appointments/walk-in'], ['post', '/public/bookings'], ['patch', '/appointments/000006/reschedule'],
  ]) {
    await assert.rejects(api.call(method, path, body), (error) => {
      assert.equal(error.response.status, 400);
      assert.equal(error.response.data.code, 'SALON_CLOSED');
      assert.equal(error.response.data.details.reason, 'Lễ');
      return true;
    });
  }
});

test('demo invalid range does not save or audit', async () => {
  const api = demo();
  await assert.rejects(api.call('post', '/holidays', { startDate: day(2), endDate: day(1), reason: 'Lễ', force: true }),
    (error) => error.response.status === 400);
  assert.equal((await api.call('get', '/holidays')).length, 0);
  assert.equal((await api.call('get', '/audit-logs', {}, { entityType: 'salon_holiday' })).total, 0);
});

test('demo missing working hours treats the salon as closed', async () => {
  const api = demo();
  await api.call('put', '/working-hours', { days: [] });
  const available = await api.call('get', '/public/availability', {}, { date: day(13), serviceIds: 's5' });
  assert.equal(available.salonClosed, true);
  assert.equal(available.slots.length, 0);
});
