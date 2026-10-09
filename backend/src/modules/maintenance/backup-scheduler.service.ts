import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { backupDir, backupPrefix } from '../../database/backup';
import { resolveDbConnection } from '../../config/db-connection';

/** Bản build production có sẵn công cụ sao lưu (chế độ phát triển ts-node thì không có). */
const BACKUP_CLI = join(__dirname, '..', '..', 'database', 'backup-cli.js');
const CATCH_UP_DELAY_MS = 3 * 60_000;
const STALE_HOURS = 26;

/**
 * Yêu cầu phi chức năng "Sao lưu": tự sao lưu CSDL MỖI NGÀY lúc 02:00 (giờ Việt Nam), giữ các bản gần nhất.
 * Máy quầy thường TẮT ban đêm nên còn có lượt "bù": máy chủ bật lên mà bản tự động mới nhất đã cũ hơn 26 giờ thì
 * sao lưu sau 3 phút. Chạy công cụ sao lưu ở TIẾN TRÌNH RIÊNG (không chặn API trong lúc pg_dump).
 * BACKUP_DAILY=off để tắt (ví dụ CSDL đám mây đã có sao lưu của nhà cung cấp).
 */
@Injectable()
export class BackupSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private running = false;
  private catchUp: NodeJS.Timeout | null = null;

  private get enabled(): boolean {
    return process.env.BACKUP_DAILY !== 'off' && existsSync(BACKUP_CLI);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.catchUp = setTimeout(() => {
      const last = this.lastAutoBackupAt();
      if (!last || Date.now() - last.getTime() > STALE_HOURS * 3600_000) void this.run('bù do máy tắt lúc 02:00');
    }, CATCH_UP_DELAY_MS);
    this.catchUp.unref();
  }

  onApplicationShutdown(): void {
    if (this.catchUp) clearTimeout(this.catchUp);
  }

  @Cron('0 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async daily(): Promise<void> {
    if (this.enabled) await this.run('hằng ngày 02:00');
  }

  /** Thời điểm bản sao lưu tự động gần nhất (tệp *_tu_dong.dump trong thư mục sao lưu). */
  lastAutoBackupAt(): Date | null {
    try {
      const dir = backupDir();
      const connection = resolveDbConnection();
      const prefix = backupPrefix(connection.database, connection);
      const times = readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('_tu_dong.dump'))
        .map((f) => statSync(join(dir, f)).mtime.getTime());
      return times.length ? new Date(Math.max(...times)) : null;
    } catch {
      return null;
    }
  }

  private run(reason: string): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [BACKUP_CLI, '--label=tu_dong'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
      child.stderr.on('data', (c: Buffer) => { out += c.toString('utf8'); });
      const done = (ok: boolean): void => {
        this.running = false;
        const last = out.trim().split('\n').filter(Boolean).slice(-2).join(' | ');
        if (ok) this.logger.log(`Sao lưu tự động (${reason}) xong: ${last}`);
        else this.logger.error(`Sao lưu tự động (${reason}) THẤT BẠI: ${last || 'không rõ lỗi'}`);
        resolve();
      };
      child.on('error', () => done(false));
      child.on('close', (code) => done(code === 0));
    });
  }
}
