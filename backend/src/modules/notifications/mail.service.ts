import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { EmailKind, EmailQueueItem, EmailStatus } from '../../database/entities/email-queue.entity';
import { SalonInfo } from './mail-templates';

export interface EnqueueMailInput {
  kind: EmailKind;
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  appointmentId?: string | null;
  /** Thời điểm được phép gửi (dùng cho email nhắc trước 24 giờ). */
  scheduledAt?: Date;
}

/**
 * Gửi email qua SMTP (Maildev khi phát triển) theo cơ chế hàng đợi:
 * mọi email được ghi vào bảng email_queue trước, worker gửi và thử lại
 * tối đa 3 lần cách nhau 10 phút (S4-05).
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EmailQueueItem) private readonly queueRepo: Repository<EmailQueueItem>,
  ) {}

  onModuleInit(): void {
    const host = this.config.get<string>('mail.host')!;
    const port = this.config.get<number>('mail.port')!;
    const secure = this.config.get<boolean>('mail.secure')!;
    const user = this.config.get<string>('mail.user')!;
    const password = this.config.get<string>('mail.password')!;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass: password } } : {}),
      tls: { rejectUnauthorized: false },
    });
    this.logger.log(`SMTP cấu hình tới ${host}:${port}`);
  }

  get salonInfo(): SalonInfo {
    return {
      name: this.config.get<string>('app.salonName')!,
      address: this.config.get<string>('app.salonAddress')!,
      hotline: this.config.get<string>('app.salonHotline')!,
      frontendUrl: this.config.get<string>('app.frontendUrl')!,
    };
  }

  /** Đưa email vào hàng đợi. Trả về bản ghi để nơi gọi có thể theo dõi trạng thái. */
  async enqueue(input: EnqueueMailInput): Promise<EmailQueueItem> {
    const scheduledAt = input.scheduledAt ?? new Date();
    const item = this.queueRepo.create({
      kind: input.kind,
      toEmail: input.toEmail,
      toName: input.toName ?? null,
      subject: input.subject,
      bodyHtml: input.html,
      appointmentId: input.appointmentId ?? null,
      status: EmailStatus.PENDING,
      attempts: 0,
      scheduledAt,
      nextAttemptAt: scheduledAt,
    });
    return this.queueRepo.save(item);
  }

  /** Huỷ các email đang chờ của một lịch hẹn (khi lịch bị huỷ hoặc đổi giờ). */
  async cancelPendingFor(appointmentId: string, kinds?: EmailKind[]): Promise<void> {
    const qb = this.queueRepo
      .createQueryBuilder()
      .update(EmailQueueItem)
      .set({ status: EmailStatus.CANCELLED })
      .where('appointment_id = :id', { id: appointmentId })
      .andWhere('status = :st', { st: EmailStatus.PENDING });
    if (kinds?.length) qb.andWhere('kind IN (:...kinds)', { kinds });
    await qb.execute();
  }

  /** Gửi thật qua SMTP. Ném lỗi khi thất bại để worker đếm số lần thử. */
  async deliver(item: EmailQueueItem): Promise<void> {
    const fromName = this.config.get<string>('mail.fromName');
    const fromAddress = this.config.get<string>('mail.fromAddress');
    await this.transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: item.toName ? `"${item.toName}" <${item.toEmail}>` : item.toEmail,
      subject: item.subject,
      html: item.bodyHtml,
    });
  }
}
