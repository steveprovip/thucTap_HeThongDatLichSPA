/**
 * Sao lưu CSDL bằng pg_dump TRƯỚC khi áp dụng migration mới (định dạng nén -Fc, khôi phục bằng pg_restore).
 *
 * Thứ tự thử:
 *   1. pg_dump có sẵn trên máy (PATH);
 *   2. pg_dump bên trong container Docker `salon_postgres` (máy chạy Docker thường không cài sẵn pg_dump).
 * Tệp lưu ở backups/ tại gốc dự án (đã nằm trong .gitignore), giữ lại 15 bản mới nhất.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { DbConnection } from '../config/db-connection';
import { findProjectRoot } from './sql-files';

export const KEEP_BACKUPS = 15;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Mặc định: thư mục backups/ ở gốc dự án. Đổi bằng BACKUP_DIR (vd. ổ đĩa ngoài). */
export const backupDir = (): string => process.env.BACKUP_DIR?.trim() || join(findProjectRoot(), 'backups');

const stamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const hasCommand = (cmd: string, args: string[] = ['--version']): boolean => {
  const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15_000, windowsHide: true });
  return !r.error && r.status === 0;
};

export interface BackupResult {
  file: string;
  method: 'pg_dump' | 'docker';
}

/** Trả về null nếu máy không có công cụ sao lưu nào dùng được; ném lỗi nếu có công cụ nhưng sao lưu hỏng. */
export function backupDatabase(conn: DbConnection, tag: string, kind = 'truoc'): BackupResult | null {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const safeTag = tag.replace(/[^\w.-]+/g, '_').slice(0, 60);
  const file = join(dir, `${[conn.database, stamp(), kind, safeTag].filter(Boolean).join('_')}.dump`);
  const env = { ...process.env, PGPASSWORD: conn.password, ...(conn.ssl ? { PGSSLMODE: 'require' } : {}) };

  const attempts: Array<{ method: BackupResult['method']; cmd: string; args: string[]; ok: () => boolean }> = [
    {
      method: 'pg_dump',
      cmd: 'pg_dump',
      args: ['-h', conn.host, '-p', String(conn.port), '-U', conn.username, '-d', conn.database, '-Fc'],
      ok: () => hasCommand('pg_dump'),
    },
  ];
  const container = process.env.DB_CONTAINER ?? 'salon_postgres';
  if (LOCAL_HOSTS.has(conn.host)) {
    attempts.push({
      method: 'docker',
      cmd: 'docker',
      args: ['exec', '-e', `PGPASSWORD=${conn.password}`, container, 'pg_dump', '-U', conn.username, '-d', conn.database, '-Fc'],
      ok: () => hasCommand('docker', ['exec', container, 'pg_dump', '--version']),
    });
  }

  let lastError = '';
  for (const a of attempts) {
    if (!a.ok()) continue;
    const fd = openSync(file, 'w');
    let r;
    try {
      // Ghi thẳng stdout (nhị phân) vào tệp, không qua bộ đệm chuỗi
      r = spawnSync(a.cmd, a.args, { env, stdio: ['ignore', fd, 'pipe'], timeout: 10 * 60_000, windowsHide: true });
    } finally {
      closeSync(fd);
    }
    const size = existsSync(file) ? statSync(file).size : 0;
    if (!r.error && r.status === 0 && size > 0) {
      prune(dir);
      return { file, method: a.method };
    }
    lastError = (r.stderr?.toString('utf8') || r.error?.message || `mã thoát ${r.status}`).trim().split('\n').slice(-2).join(' ');
    if (existsSync(file)) unlinkSync(file);
  }
  if (lastError) throw new Error(`Sao lưu bằng pg_dump thất bại: ${lastError}`);
  return null;
}

function prune(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.dump'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(KEEP_BACKUPS)) {
    try { unlinkSync(join(dir, old.f)); } catch { /* bỏ qua */ }
  }
}
