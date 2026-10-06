/**
 * Kiểm thử mô-đun dùng chung của Launcher (chạy: node --test scripts/lib/test/).
 * Không cần gói npm, không cần mạng.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { compareSemver, latestTag, parseSemver, readChangelog } from '../version.mjs';
import { crc32, createZip, redactEnv } from '../diagnostics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('so sánh phiên bản theo semver, không theo thứ tự chữ', () => {
  assert.deepEqual(parseSemver('v1.3.6'), [1, 3, 6]);
  assert.equal(parseSemver('release-1'), null);
  assert.ok(compareSemver('v1.10.0', 'v1.9.9') > 0);
  assert.ok(compareSemver('1.4.0', 'v1.4.0') === 0);
  assert.ok(compareSemver('v1.3.6', 'v1.4.0') < 0);
  assert.equal(latestTag(['v1.2.5', 'v1.10.0', 'v1.9.0', 'ghi-chu']), 'v1.10.0');
});

test('đọc CHANGELOG.md của dự án: bản mới nhất ở đầu, có mục và nội dung', () => {
  const list = readChangelog(ROOT);
  assert.ok(list.length >= 2);
  assert.match(list[0].version, /^v\d+\.\d+\.\d+$/);
  assert.ok(compareSemver(list[0].version, list[1].version) > 0);
  assert.ok(list[0].sections.length > 0 && list[0].sections[0].items.length > 0);
  assert.ok(!list[0].sections.flatMap((s) => s.items).some((i) => i.includes('**')), 'đã bỏ ký hiệu markdown');
});

test('ẩn mọi giá trị bí mật trong .env, giữ nguyên tên biến và biến thường', () => {
  const out = redactEnv('PORT=3000\nDB_PASSWORD=salon123\nJWT_ACCESS_SECRET=abc\nDATABASE_URL=postgres://u:p@h/db\nGEMINI_API_KEY=\n# ghi chú');
  assert.equal(out, 'PORT=3000\nDB_PASSWORD=***\nJWT_ACCESS_SECRET=***\nDATABASE_URL=***\nGEMINI_API_KEY=\n# ghi chú');
});

test('CRC-32 chuẩn và tệp ZIP đọc được bằng công cụ unzip / giải nén lại đúng nội dung', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const zip = createZip([{ name: 'logs/a.log', data: 'xin chào\n'.repeat(50) }, { name: 'thông-tin.txt', data: Buffer.from('ok') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const nameLen = zip.readUInt16LE(26);
  const compLen = zip.readUInt32LE(18);
  const data = inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + compLen)).toString('utf8');
  assert.equal(data, 'xin chào\n'.repeat(50));
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const file = join(dir, 'system_logs.zip');
  writeFileSync(file, zip);
  const unzip = spawnSync('unzip', ['-t', file], { encoding: 'utf8' });
  if (!unzip.error) assert.equal(unzip.status, 0, unzip.stdout);
});
