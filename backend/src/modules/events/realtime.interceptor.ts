import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventsService, LiveEventKind } from './events.service';

/**
 * Đường dẫn API mà một thao tác GHI thành công lên đó làm thay đổi dữ liệu hiển thị ở màn hình nhân viên.
 * Cố ý KHÔNG gồm: auth/*, analytics, audit-logs, notifications, public/quote, public/lookup (chỉ đọc hoặc không đổi dữ liệu dùng chung).
 */
export const LIVE_PATH =
  /^\/(appointments|public\/(bookings|cancel)|customers|invoices|vouchers|services|service-categories|stylists|shifts|shift-requests|time-off|holidays|working-hours|users|reviews)(\/|$)/;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Sự kiện phát ra cho một thao tác ghi (đường dẫn đã bỏ tiền tố /api), hoặc null nếu thao tác không đổi dữ liệu dùng chung.
 * Kênh được chia theo `scope` để mỗi màn hình chỉ tải lại phần dữ liệu của mình (lịch hẹn ≠ ca làm ≠ hoá đơn).
 */
export function liveEventFor(method: string, path: string): { scope: string; kind?: LiveEventKind } | null {
  if (READ_METHODS.has(method.toUpperCase()) || !LIVE_PATH.test(path)) return null;
  const head = path.split('/').filter(Boolean)[0];
  if (head !== 'public') return { scope: head };
  // Khách tự đặt lịch trên website (không gồm gửi lại email xác nhận /public/bookings/email) → chuông báo cho lễ tân
  return method.toUpperCase() === 'POST' && /^\/public\/bookings\/?$/.test(path)
    ? { scope: 'appointments', kind: 'booking.created' }
    : { scope: 'appointments' };
}

/** Sau mỗi thao tác ghi THÀNH CÔNG (đã xong giao dịch CSDL) thì báo cho mọi thiết bị đang nối luồng trực tiếp. */
@Injectable()
export class RealtimeInterceptor implements NestInterceptor {
  private readonly prefix: string;

  constructor(
    private readonly events: EventsService,
    config: ConfigService,
  ) {
    this.prefix = `/${config.get<string>('app.apiPrefix') ?? 'api'}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string }>();
    if (READ_METHODS.has(req.method)) return next.handle();

    let path = (req.originalUrl ?? req.url).split('?')[0];
    if (path.startsWith(this.prefix)) path = path.slice(this.prefix.length);
    const event = liveEventFor(req.method, path);
    if (!event) return next.handle();
    return next.handle().pipe(tap(() => this.events.publish(event.scope, event.kind)));
  }
}
