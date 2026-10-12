/** Kiểm thử an toàn cập nhật (chạy: npm run test:launcher). Không cần mạng, không cần gói npm. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  acquireUpdateLock, destructiveStatements, migrationPreflight, recordUpdate, releaseUpdateLock, smokeFailures, SMOKE_CHECKS, UPDATE_LOCK, upBody,
} from '../update-safety.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('khoá cập nhật: lần cập nhật thứ hai bị từ chối khi lần đầu còn chạy; khoá kẹt (PID chết / quá 2 giờ) được giành lại', () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-lock-'));
  try {
    assert.deepEqual(acquireUpdateLock(dir, { pid: 111, now: 1_000, isAlive: () => true }), { ok: true });
    const second = acquireUpdateLock(dir, { pid: 222, now: 2_000, isAlive: () => true });
    assert.equal(second.ok, false);
    assert.equal(second.holder.pid, 111);
    // tiến trình giữ khoá đã chết (mất điện, tắt cửa sổ) → giành lại được
    assert.equal(acquireUpdateLock(dir, { pid: 222, now: 3_000, isAlive: () => false }).ok, true);
    // khoá quá 2 giờ → coi như kẹt
    assert.equal(acquireUpdateLock(dir, { pid: 333, now: 3_000 + 3 * 3600_000, isAlive: () => true }).ok, true);
    releaseUpdateLock(dir, { pid: 999 }); // không phải chủ khoá → giữ nguyên
    assert.ok(existsSync(join(dir, UPDATE_LOCK)));
    releaseUpdateLock(dir, { pid: 333 });
    assert.ok(!existsSync(join(dir, UPDATE_LOCK)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preflight migration: chỉ xét up(), bỏ qua DROP ... trong down() và thao tác dựng lại được', () => {
  const additive = `export class A { async up(q) { await q.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)');
    await q.query('ALTER TABLE v DROP CONSTRAINT IF EXISTS c'); await q.query('DROP INDEX IF EXISTS ix'); }
    async down(q) { await q.query('ALTER TABLE services DROP COLUMN IF EXISTS image_url'); } }`;
  assert.deepEqual(destructiveStatements(additive), []);
  assert.ok(!upBody(additive).includes('DROP COLUMN'));
  const breaking = `export class B { async up(q) { await q.query('ALTER TABLE customers DROP COLUMN note');
    await q.query('ALTER TABLE appointments ALTER COLUMN code TYPE VARCHAR(12)'); await q.query('ALTER TABLE x RENAME COLUMN a TO b'); }
    async down(q) {} }`;
  assert.deepEqual(destructiveStatements(breaking), ['xoá cột', 'đổi kiểu cột', 'đổi tên bảng / cột']);
  assert.deepEqual(migrationPreflight([{ path: 'a.ts', source: additive }, { path: 'b.ts', source: breaking }]).map((x) => x.path), ['b.ts']);
});

test('preflight trên migration thật của dự án: không có migration nào phá huỷ ở up()', () => {
  const dir = join(ROOT, 'backend', 'src', 'database', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => ({ path: f, source: readFileSync(join(dir, f), 'utf8') }));
  assert.ok(files.length > 5);
  // Trigger "BEFORE TRUNCATE" (chặn xoá) và chữ TRUNCATE trong RAISE EXCEPTION không phải câu lệnh xoá
  assert.deepEqual(migrationPreflight(files), []);
  const wipe = "async up(q) { await q.query('TRUNCATE TABLE rate_limits'); await q.query(`DELETE FROM slot_holds`); } async down() {}";
  assert.deepEqual(destructiveStatements(wipe), ['xoá sạch bảng', 'xoá dữ liệu']);
});

test('smoke test: mọi API khách dùng thật phải trả 2xx và đúng nội dung', () => {
  assert.deepEqual(SMOKE_CHECKS.map((c) => c.path), ['/health', '/api/public/salon-info', '/api/public/catalog', '/api/public/assistant/chat']);
  const health = SMOKE_CHECKS[0];
  assert.equal(health.check({ status: 'ok', database: 'up' }), true);
  assert.equal(health.check({ success: true, data: { status: 'ok', database: 'up' } }), true); // dạng bọc thật của API
  assert.equal(health.check({ status: 'degraded', database: 'down' }), false);
  assert.deepEqual(smokeFailures([
    { name: 'API + CSDL', status: 200, ok: true },
    { name: 'danh mục dịch vụ', status: 500, ok: false },
    { name: 'trợ lý AI khách', status: 0, ok: false },
  ]), ['danh mục dịch vụ (HTTP 500)', 'trợ lý AI khách (HTTP không phản hồi)']);
});

test('nhật ký cập nhật: mỗi lần một dòng JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'salon-hist-'));
  try {
    const file = recordUpdate(dir, { from: 'aaa', to: 'bbb', result: 'ok', seconds: 42 });
    recordUpdate(dir, { from: 'bbb', to: 'ccc', result: 'rollback' });
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].to, 'bbb');
    assert.equal(lines[1].result, 'rollback');
    assert.ok(lines[0].at);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
