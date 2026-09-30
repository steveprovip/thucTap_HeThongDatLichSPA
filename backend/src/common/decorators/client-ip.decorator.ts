import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * IP thật của khách. KHÔNG tự đọc X-Forwarded-For: header đó do client đặt tuỳ ý nên đổi mỗi
 * request là vượt mọi giới hạn tần suất theo IP. req.ip đã được Express giải theo 'trust proxy'
 * (cấu hình TRUST_PROXY trong main.ts) -> chỉ lấy địa chỉ do proxy tin cậy ghi vào.
 */
export const clientIpOf = (req: { ip?: string; socket?: { remoteAddress?: string } }): string =>
  req.ip ?? req.socket?.remoteAddress ?? 'unknown';

export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  clientIpOf(ctx.switchToHttp().getRequest()),
);
