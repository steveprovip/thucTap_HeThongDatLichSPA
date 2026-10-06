import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventsService } from './events.service';

/**
 * Đường dẫn API mà một thao tác GHI thành công lên đó làm thay đổi dữ liệu hiển thị ở màn hình nhân viên.
 * Cố ý KHÔNG gồm: auth/*, analytics, audit-logs, notifications, public/quote, public/lookup (chỉ đọc hoặc không đổi dữ liệu dùng chung).
 */
export const LIVE_PATH =
  /^\/(appointments|public\/(bookings|cancel)|customers|invoices|vouchers|services|service-categories|stylists|shifts|shift-requests|time-off|holidays|working-hours|users|reviews)(\/|$)/;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
    if (!LIVE_PATH.test(path)) return next.handle();

    const scope = path.split('/').filter(Boolean)[0] === 'public' ? 'appointments' : path.split('/').filter(Boolean)[0];
    return next.handle().pipe(tap(() => this.events.publish(scope)));
  }
}
