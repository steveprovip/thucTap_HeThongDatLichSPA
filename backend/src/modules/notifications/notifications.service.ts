import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { MSG } from '../../common/constants/messages.constant';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  appointmentId?: string | null;
}

/** Thông báo trong ứng dụng cho nhân sự (S4-06). */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      return await this.repo.save(
        this.repo.create({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          appointmentId: input.appointmentId ?? null,
        }),
      );
    } catch (e) {
      this.logger.warn(`Không tạo được thông báo: ${(e as Error).message}`);
      return null;
    }
  }

  /** Gửi thông báo cho tài khoản gắn với hồ sơ thợ (nếu thợ có tài khoản). */
  async notifyStylist(
    stylistId: string,
    type: NotificationType,
    title: string,
    body: string,
    appointmentId?: string | null,
  ): Promise<void> {
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    if (!stylist?.userId) return;
    await this.create({ userId: stylist.userId, type, title, body, appointmentId });
  }

  async listForUser(userId: string, page = 1, limit = 20): Promise<PaginatedResult<Notification>> {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(items, total, page, limit);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException(MSG.NOT_FOUND);
    if (!n.isRead) {
      n.isRead = true;
      n.readAt = new Date();
      await this.repo.save(n);
    }
    return n;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.repo.update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    return { updated: res.affected ?? 0 };
  }

  /** Thông báo cũ hơn 30 ngày được dọn tự động (S4-06). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOld(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const res = await this.repo.delete({ createdAt: LessThan(cutoff) });
    const n = res.affected ?? 0;
    if (n > 0) this.logger.log(`Đã dọn ${n} thông báo cũ hơn 30 ngày`);
    return n;
  }
}
