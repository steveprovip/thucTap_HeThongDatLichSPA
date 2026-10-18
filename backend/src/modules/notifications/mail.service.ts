import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { networkInterfaces } from 'node:os';
import { EmailKind, EmailQueueItem, EmailStatus } from '../../database/entities/email-queue.entity';
import { SalonInfo } from './mail-templates';

/** Trạng thái gửi thư cho trang quản lý (ghi chú test 13/10: "email chưa nhận được thông báo"). */
export interface MailStatus {
  /** 'test-inbox' = MailDev trên máy (localhost:1025): thư KHÔNG ra Internet; 'api' = API HTTPS của Brevo. */
  mode: 'test-inbox' | 'smtp' | 'api';
  host: string;
  fromAddress: string;
  /** Hộp thư thử nghiệm để xem thư đã "gửi" khi đang ở chế độ test-inbox. */
  testInboxUrl: string | null;
  sent24h: number;
  failed24h: number;
  pending: number;
  lastError: string | null;
}

/** Lỗi SMTP → lời giải thích tiếng Việt, kèm cách sửa. */
export function explainMailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === 'EAUTH' || err?.responseCode === 535 || /auth|password|credentials|Username and Password/i.test(msg)) {
    if (/brevo/i.test(msg)) return 'Brevo từ chối API key (BREVO_API_KEY sai hoặc đã bị thu hồi) — tạo key mới trong Brevo > SMTP & API.';
    return 'Máy chủ thư từ chối đăng nhập: kiểm tra địa chỉ Gmail và MẬT KHẨU ỨNG DỤNG 16 ký tự (không phải mật khẩu Gmail thường; '
      + 'tài khoản phải bật Xác minh 2 bước). Sửa trong HoYoSalon > ⚙ Thiết lập cửa hàng.';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'EDNS'].includes(err?.code ?? '') || /ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(msg)) {
    return `Không kết nối được máy chủ gửi thư (${msg.slice(0, 120)}). Kiểm tra mạng / tường lửa, hoặc MailDev chưa chạy.`;
  }
  return msg.slice(0, 300);
}

/**
 * QA Sprint 4 · mục 4 ("liên kết gửi cho khách qua mail không hoạt động"): FRONTEND_URL = localhost chỉ mở được trên
 * chính máy chạy tiệm; khách / tester mở thư trên điện thoại, máy khác → "không thể kết nối localhost".
 * Ưu tiên MAIL_LINK_BASE_URL; còn localhost thì thay bằng IP mạng LAN (Vite đã mở `host: true`) để thiết bị cùng Wi-Fi mở được.
 */
export function mailLinkBase(frontendUrl: string, env: NodeJS.ProcessEnv = process.env,
  nets: ReturnType<typeof networkInterfaces> = networkInterfaces()): string {
  if (env.MAIL_LINK_BASE_URL) return env.MAIL_LINK_BASE_URL.replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(frontendUrl); } catch { return frontendUrl; }
  if (env.NODE_ENV === 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return frontendUrl.replace(/\/+$/, '');
  const lan = Object.values(nets).flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'));
  if (!lan) return frontendUrl.replace(/\/+$/, '');
  url.hostname = lan.address;
  return url.toString().replace(/\/+$/, '');
}

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
      frontendUrl: mailLinkBase(this.config.get<string>('app.frontendUrl')!),
    };
  }

  /** Đưa email vào hàng đợi. Trả về bản ghi để nơi gọi có thể theo dõi trạng thái. */
  async enqueue(input: EnqueueMailInput): Promise<EmailQueueItem> {
    const scheduledAt = input.scheduledAt ?? new Date();
    // QA Sprint 4 · mục 5: cùng một thư (y hệt nội dung) tới cùng người trong 2 phút = bấm đúp / gọi lặp → không xếp hàng lần 2.
    const recent = await this.queueRepo.find({
      where: { kind: input.kind, toEmail: input.toEmail, subject: input.subject, createdAt: MoreThan(new Date(Date.now() - 120_000)) },
    });
    const dup = recent.find((r) => r.bodyHtml === input.html && r.status !== EmailStatus.CANCELLED
      && (r.appointmentId ?? null) === (input.appointmentId ?? null));
    if (dup) return dup;
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

  /** Đang gửi vào MailDev trên máy (cấu hình mặc định khi phát triển)? */
  get mode(): MailStatus['mode'] {
    if (this.config.get<string>('mail.brevoApiKey')) return 'api';
    const host = (this.config.get<string>('mail.host') ?? '').toLowerCase();
    const port = this.config.get<number>('mail.port');
    return ['localhost', '127.0.0.1', '::1', 'maildev'].includes(host) && Number(port) === 1025 ? 'test-inbox' : 'smtp';
  }

  async status(): Promise<MailStatus> {
    const since = new Date(Date.now() - 86_400_000);
    const [sent24h, failed24h, pending, last] = await Promise.all([
      this.queueRepo.count({ where: { status: EmailStatus.SENT, sentAt: MoreThan(since) } }),
      this.queueRepo.count({ where: { status: EmailStatus.FAILED, createdAt: MoreThan(since) } }),
      this.queueRepo.count({ where: { status: EmailStatus.PENDING } }),
      this.queueRepo.createQueryBuilder('q').where('q.last_error IS NOT NULL').orderBy('q.created_at', 'DESC').limit(1).getOne(),
    ]);
    const mode = this.mode;
    return {
      mode, host: mode === 'api' ? 'api.brevo.com' : this.config.get<string>('mail.host') ?? '', fromAddress: this.config.get<string>('mail.fromAddress') ?? '',
      testInboxUrl: mode === 'test-inbox' ? 'http://localhost:1080' : null,
      sent24h, failed24h, pending, lastError: last?.lastError ?? null,
    };
  }

  /** Gửi NGAY một thư thử (không qua hàng đợi) để chủ tiệm kiểm tra cấu hình Gmail; lỗi được giải thích tiếng Việt. */
  async sendTest(to: string): Promise<{ ok: true; mode: MailStatus['mode'] }> {
    const salon = this.salonInfo;
    try {
      await this.send(to, null, `[${salon.name}] Thư thử — hệ thống gửi email đã hoạt động`,
        `<p>Xin chào,</p><p>Đây là thư thử từ hệ thống đặt lịch <b>${salon.name}</b>. Nhận được thư này nghĩa là khách hàng `
          + 'và nhân viên sẽ nhận được email xác nhận, nhắc lịch, mật khẩu tạm… như bình thường.</p>'
          + `<p>Gửi lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>`);
    } catch (e) {
      throw new Error(explainMailError(e));
    }
    return { ok: true, mode: this.mode };
  }

  /** Gửi thật qua SMTP. Ném lỗi khi thất bại để worker đếm số lần thử. */
  async deliver(item: EmailQueueItem): Promise<void> {
    await this.send(item.toEmail, item.toName, item.subject, item.bodyHtml);
  }

  /** SMTP, hoặc API HTTPS của Brevo khi có BREVO_API_KEY (hosting miễn phí chặn cổng SMTP). */
  private async send(toEmail: string, toName: string | null, subject: string, html: string): Promise<void> {
    const fromName = this.config.get<string>('mail.fromName') ?? '';
    const fromAddress = this.config.get<string>('mail.fromAddress') ?? '';
    const apiKey = this.config.get<string>('mail.brevoApiKey');
    if (apiKey) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: fromName, email: fromAddress },
          to: [{ email: toEmail, ...(toName ? { name: toName } : {}) }],
          subject, htmlContent: html,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        throw Object.assign(new Error(`Brevo từ chối gửi thư (HTTP ${res.status}): ${detail}`), {
          code: res.status === 401 ? 'EAUTH' : 'EBREVO', responseCode: res.status,
        });
      }
      return;
    }
    await this.transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      subject,
      html,
    });
  }
}
