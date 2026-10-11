import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';

/**
 * Thông báo đa kênh tức thì — bộ phát sự kiện miền (domain events) sẵn sàng nối Zalo ZNS / SMS Brandname qua webhook.
 *  - Mỗi sự kiện được ký HMAC-SHA256 (`X-Salon-Signature: sha256=<hex>` trên thân JSON) bằng DISPATCH_WEBHOOK_SECRET để
 *    cổng ZNS/SMS (hoặc n8n / Make / máy chủ trung gian) xác thực nguồn gửi.
 *  - "Bắn và quên": chạy nền, quá DISPATCH_TIMEOUT_MS hoặc lỗi thì thử lại 1 lần rồi ghi log — KHÔNG BAO GIỜ làm hỏng
 *    luồng đặt / xác nhận lịch (lịch đã commit trước khi phát).
 *  - Kênh mock trong bộ nhớ (50 sự kiện gần nhất, GET /api/dispatch/recent) để nghiệm thu khi chưa có tài khoản ZNS/SMS.
 */
export type DomainEventType = 'appointment.created' | 'appointment.confirmed';

export interface AppointmentEventData {
  appointmentId: string;
  code: string;
  status: string;
  source: string;
  startAt: string;
  startAtText: string;
  customerName: string;
  customerPhone: string;
  stylistName: string;
  services: string[];
  estimatedTotal: number;
}

export interface DomainEvent {
  id: string;
  type: DomainEventType;
  occurredAt: string;
  data: AppointmentEventData;
}

export interface DeliveryRecord {
  event: DomainEvent;
  channel: string;
  ok: boolean;
  status: number | null;
  attempts: number;
  error: string | null;
  at: string;
}

/** Chữ ký webhook: sha256=HMAC(secret, thân JSON) — bên nhận tính lại để xác thực. */
export const signPayload = (secret: string, body: string): string => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const RECENT_LIMIT = 50;

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger('EventDispatcher');
  private readonly recentLog: DeliveryRecord[] = [];

  constructor(private readonly config: ConfigService) {}

  private get urls(): string[] { return this.config.get<string[]>('dispatch.webhookUrls') ?? []; }
  private get secret(): string { return this.config.get<string>('dispatch.secret') ?? ''; }
  private get timeoutMs(): number { return this.config.get<number>('dispatch.timeoutMs') ?? 5000; }

  /** Sự kiện gần nhất (kênh mock) — mới nhất trước. */
  recent(): DeliveryRecord[] {
    return [...this.recentLog].reverse();
  }

  /**
   * Phát sự kiện tới mọi kênh. Trả về promise (để kiểm thử chờ được) nhưng nơi gọi KHÔNG cần await — không bao giờ ném lỗi.
   */
  emit(type: DomainEventType, data: AppointmentEventData): Promise<DeliveryRecord[]> {
    const event: DomainEvent = { id: randomUUID(), type, occurredAt: new Date().toISOString(), data };
    const jobs: Promise<DeliveryRecord>[] = [Promise.resolve(this.record(event, 'mock', true, null, 1, null))];
    for (const url of this.urls) jobs.push(this.deliver(event, url));
    return Promise.all(jobs).catch(() => [] as DeliveryRecord[]);
  }

  private record(event: DomainEvent, channel: string, ok: boolean, status: number | null, attempts: number, error: string | null): DeliveryRecord {
    const r: DeliveryRecord = { event, channel, ok, status, attempts, error, at: new Date().toISOString() };
    this.recentLog.push(r);
    if (this.recentLog.length > RECENT_LIMIT) this.recentLog.shift();
    return r;
  }

  private async deliver(event: DomainEvent, url: string): Promise<DeliveryRecord> {
    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Salon-Event': event.type,
      'X-Salon-Delivery': event.id,
      ...(this.secret ? { 'X-Salon-Signature': signPayload(this.secret, body) } : {}),
    };
    let status: number | null = null;
    let error: string | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      attempts = attempt;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
        status = res.status;
        if (res.ok) return this.record(event, `webhook:${new URL(url).host}`, true, status, attempt, null);
        error = `HTTP ${res.status}`;
        if (res.status < 500) break; // 4xx: cấu hình sai, thử lại vô ích
      } catch (e) {
        error = (e as Error).name === 'AbortError' ? `quá ${this.timeoutMs} ms` : (e as Error).message;
      } finally {
        clearTimeout(timer);
      }
    }
    this.logger.warn(`Không gửi được ${event.type} (${event.data.code}) tới webhook: ${error}`);
    return this.record(event, `webhook:${safeHost(url)}`, false, status, attempts, error);
  }
}

const safeHost = (url: string): string => {
  try { return new URL(url).host; } catch { return 'url-không-hợp-lệ'; }
};
