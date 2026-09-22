import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MSG } from '../constants/messages.constant';
import { AuthUser } from '../types/auth.types';

/** Danh sách endpoint vẫn cho phép khi tài khoản buộc phải đổi mật khẩu lần đầu. */
const ALLOWED_PATHS = ['/auth/change-password', '/auth/me', '/auth/logout', '/auth/refresh'];

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user?.mustChangePassword) return true;

    const path: string = req.route?.path ?? req.url ?? '';
    if (ALLOWED_PATHS.some((p) => path.includes(p))) return true;

    throw new ForbiddenException(MSG.MUST_CHANGE_PASSWORD);
  }
}
