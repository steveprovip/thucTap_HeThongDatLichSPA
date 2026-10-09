import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DbConnection } from '../config/db-connection';
import { backupDatabase, KEEP_BACKUPS } from './backup';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
const execute = jest.mocked(spawnSync);
const conn: DbConnection = {
  host: 'localhost', port: 5432, username: 'salon', password: 'private-password',
  database: 'shop', ssl: false, poolMax: 2, startupTimezone: true,
};

describe('safe database backups', () => {
  let dir: string;
  let oldDir: string | undefined;
  let dockerOnly: boolean;
  let corrupt: boolean;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'salon-backup-test-'));
    oldDir = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    dockerOnly = false;
    corrupt = false;
    execute.mockReset();
    execute.mockImplementation((command, args, options) => {
      const argv = args ?? [];
      const result = { pid: 1, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0, signal: null };
      if (command === 'pg_dump' && dockerOnly) return { ...result, status: 1 };
      if (argv.includes('inspect')) {
        return { ...result, stdout: Buffer.from(JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }] })) };
      }
      const stdio = options?.stdio;
      if (Array.isArray(stdio) && typeof stdio[1] === 'number') writeSync(stdio[1], corrupt ? 'not-an-archive' : 'PGDMP-test-archive');
      return result;
    });
  });

  afterEach(() => {
    if (oldDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = oldDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves TLS certificate verification for a hosted database', () => {
    backupDatabase({ ...conn, host: 'db.example.com', ssl: { rejectUnauthorized: true } }, 'release');
    const dump = execute.mock.calls.find(([cmd, args]) => cmd === 'pg_dump' && args?.includes('-Fc'));
    expect(dump?.[2]?.env?.PGSSLMODE).toBe('verify-full');
  });

  it('does not put the PostgreSQL password in Docker process arguments', () => {
    dockerOnly = true;
    expect(backupDatabase(conn, 'release')?.method).toBe('docker');
    expect(execute.mock.calls.flatMap(([, args]) => args ?? []).join(' ')).not.toContain(conn.password);
    const dump = execute.mock.calls.find(([cmd, args]) => cmd === 'docker' && args?.includes('-Fc'));
    expect(dump?.[2]?.env?.PGPASSWORD).toBe(conn.password);
  });

  it('refuses the default Docker container when its published port is a different database endpoint', () => {
    dockerOnly = true;
    expect(backupDatabase({ ...conn, port: 55432 }, 'release')).toBeNull();
    expect(execute.mock.calls.some(([cmd, args]) => cmd === 'docker' && args?.includes('-Fc'))).toBe(false);
  });

  it('does not use local Docker to back up a remote database', () => {
    dockerOnly = true;
    expect(backupDatabase({ ...conn, host: 'remote.example.com' }, 'release')).toBeNull();
    expect(execute.mock.calls.some(([cmd]) => cmd === 'docker')).toBe(false);
  });

  it('creates different complete files for backups in the same second', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T01:00:00Z'));
    try {
      const first = backupDatabase(conn, 'release');
      const second = backupDatabase(conn, 'release');
      expect(first?.file).not.toBe(second?.file);
      expect(readdirSync(dir)).toHaveLength(2);
      expect(readFileSync(first!.file).subarray(0, 5).toString()).toBe('PGDMP');
    } finally { jest.useRealTimers(); }
  });

  it('rejects corrupt output and removes partial files', () => {
    corrupt = true;
    expect(() => backupDatabase(conn, 'release')).toThrow();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('retention only prunes the current database and preserves unrelated/legacy dumps', () => {
    const unrelated = join(dir, 'shop_archive_legacy.dump');
    writeFileSync(unrelated, 'PGDMP-old-backup');
    const other = backupDatabase({ ...conn, database: 'shop_archive' }, 'release')!;
    for (let i = 0; i < KEEP_BACKUPS + 2; i += 1) backupDatabase(conn, `release-${i}`);
    expect(readFileSync(unrelated, 'utf8')).toBe('PGDMP-old-backup');
    expect(readFileSync(other.file, 'utf8')).toBe('PGDMP-test-archive');
    expect(readdirSync(dir)).toHaveLength(KEEP_BACKUPS + 2);
  });

  it('preserves backups of the same database name on another server', () => {
    const remote = backupDatabase({ ...conn, host: 'production.example.com' }, 'release')!;
    for (let i = 0; i < KEEP_BACKUPS + 2; i += 1) backupDatabase(conn, `release-${i}`);
    expect(readFileSync(remote.file, 'utf8')).toBe('PGDMP-test-archive');
    expect(readdirSync(dir)).toHaveLength(KEEP_BACKUPS + 1);
  });
});
