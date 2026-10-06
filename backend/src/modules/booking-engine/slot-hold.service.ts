import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { SlotHold } from '../../database/entities/slot-hold.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { ERROR_CODES, MSG } from '../../common/constants/messages.constant';
import { addMinutes, combine, timeToMinutes, toDateString, toTimeString } from '../../common/utils/time.util';
import { AvailabilityService } from './availability.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { StylistsService } from '../stylists/stylists.service';
import { CreateSlotHoldDto } from './dto/booking.dto';

export interface SlotHoldView {
  holdToken: string;
  stylistId: string;
  stylistName: string;
  date: string;
  time: string;
  endTime: string;
  expiresAt: string;
  holdMinutes: number;
}

/**
 * Mentor Sprint 2 · mục 11 — TẠM GIỮ CHỖ khi khách đang điền form đặt lịch.
 *
 *  - Khách tới bước "Xác nhận" -> giữ khung giờ (đúng thợ đã chọn, hoặc thợ hệ thống tự phân) trong N phút
 *    (SLOT_HOLD_MINUTES, 5–15, mặc định 10). Trong thời gian đó khung giờ biến mất khỏi danh sách của MỌI khách khác
 *    và các luồng tạo/dời lịch của nhân viên cũng coi là bận.
 *  - Giữ chỗ được ghi trong giao dịch có khoá dòng thợ (FOR UPDATE) giống luồng chốt lịch, nên hai khách bấm cùng lúc
 *    chỉ một người giữ được.
 *  - Chốt lịch kèm `holdToken` -> giữ chỗ được "đổi" thành lịch hẹn rồi xoá. Hết hạn mà chưa chốt thì tự trả lại
 *    (truy vấn luôn lọc expires_at > now, cron dọn bản ghi cũ mỗi 5 phút).
 */
@Injectable()
export class SlotHoldService {
  private readonly logger = new Logger(SlotHoldService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly availability: AvailabilityService,
    private readonly rateLimit: RateLimitService,
    private readonly stylists: StylistsService,
    @InjectRepository(SlotHold) private readonly repo: Repository<SlotHold>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  get holdMinutes(): number {
    return this.config.get<number>('business.slotHoldMinutes') ?? 10;
  }

  /** Có giữ chỗ nào CỦA NGƯỜI KHÁC (khác token) chồng lên [start, end) của thợ này không — chạy trong giao dịch đang khoá. */
  static async heldByOthers(manager: EntityManager, stylistId: string, start: Date, end: Date, ownToken?: string | null): Promise<boolean> {
    const rows = await manager.query(
      `SELECT 1 FROM slot_holds
        WHERE stylist_id = $1 AND expires_at > now()
          AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
          AND ($4::text IS NULL OR token <> $4::text)
        LIMIT 1`,
      [stylistId, start.toISOString(), end.toISOString(), ownToken ?? null],
    );
    return rows.length > 0;
  }

  async create(dto: CreateSlotHoldDto, ip: string): Promise<SlotHoldView> {
    const limit = this.config.get<number>('business.slotHoldIpLimitPerHour') ?? 30;
    const rl = await this.rateLimit.hit('slot_hold_ip', ip, limit, 60);
    if (!rl.allowed) {
      throw new HttpException(
        { message: MSG.SLOT_HOLD_RATE_LIMITED, code: ERROR_CODES.RATE_LIMITED, details: { retryAfterSeconds: 3600 } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Khách đổi khung giờ: trả lại chỗ đang giữ trước, để chính họ không tự chặn mình
    if (dto.previousToken) await this.release(dto.previousToken);

    await this.availability.assertSalonOpen(dto.date, 'create');
    const services = await this.availability.loadServices(dto.serviceIds);
    const totalDuration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const startAt = combine(dto.date, dto.time);
    const endAt = addMinutes(startAt, totalDuration);
    if (startAt.getTime() <= Date.now()) throw new BadRequestException(MSG.SLOT_IN_PAST);
    // Giữ chỗ là luồng của khách online: cùng luật lưới 15 phút như lúc chốt lịch (không giữ 09:07 làm lẻ lịch thợ)
    const step = this.config.get<number>('business.slotStepMinutes') ?? 15;
    if (timeToMinutes(dto.time) % step !== 0) throw new BadRequestException(MSG.SLOT_INVALID);

    let stylistId: string;
    if (dto.stylistId) {
      const skill = await this.stylists.canDoAll(dto.stylistId, dto.serviceIds);
      if (!skill.ok) throw new BadRequestException(MSG.STYLIST_MISSING_SKILL(skill.missing.join(', ')));
      const verdict = await this.availability.checkSlot({ date: dto.date, time: dto.time, stylistId: dto.stylistId, totalDuration });
      if (verdict === 'invalid') throw new BadRequestException(MSG.SLOT_INVALID);
      if (verdict === 'taken') throw new ConflictException({ message: MSG.SLOT_TAKEN, code: ERROR_CODES.SLOT_TAKEN });
      if (verdict === 'held') throw new ConflictException({ message: MSG.SLOT_HELD, code: ERROR_CODES.SLOT_HELD });
      stylistId = dto.stylistId;
    } else {
      const auto = await this.availability.pickAutoStylist({
        date: dto.date, time: dto.time, serviceIds: dto.serviceIds, totalDuration,
      });
      if (!auto) throw new ConflictException({ message: MSG.SLOT_TAKEN, code: ERROR_CODES.SLOT_TAKEN });
      stylistId = auto.id;
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + this.holdMinutes * 60_000);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.query('SELECT id FROM stylists WHERE id = $1 AND is_active FOR UPDATE', [stylistId]);
      if (!locked.length) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
      const appt = await manager.query(
        `SELECT 1 FROM appointments WHERE stylist_id = $1 AND status IN ('pending','confirmed','arrived','in_progress')
           AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)') LIMIT 1`,
        [stylistId, startAt.toISOString(), endAt.toISOString()],
      );
      if (appt.length) throw new ConflictException({ message: MSG.SLOT_TAKEN, code: ERROR_CODES.SLOT_TAKEN });
      if (await SlotHoldService.heldByOthers(manager, stylistId, startAt, endAt)) {
        throw new ConflictException({ message: MSG.SLOT_HELD, code: ERROR_CODES.SLOT_HELD });
      }
      await manager.save(manager.create(SlotHold, { token, stylistId, startAt, endAt, expiresAt, createdIp: ip.slice(0, 64) }));
    });
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    return {
      holdToken: token,
      stylistId,
      stylistName: stylist?.fullName ?? '',
      date: toDateString(startAt),
      time: toTimeString(startAt),
      endTime: toTimeString(endAt),
      expiresAt: expiresAt.toISOString(),
      holdMinutes: this.holdMinutes,
    };
  }

  /** Giữ chỗ còn hiệu lực theo token (null nếu không có / đã hết hạn). */
  async findActive(token: string | null | undefined): Promise<SlotHold | null> {
    if (!token) return null;
    const hold = await this.repo.findOne({ where: { token } });
    return hold && hold.expiresAt.getTime() > Date.now() ? hold : null;
  }

  async release(token: string): Promise<{ released: boolean }> {
    const res = await this.repo.delete({ token });
    return { released: (res.affected ?? 0) > 0 };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async purgeExpired(): Promise<number> {
    try {
      const res = await this.repo.delete({ expiresAt: LessThan(new Date(Date.now() - 60_000)) });
      return res.affected ?? 0;
    } catch (e) {
      this.logger.warn(`Không dọn được giữ chỗ hết hạn: ${(e as Error).message}`);
      return 0;
    }
  }
}
