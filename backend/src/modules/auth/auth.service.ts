import {
  BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { MSG } from '../../common/constants/messages.constant';
import { AuthUser, JwtPayload } from '../../common/types/auth.types';
import { generateToken } from '../../common/utils/code.util';
import { isStrongPassword } from '../../common/utils/password.util';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../notifications/mail.service';
import { MailTemplates } from '../notifications/mail-templates';
import { RateLimitService } from '../rate-limit/rate-limit.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult extends TokenPair {
  user: AuthUser;
}

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken) private readonly resetRepo: Repository<PasswordResetToken>,
  ) {}

  // ------------------------------------------------------------------ LOGIN
  /**
   * S1-01: sai thông tin trả về thông báo CHUNG (không tiết lộ email có tồn tại),
   * sai 5 lần liên tiếp khoá tài khoản 15 phút.
   */
  async login(email: string, password: string, ip: string, userAgent?: string): Promise<LoginResult> {
    const maxAttempts = this.config.get<number>('security.loginMaxAttempts')!;
    const lockMinutes = this.config.get<number>('security.loginLockMinutes')!;

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = lower(:email)', { email: email.trim() })
      .getOne();

    if (!user) {
      // Cùng một thông điệp với trường hợp sai mật khẩu
      throw new UnauthorizedException(MSG.LOGIN_FAILED);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(MSG.ACCOUNT_LOCKED(remaining));
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= maxAttempts) {
        user.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
        user.failedLoginAttempts = 0;
        await this.userRepo.save(user);
        await this.audit.write({
          actorId: user.id, actorEmail: user.email, actorRole: user.role,
          action: AuditAction.LOGIN, entityType: 'user', entityId: user.id,
          summary: `Khoá tài khoản ${lockMinutes} phút do nhập sai mật khẩu ${maxAttempts} lần`,
          ipAddress: ip,
        });
        throw new UnauthorizedException(MSG.ACCOUNT_LOCKED(lockMinutes));
      }
      await this.userRepo.save(user);
      throw new UnauthorizedException(MSG.LOGIN_FAILED);
    }

    // Tài khoản ngưng hoạt động: chỉ báo sau khi đã xác thực đúng mật khẩu
    if (!user.isActive) throw new ForbiddenException(MSG.ACCOUNT_INACTIVE);

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const stylist = await this.stylistRepo.findOne({ where: { userId: user.id } });
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      stylistId: stylist?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    };

    const tokens = await this.issueTokens(user, stylist?.id ?? null, ip, userAgent);
    await this.audit.write({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: AuditAction.LOGIN, entityType: 'user', entityId: user.id,
      summary: 'Đăng nhập thành công', ipAddress: ip,
    });

    return { ...tokens, user: authUser };
  }

  // ----------------------------------------------------------------- TOKENS
  private ttlToSeconds(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 1800;
    const n = Number(m[1]);
    return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  }

  private async issueTokens(
    user: User, stylistId: string | null, ip: string, userAgent?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      stylistId,
      mustChangePassword: user.mustChangePassword,
    };

    const accessTtl = this.config.get<string>('jwt.accessTtl')!;
    const refreshTtl = this.config.get<string>('jwt.refreshTtl')!;

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: generateToken(16) },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 250) ?? null,
        ipAddress: ip,
        expiresAt: new Date(Date.now() + this.ttlToSeconds(refreshTtl) * 1000),
      }),
    );

    return { accessToken, refreshToken, expiresIn: this.ttlToSeconds(accessTtl) };
  }

  /** Cấp lại access token, đồng thời xoay vòng refresh token. */
  async refresh(refreshToken: string, ip: string, userAgent?: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException(MSG.REFRESH_INVALID);
    }

    const hash = sha256(refreshToken);
    const stored = await this.refreshRepo.findOne({ where: { tokenHash: hash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(MSG.REFRESH_INVALID);
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException(MSG.REFRESH_INVALID);
    if (!user.isActive) throw new ForbiddenException(MSG.ACCOUNT_INACTIVE);
    if (stored.createdAt.getTime() + 1000 < user.sessionsValidFrom.getTime()) {
      throw new UnauthorizedException(MSG.TOKEN_EXPIRED);
    }

    stored.revokedAt = new Date();
    await this.refreshRepo.save(stored);

    const stylist = await this.stylistRepo.findOne({ where: { userId: user.id } });
    return this.issueTokens(user, stylist?.id ?? null, ip, userAgent);
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      await this.refreshRepo.update({ tokenHash: sha256(refreshToken) }, { revokedAt: new Date() });
    } else {
      await this.refreshRepo.update({ userId, revokedAt: undefined }, { revokedAt: new Date() });
    }
    return { success: true };
  }

  // -------------------------------------------------------------- PASSWORDS
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new UnauthorizedException(MSG.TOKEN_INVALID);

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException({ message: MSG.CURRENT_PASSWORD_WRONG, field: 'currentPassword' });
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException({ message: MSG.PASSWORD_WEAK, field: 'newPassword' });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException({ message: MSG.PASSWORD_SAME_AS_OLD, field: 'newPassword' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, this.config.get<number>('security.bcryptRounds')!);
    user.mustChangePassword = false;
    await this.userRepo.save(user);

    await this.audit.write({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: AuditAction.UPDATE, entityType: 'user', entityId: user.id,
      summary: 'Tự đổi mật khẩu',
    });
    return { success: true };
  }

  /**
   * S1-04: gửi liên kết đặt lại, hết hạn 30 phút, dùng một lần.
   * Quá 3 lần/giờ từ cùng một email thì từ chối.
   * Phản hồi luôn giống nhau để không lộ email nào tồn tại.
   */
  async forgotPassword(email: string, ip: string): Promise<{ message: string }> {
    const limit = this.config.get<number>('security.resetEmailLimitPerHour')!;
    const rl = await this.rateLimit.hit('reset_email', email.toLowerCase().trim(), limit, 60);
    if (!rl.allowed) throw new BadRequestException(MSG.RESET_TOO_MANY);

    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email: email.trim() })
      .getOne();

    if (user && user.isActive) {
      const rawToken = generateToken(32);
      const minutes = this.config.get<number>('security.resetTokenMinutes')!;
      await this.resetRepo.save(
        this.resetRepo.create({
          userId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + minutes * 60_000),
          requestedIp: ip,
        }),
      );
      const tpl = MailTemplates.passwordReset(this.mail.salonInfo, user.fullName, rawToken);
      await this.mail.enqueue({
        kind: EmailKind.PASSWORD_RESET,
        toEmail: user.email,
        toName: user.fullName,
        subject: tpl.subject,
        html: tpl.html,
      });
    }

    return { message: MSG.RESET_LINK_SENT };
  }

  /** Đặt lại mật khẩu thành công sẽ huỷ toàn bộ phiên đăng nhập cũ (S1-04). */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    const row = await this.resetRepo.findOne({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt) throw new BadRequestException(MSG.RESET_TOKEN_INVALID);
    if (row.expiresAt < new Date()) throw new BadRequestException(MSG.RESET_TOKEN_EXPIRED);
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException({ message: MSG.PASSWORD_WEAK, field: 'newPassword' });
    }

    const user = await this.userRepo.findOne({ where: { id: row.userId } });
    if (!user) throw new BadRequestException(MSG.RESET_TOKEN_INVALID);

    user.passwordHash = await bcrypt.hash(newPassword, this.config.get<number>('security.bcryptRounds')!);
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.sessionsValidFrom = new Date();
    await this.userRepo.save(user);

    row.usedAt = new Date();
    await this.resetRepo.save(row);
    await this.refreshRepo.update({ userId: user.id, revokedAt: undefined }, { revokedAt: new Date() });

    await this.audit.write({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: AuditAction.UPDATE, entityType: 'user', entityId: user.id,
      summary: 'Đặt lại mật khẩu qua email và huỷ toàn bộ phiên cũ',
    });
    return { success: true };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(MSG.TOKEN_INVALID);
    const stylist = await this.stylistRepo.findOne({ where: { userId: user.id } });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      stylistId: stylist?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
