/**
 * Sao lưu CSDL bằng pg_dump TRƯỚC khi áp dụng migration mới (định dạng nén -Fc, khôi phục bằng pg_restore).
 *
 * Thứ tự thử:
 *   1. pg_dump có sẵn trên máy (PATH);
 *   2. pg_dump bên trong container Docker `salon_postgres` (máy chạy Docker thường không cài sẵn pg_dump).
 * Tệp lưu ở backups/ tại gốc dự án (đã nằm trong .gitignore), giữ lại 14 bản mới nhất cho từng CSDL.
 */
import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { DbConnection } from '../config/db-connection';
import { findProjectRoot } from './sql-files';

export const KEEP_BACKUPS = 14;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Mặc định: thư mục backups/ ở gốc dự án. Đổi bằng BACKUP_DIR (vd. ổ đĩa ngoài). */
export const backupDir = (): string => process.env.BACKUP_DIR?.trim() || join(findProjectRoot(), 'backups');

/** A database-specific prefix prevents one database's retention from deleting another's backups. */
export const backupPrefix = (database: string, endpoint?: Pick<DbConnection, 'host' | 'port'>): string =>
  `${database.replace(/[^\w.-]+/g, '_').slice(0, 60)}-${createHash('sha256').update(JSON.stringify([endpoint?.host, endpoint?.port, database])).digest('hex').slice(0, 12)}_`;

const stamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const hasCommand = (cmd: string, args: string[] = ['--version']): boolean => {
  const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15_000, windowsHide: true });
  return !r.error && r.status === 0;
};

/** A local hostname alone does not prove that the configured database is this container. */
function containerMatchesConnection(container: string, conn: DbConnection): boolean {
  const r = spawnSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], {
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, windowsHide: true,
  });
  if (r.error || r.status !== 0) return false;
  try {
    const ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null> = JSON.parse(r.stdout.toString('utf8'));
    return (ports['5432/tcp'] ?? []).some((p) => Number(p.HostPort) === conn.port &&
      ['', '0.0.0.0', '::', conn.host.replace(/^\[|\]$/g, ''), ...(conn.host === 'localhost' ? ['127.0.0.1', '::1'] : [])].includes(p.HostIp));
  } catch { return false; }
}

function isCustomArchive(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    const magic = Buffer.alloc(5);
    return readSync(fd, magic, 0, magic.length, 0) === magic.length && magic.toString('ascii') === 'PGDMP';
  } finally { closeSync(fd); }
}

export interface BackupResult {
  file: string;
  method: 'pg_dump' | 'docker';
}

/** Trả về null nếu máy không có công cụ sao lưu nào dùng được; ném lỗi nếu có công cụ nhưng sao lưu hỏng. */
export function backupDatabase(conn: DbConnection, tag: string, kind = 'truoc'): BackupResult | null {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const safeTag = tag.replace(/[^\w.-]+/g, '_').slice(0, 60);
  const prefix = backupPrefix(conn.database, conn);
  const safeKind = kind.replace(/[^\w.-]+/g, '_').slice(0, 30);
  const file = join(dir, `${prefix}${[stamp(), randomUUID(), safeKind, safeTag].filter(Boolean).join('_')}.dump`);
  const partial = `${file}.partial`;
  const env = {
    ...process.env, PGPASSWORD: conn.password,
    PGSSLMODE: conn.ssl ? (conn.ssl.rejectUnauthorized ? 'verify-full' : 'require') : 'disable',
  };

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
      args: ['exec', '-e', 'PGPASSWORD', '-e', 'PGSSLMODE', container, 'pg_dump', '-h', '127.0.0.1', '-p', '5432', '-U', conn.username, '-d', conn.database, '-Fc'],
      ok: () => containerMatchesConnection(container, conn) && hasCommand('docker', ['exec', container, 'pg_dump', '--version']),
    });
  }

  let lastError = '';
  for (const a of attempts) {
    if (!a.ok()) continue;
    const fd = openSync(partial, 'wx', 0o600);
    let r;
    try {
      // Ghi thẳng stdout (nhị phân) vào tệp, không qua bộ đệm chuỗi
      r = spawnSync(a.cmd, a.args, { env, stdio: ['ignore', fd, 'pipe'], timeout: 10 * 60_000, windowsHide: true });
    } finally {
      closeSync(fd);
    }
    const valid = existsSync(partial) && isCustomArchive(partial);
    if (!r.error && r.status === 0 && valid) {
      renameSync(partial, file);
      prune(dir, prefix);
      return { file, method: a.method };
    }
    lastError = (r.stderr?.toString('utf8') || r.error?.message || (!valid ? 'tệp không có định dạng PostgreSQL custom archive (PGDMP)' : `mã thoát ${r.status}`)).trim().split('\n').slice(-2).join(' ');
    if (existsSync(partial)) unlinkSync(partial);
  }
  if (lastError) throw new Error(`Sao lưu bằng pg_dump thất bại: ${lastError}`);
  return null;
}

function prune(dir: string, prefix: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.dump'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(KEEP_BACKUPS)) {
    try { unlinkSync(join(dir, old.f)); } catch { /* bỏ qua */ }
  }
}
