import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Observable, Subject } from 'rxjs';

/**
 * Thông báo "dữ liệu vừa đổi" gửi tới mọi thiết bị đang mở hệ thống.
 * CỐ Ý không mang dữ liệu cá nhân (không tên, không số điện thoại): thiết bị nhận được chỉ biết "có thay đổi" rồi tự
 * tải lại qua các API REST đã có kiểm tra quyền, nên kênh này không thể làm lộ thông tin khách.
 */
/**
 * Loại thay đổi đáng báo riêng cho màn hình nhân viên. 'booking.created' = khách vừa tự đặt lịch trên website (lễ tân nghe
 * chuông báo). Vẫn KHÔNG kèm dữ liệu cá nhân: thiết bị nhận tự tải lại qua REST có kiểm tra quyền.
 */
export type LiveEventKind = 'booking.created';

export interface LiveEvent {
  /** Số thứ tự tăng dần từ lúc máy chủ khởi động. */
  seq: number;
  /** Nhóm dữ liệu đổi (đoạn đầu của đường dẫn: appointments, customers, invoices...). */
  scope: string;
  kind?: LiveEventKind;
  at: string;
}

/**
 * Bus sự kiện nằm trong bộ nhớ của MỘT tiến trình API. Phù hợp với tiệm chạy một máy chủ (Docker tại máy hoặc một
 * dịch vụ Render/Koyeb). Nếu sau này chạy nhiều bản sao API song song thì cần thay bằng Postgres LISTEN/NOTIFY hoặc Redis.
 */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<LiveEvent>();
  /** Đổi mỗi lần khởi động: thiết bị thấy mã khác nghĩa là máy chủ đã khởi động lại và có thể lỡ sự kiện. */
  readonly bootId = randomBytes(4).toString('hex');
  private seq = 0;
  private clients = 0;

  publish(scope: string, kind?: LiveEventKind): void {
    this.seq += 1;
    this.subject.next({ seq: this.seq, scope, ...(kind ? { kind } : {}), at: new Date().toISOString() });
  }

  stream(): Observable<LiveEvent> {
    return this.subject.asObservable();
  }

  /** Dấu phiên bản dữ liệu: các thiết bị không nhận được luồng trực tiếp sẽ hỏi định kỳ và so sánh dấu này. */
  get version(): string {
    return `${this.bootId}:${this.seq}`;
  }

  get currentSeq(): number {
    return this.seq;
  }

  get clientCount(): number {
    return this.clients;
  }

  clientConnected(): void { this.clients += 1; }
  clientDisconnected(): void { this.clients = Math.max(0, this.clients - 1); }
}
