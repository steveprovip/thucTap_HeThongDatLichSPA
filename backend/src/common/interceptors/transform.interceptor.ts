import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** Bọc mọi phản hồi thành { success, data } để frontend xử lý thống nhất. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data) => {
        // Bỏ qua các phản hồi dạng tệp (CSV export) đã tự set header
        const contentType = res.getHeader?.('content-type');
        if (typeof contentType === 'string' && !contentType.includes('application/json')) return data;
        return { success: true as const, data };
      }),
    );
  }
}
