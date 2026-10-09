import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { backupPrefix } from '../../database/backup';
import { resolveDbConnection } from '../../config/db-connection';
import { BackupSchedulerService } from './backup-scheduler.service';

it('daily backup freshness ignores another database and unfinished dumps', () => {
  const oldDir = process.env.BACKUP_DIR;
  const dir = mkdtempSync(join(tmpdir(), 'salon-scheduler-'));
  process.env.BACKUP_DIR = dir;
  try {
    const connection = resolveDbConnection();
    const current = backupPrefix(connection.database, connection);
    const own = join(dir, `${current}test_tu_dong.dump`);
    writeFileSync(own, 'PGDMP');
    utimesSync(own, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    writeFileSync(join(dir, `${backupPrefix('other-db')}test_tu_dong.dump`), 'PGDMP');
    writeFileSync(join(dir, `${current}new_tu_dong.dump.partial`), 'PGDMP');
    expect(new BackupSchedulerService().lastAutoBackupAt()?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  } finally {
    if (oldDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = oldDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
