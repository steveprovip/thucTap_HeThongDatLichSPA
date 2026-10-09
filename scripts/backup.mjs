#!/usr/bin/env node
/**
 * Sao lưu CSDL PostgreSQL bằng MỘT lệnh (dùng chung cho Windows / macOS / Linux):
 *
 *   node scripts/backup.mjs        sao lưu ngay -> backups/<csdl-hash>_<thời điểm>_<id>_thu_cong.dump (giữ 14 bản mới nhất/CSDL)
 *
 * Ưu tiên bản backend ĐÃ build (dist/, không cần ts-node, chạy được trên máy vận hành); chưa build thì dùng mã nguồn.
 * Logic sao lưu thật nằm ở backend/src/database/backup.ts (pg_dump trong container salon_postgres hoặc pg_dump của máy).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const IS_WIN = process.platform === 'win32';

const built = existsSync(join(BACKEND, 'dist', 'database', 'backup-cli.js'));
const script = built ? 'backup:prod' : 'backup';
console.log(`> Sao lưu CSDL (${built ? 'bản đã build' : 'mã nguồn, ts-node'}) ...`);
const r = spawnSync('npm', ['run', script, '--prefix', 'backend'], {
  cwd: ROOT, stdio: 'inherit', shell: IS_WIN,
});
process.exit(r.status ?? 1);
