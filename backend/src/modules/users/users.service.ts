import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../database/entities/user.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { Role } from '../../common/constants/roles.constant';
import { MSG } from '../../common/constants/messages.constant';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import { generateTempPassword } from '../../common/utils/code.util';
import { normalizeSearch } from '../../common/utils/text.util';
import { MailService } from '../notifications/mail.service';
import { MailTemplates } from '../notifications/mail-templates';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto';

export interface UserView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  stylistId: string | null;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  private toView(u: User, stylistId: string | null = null): UserView {
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt,
      stylistId,
      createdAt: u.createdAt,
    };
  }

  async list(q: ListUsersQuery): Promise<PaginatedResult<UserView>> {
    // Không join sang stylists ở đây: TypeORM không gộp được addSelect thô với
    // getManyAndCount. Thông tin hồ sơ thợ được nạp riêng ngay bên dưới.
    const qb = this.userRepo.createQueryBuilder('u');
    if (q.role) qb.andWhere('u.role = :role', { role: q.role });
    if (q.isActive !== undefined) qb.andWhere('u.is_active = :active', { active: q.isActive });
    if (q.search) {
      const term = `%${normalizeSearch(q.search)}%`;
      qb.andWhere('(f_unaccent(lower(u.full_name)) LIKE :t OR lower(u.email) LIKE :t OR u.phone LIKE :t)', { t: term });
    }
    qb.orderBy('u.created_at', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);

    const [entities, total] = await qb.getManyAndCount();
    const stylists = await this.stylistRepo.find();
    const byUser = new Map(stylists.filter((s) => s.userId).map((s) => [s.userId as string, s.id]));
    return paginate(entities.map((u) => this.toView(u, byUser.get(u.id) ?? null)), total, q.page, q.limit);
  }

  async findOne(id: string): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);
    const stylist = await this.stylistRepo.findOne({ where: { userId: id } });
    return this.toView(user, stylist?.id ?? null);
  }

  /**
   * S1-02: tạo tài khoản sinh mật khẩu tạm gửi qua email,
   * người dùng buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
   */
  async create(dto: CreateUserDto): Promise<UserView & { tempPasswordSentTo: string }> {
    const existed = await this.userRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email: dto.email.trim() })
      .getOne();
    if (existed) throw new ConflictException({ message: MSG.EMAIL_DUPLICATED, field: 'email' });

    const tempPassword = generateTempPassword();
    const rounds = this.config.get<number>('security.bcryptRounds')!;

    const result = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone ?? null,
        role: dto.role,
        isActive: dto.isActive ?? true,
        mustChangePassword: true,
        passwordHash: await bcrypt.hash(tempPassword, rounds),
      });
      const saved = await manager.save(User, user);

      let stylistId: string | null = null;
      if (dto.role === Role.STYLIST && (dto.createStylistProfile ?? true)) {
        const stylist = manager.create(Stylist, {
          userId: saved.id,
          fullName: saved.fullName,
          phone: saved.phone,
          isActive: saved.isActive,
        });
        stylistId = (await manager.save(Stylist, stylist)).id;
      }
      return { saved, stylistId };
    });

    const tpl = MailTemplates.accountCreated(
      this.mail.salonInfo, result.saved.fullName, result.saved.email, tempPassword,
    );
    await this.mail.enqueue({
      kind: EmailKind.ACCOUNT_CREATED,
      toEmail: result.saved.email,
      toName: result.saved.fullName,
      subject: tpl.subject,
      html: tpl.html,
    });

    return { ...this.toView(result.saved, result.stylistId), tempPasswordSentTo: result.saved.email };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);

    const willDeactivate = dto.isActive === false && user.isActive;
    const willLoseAdmin = dto.role !== undefined && dto.role !== Role.ADMIN && user.role === Role.ADMIN;

    if ((willDeactivate || willLoseAdmin) && user.role === Role.ADMIN) {
      const activeAdmins = await this.userRepo.count({ where: { role: Role.ADMIN, isActive: true } });
      if (activeAdmins <= 1) throw new BadRequestException(MSG.LAST_ADMIN);
    }
    if (willDeactivate && id === actorId) throw new BadRequestException(MSG.CANNOT_DEACTIVATE_SELF);

    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    // Ngưng hoạt động: vô hiệu hoá mọi phiên đang mở ngay lập tức (S1-02)
    if (willDeactivate) {
      user.sessionsValidFrom = new Date();
      await this.refreshRepo.update({ userId: id, revokedAt: undefined }, { revokedAt: new Date() });
    }

    const saved = await this.userRepo.save(user);

    // Đồng bộ trạng thái sang hồ sơ thợ
    const stylist = await this.stylistRepo.findOne({ where: { userId: id } });
    if (stylist) {
      let dirty = false;
      if (dto.fullName !== undefined && stylist.fullName !== saved.fullName) {
        stylist.fullName = saved.fullName; dirty = true;
      }
      if (dto.isActive !== undefined && stylist.isActive !== saved.isActive) {
        stylist.isActive = saved.isActive; dirty = true;
      }
      if (dirty) await this.stylistRepo.save(stylist);
    }

    return this.toView(saved, stylist?.id ?? null);
  }

  /** Cấp lại mật khẩu tạm (khi nhân sự quên và không dùng được email). */
  async resetTempPassword(id: string): Promise<{ success: boolean; sentTo: string }> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);

    const tempPassword = generateTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, this.config.get<number>('security.bcryptRounds')!);
    user.mustChangePassword = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.sessionsValidFrom = new Date();
    await this.userRepo.save(user);
    await this.refreshRepo.update({ userId: id, revokedAt: undefined }, { revokedAt: new Date() });

    const tpl = MailTemplates.accountCreated(this.mail.salonInfo, user.fullName, user.email, tempPassword);
    await this.mail.enqueue({
      kind: EmailKind.ACCOUNT_CREATED,
      toEmail: user.email,
      toName: user.fullName,
      subject: tpl.subject,
      html: tpl.html,
    });
    return { success: true, sentTo: user.email };
  }

  /** Mở khoá tài khoản đang bị khoá do đăng nhập sai nhiều lần. */
  async unlock(id: string): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    return this.toView(await this.userRepo.save(user));
  }
}
