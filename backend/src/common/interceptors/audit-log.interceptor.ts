import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { clientIpOf } from '../decorators/client-ip.decorator';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthUser } from '../types/auth.types';

/**
 * Tự động ghi nhật ký cho mọi endpoint có gắn @Audit(...).
 * Ghi thời điểm, tài khoản thực hiện, loại đối tượng, mã đối tượng và tóm tắt (S1-09).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    const ip = clientIpOf(req);

    return next.handle().pipe(
      tap((result) => {
        const entityId =
          (result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)
            ? String((result as Record<string, unknown>).id)
            : undefined) ??
          req.params?.id ??
          null;

        void this.auditService.write({
          actorId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          actorRole: user?.role ?? null,
          action: meta.action,
          entityType: meta.entityType,
          entityId,
          summary: meta.summary,
          changes: this.pickChanges(req.body),
          ipAddress: ip,
        });
      }),
    );
  }

  /** Không ghi mật khẩu hay token vào nhật ký. */
  private pickChanges(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of ['password', 'currentPassword', 'newPassword', 'token', 'refreshToken']) {
      if (key in clone) clone[key] = '***';
    }
    return Object.keys(clone).length ? clone : null;
  }
}
