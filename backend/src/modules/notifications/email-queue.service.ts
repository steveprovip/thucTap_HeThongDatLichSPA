import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { backgroundAllowed } from '../../common/utils/activity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmailQueueItem, EmailStatus } from '../../database/entities/email-queue.entity';
import { MailService } from './mail.service';

/**
 * Worker gửi email: chạy mỗi phút, lấy các email tới hạn và gửi.
 * Thất bại thì thử lại tối đa 3 lần, mỗi lần cách nhau 10 phút (S4-05).
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectRepository(EmailQueueItem) private readonly repo: Repository<EmailQueueItem>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDue(): Promise<void> {
    if (!this.config.get<boolean>('mail.workerEnabled')) return;
    if (this.running || !backgroundAllowed('email-queue')) return;
    this.running = true;
    try {
      await this.drain();
    } finally {
      this.running = false;
    }
  }

  /** Xử lý toàn bộ email tới hạn. Tách riêng để bộ kiểm thử gọi trực tiếp. */
  async drain(batchSize = 20): Promise<{ sent: number; failed: number }> {
    const maxAttempts = this.config.get<number>('mail.maxAttempts')!;
    const retryMinutes = this.config.get<number>('mail.retryMinutes')!;

    // QA Sprint 4 · mục 5 (gửi lặp 1 thư 2 lần): khoá `running` chỉ có tác dụng trong MỘT tiến trình. Khi 2 bản API cùng trỏ
    // một CSDL (máy local + đám mây, hoặc dev watch khởi động lại) thì cả 2 cron cùng lấy một thư. Giành quyền gửi nguyên tử:
    // đẩy next_attempt_at lên 5 phút (hợp đồng thuê) với FOR UPDATE SKIP LOCKED → tiến trình khác không thấy thư này nữa;
    // tiến trình chết giữa chừng thì 5 phút sau thư tự quay lại hàng đợi.
    const claimed: Array<{ id: string }> = await this.repo.query(
      `UPDATE email_queue SET next_attempt_at = now() + interval '5 minutes'
        WHERE id IN (SELECT id FROM email_queue WHERE status = $1 AND next_attempt_at <= now()
                      ORDER BY next_attempt_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id`,
      [EmailStatus.PENDING, batchSize],
    ).then((r: unknown) => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r) as Array<{ id: string }>);
    if (!claimed.length) return { sent: 0, failed: 0 };
    const due = await this.repo.find({ where: { id: In(claimed.map((c) => c.id)) }, order: { nextAttemptAt: 'ASC' } });

    let sent = 0;
    let failed = 0;
    for (const item of due) {
      try {
        await this.mail.deliver(item);
        item.status = EmailStatus.SENT;
        item.sentAt = new Date();
        item.attempts += 1;
        item.lastError = null;
        sent += 1;
      } catch (e) {
        item.attempts += 1;
        item.lastError = (e as Error).message.slice(0, 480);
        if (item.attempts >= maxAttempts) {
          item.status = EmailStatus.FAILED;
          failed += 1;
          this.logger.warn(`Gửi email thất bại vĩnh viễn tới ${item.toEmail}: ${item.lastError}`);
        } else {
          item.nextAttemptAt = new Date(Date.now() + retryMinutes * 60_000);
          this.logger.warn(
            `Gửi email tới ${item.toEmail} thất bại lần ${item.attempts}, thử lại sau ${retryMinutes} phút`,
          );
        }
      }
      await this.repo.save(item);
    }
    return { sent, failed };
  }

  /** Trạng thái gửi email của một lịch hẹn, hiển thị trên màn hình lễ tân. */
  async statusForAppointment(appointmentId: string): Promise<EmailQueueItem[]> {
    return this.repo.find({ where: { appointmentId }, order: { createdAt: 'DESC' } });
  }
}
