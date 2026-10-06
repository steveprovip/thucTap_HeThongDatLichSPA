#!/usr/bin/env node
/**
 * Cập nhật phiên bản mới.
 *
 *   node scripts/update.mjs            cập nhật 1 chạm: git pull -> gói npm -> build -> sao lưu + migration -> chạy lại
 *                                      (quy trình đầy đủ, tự quay về bản cũ khi lỗi, nằm trong scripts/launcher.mjs update)
 *   node scripts/update.mjs --check    chỉ KIỂM TRA: in phiên bản hiện tại / mới nhất dạng JSON, không thay đổi gì
 *   node scripts/update.mjs --force    build lại kể cả khi đã là bản mới nhất
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkForUpdate } from './lib/version.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--check')) {
  const info = await checkForUpdate(ROOT, { fetchRemote: true });
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
  process.exit(0);
}

const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'launcher.mjs'), 'update', ...process.argv.slice(2)], {
  cwd: ROOT, stdio: 'inherit',
});
process.exit(r.status ?? 1);
