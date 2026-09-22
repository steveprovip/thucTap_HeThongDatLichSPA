import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
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
    if (this.running) return;
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

    const due = await this.repo.find({
      where: { status: EmailStatus.PENDING, nextAttemptAt: LessThanOrEqual(new Date()) },
      order: { nextAttemptAt: 'ASC' },
      take: batchSize,
    });

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
