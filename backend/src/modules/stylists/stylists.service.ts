import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { Stylist } from '../../database/entities/stylist.entity';
import { StylistService as StylistServiceLink } from '../../database/entities/stylist-service.entity';
import { StylistShift } from '../../database/entities/stylist-shift.entity';
import { StylistTimeOff } from '../../database/entities/stylist-time-off.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { Appointment, ACTIVE_STATUSES } from '../../database/entities/appointment.entity';
import { User } from '../../database/entities/user.entity';
import { MSG } from '../../common/constants/messages.constant';
import {
  addDays, combine, dayOfWeek, DOW_LABELS, endOfDay, startOfDay, timeToMinutes, trimSeconds,
} from '../../common/utils/time.util';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import {
  CopyWeekDto, CreateShiftsDto, CreateStylistDto, CreateTimeOffDto, ShiftItemDto,
  UpdateShiftDto, UpdateStylistDto,
} from './dto/stylist.dto';

export interface StylistView {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isActive: boolean;
  serviceIds: string[];
  serviceNames: string[];
  avgRating: number | null;
  reviewCount: number;
}

export interface ShiftView {
  id: string;
  stylistId: string;
  stylistName: string;
  workDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  note: string | null;
}

@Injectable()
export class StylistsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly workingHours: WorkingHoursService,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
    @InjectRepository(StylistServiceLink) private readonly linkRepo: Repository<StylistServiceLink>,
    @InjectRepository(StylistShift) private readonly shiftRepo: Repository<StylistShift>,
    @InjectRepository(StylistTimeOff) private readonly timeOffRepo: Repository<StylistTimeOff>,
    @InjectRepository(ServiceItem) private readonly serviceRepo: Repository<ServiceItem>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // -------------------------------------------------------------- PROFILES
  private async decorate(stylists: Stylist[]): Promise<StylistView[]> {
    if (!stylists.length) return [];
    const ids = stylists.map((s) => s.id);
    const links = await this.linkRepo.find({ where: { stylistId: In(ids) } });
    const services = await this.serviceRepo.find();
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    const ratings = await this.dataSource.query(
      `SELECT stylist_id, COUNT(*)::int AS cnt, ROUND(AVG(rating)::numeric, 2)::float AS avg
         FROM reviews WHERE submitted_at IS NOT NULL AND rating IS NOT NULL AND stylist_id = ANY($1)
        GROUP BY stylist_id`,
      [ids],
    );
    const ratingMap = new Map<string, { cnt: number; avg: number }>(
      (ratings as { stylist_id: string; cnt: number; avg: number }[]).map((r) => [
        r.stylist_id, { cnt: r.cnt, avg: r.avg },
      ]),
    );

    return stylists.map((s) => {
      const serviceIds = links.filter((l) => l.stylistId === s.id).map((l) => l.serviceId);
      const r = ratingMap.get(s.id);
      return {
        id: s.id,
        userId: s.userId,
        fullName: s.fullName,
        phone: s.phone,
        avatarUrl: s.avatarUrl,
        bio: s.bio,
        isActive: s.isActive,
        serviceIds,
        serviceNames: serviceIds.map((id) => serviceMap.get(id) ?? '').filter(Boolean),
        avgRating: r?.avg ?? null,
        reviewCount: r?.cnt ?? 0,
      };
    });
  }

  async list(params: { isActive?: boolean; serviceId?: string } = {}): Promise<StylistView[]> {
    const qb = this.stylistRepo.createQueryBuilder('s');
    if (params.isActive !== undefined) qb.andWhere('s.is_active = :a', { a: params.isActive });
    if (params.serviceId) {
      qb.andWhere(
        's.id IN (SELECT stylist_id FROM stylist_services WHERE service_id = :sid)',
        { sid: params.serviceId },
      );
    }
    qb.orderBy('s.full_name', 'ASC');
    return this.decorate(await qb.getMany());
  }

  async findOne(id: string): Promise<StylistView> {
    const stylist = await this.stylistRepo.findOne({ where: { id } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
    return (await this.decorate([stylist]))[0];
  }

  async create(dto: CreateStylistDto): Promise<StylistView> {
    if (dto.userId) {
      const user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);
      const taken = await this.stylistRepo.findOne({ where: { userId: dto.userId } });
      if (taken) throw new ConflictException('Tài khoản này đã gắn với một hồ sơ thợ khác');
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const stylist = await manager.save(
        manager.create(Stylist, {
          fullName: dto.fullName.trim(),
          phone: dto.phone ?? null,
          bio: dto.bio ?? null,
          isActive: dto.isActive ?? true,
          userId: dto.userId ?? null,
        }),
      );
      if (dto.serviceIds?.length) {
        await manager.save(
          dto.serviceIds.map((sid) =>
            manager.create(StylistServiceLink, { stylistId: stylist.id, serviceId: sid }),
          ),
        );
      }
      return stylist;
    });
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateStylistDto): Promise<StylistView> {
    const stylist = await this.stylistRepo.findOne({ where: { id } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);

    if (dto.fullName !== undefined) stylist.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) stylist.phone = dto.phone;
    if (dto.bio !== undefined) stylist.bio = dto.bio;
    if (dto.isActive !== undefined) stylist.isActive = dto.isActive;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Stylist, stylist);
      if (dto.serviceIds) {
        await manager.delete(StylistServiceLink, { stylistId: id });
        if (dto.serviceIds.length) {
          await manager.save(
            dto.serviceIds.map((sid) =>
              manager.create(StylistServiceLink, { stylistId: id, serviceId: sid }),
            ),
          );
        }
      }
    });
    return this.findOne(id);
  }

  async setAvatar(id: string, url: string): Promise<StylistView> {
    const stylist = await this.stylistRepo.findOne({ where: { id } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
    stylist.avatarUrl = url;
    await this.stylistRepo.save(stylist);
    return this.findOne(id);
  }

  /** Thợ có làm được TẤT CẢ các dịch vụ này không (S2-06, S3-04). */
  async canDoAll(stylistId: string, serviceIds: string[]): Promise<{ ok: boolean; missing: string[] }> {
    if (!serviceIds.length) return { ok: true, missing: [] };
    const links = await this.linkRepo.find({ where: { stylistId, serviceId: In(serviceIds) } });
    const have = new Set(links.map((l) => l.serviceId));
    const missingIds = serviceIds.filter((id) => !have.has(id));
    if (!missingIds.length) return { ok: true, missing: [] };
    const services = await this.serviceRepo.find({ where: { id: In(missingIds) } });
    return { ok: false, missing: services.map((s) => s.name) };
  }

  /** Các thợ làm được TẤT CẢ dịch vụ đã chọn và đang làm việc. */
  async findCapableStylists(serviceIds: string[]): Promise<Stylist[]> {
    if (!serviceIds.length) return [];
    const rows = await this.dataSource.query(
      `SELECT s.* FROM stylists s
        WHERE s.is_active = TRUE
          AND (SELECT COUNT(DISTINCT ss.service_id) FROM stylist_services ss
                WHERE ss.stylist_id = s.id AND ss.service_id = ANY($1)) = $2
        ORDER BY s.full_name`,
      [serviceIds, serviceIds.length],
    );
    return rows as Stylist[];
  }

  // ---------------------------------------------------------------- SHIFTS
  private shiftView(s: StylistShift, name: string): ShiftView {
    return {
      id: s.id,
      stylistId: s.stylistId,
      stylistName: name,
      workDate: typeof s.workDate === 'string' ? s.workDate : String(s.workDate),
      dayLabel: DOW_LABELS[dayOfWeek(String(s.workDate))],
      startTime: trimSeconds(s.startTime),
      endTime: trimSeconds(s.endTime),
      breakStart: s.breakStart ? trimSeconds(s.breakStart) : null,
      breakEnd: s.breakEnd ? trimSeconds(s.breakEnd) : null,
      note: s.note,
    };
  }

  async listShifts(params: { stylistId?: string; from: string; to: string }): Promise<ShiftView[]> {
    const qb = this.shiftRepo.createQueryBuilder('sh')
      .where('sh.work_date BETWEEN :from AND :to', { from: params.from, to: params.to });
    if (params.stylistId) qb.andWhere('sh.stylist_id = :sid', { sid: params.stylistId });
    qb.orderBy('sh.work_date', 'ASC').addOrderBy('sh.start_time', 'ASC');
    const rows = await qb.getMany();
    const stylists = await this.stylistRepo.find();
    const names = new Map(stylists.map((s) => [s.id, s.fullName]));
    return rows.map((r) => this.shiftView(r, names.get(r.stylistId) ?? ''));
  }

  /** S2-01: ca phải nằm trong giờ mở cửa của tiệm hôm đó. */
  private async assertWithinSalonHours(item: ShiftItemDto): Promise<void> {
    const dow = dayOfWeek(item.workDate);
    const wh = await this.workingHours.getByDayOfWeek(dow);
    if (!wh || wh.isClosed) {
      throw new BadRequestException(`${DOW_LABELS[dow]} ${item.workDate}: ${MSG.SALON_CLOSED_THAT_DAY}`);
    }
    const open = timeToMinutes(trimSeconds(wh.openTime));
    const close = timeToMinutes(trimSeconds(wh.closeTime));
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (end <= start) throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu ca');
    if (start < open || end > close) {
      throw new BadRequestException(
        MSG.SHIFT_OUT_OF_SALON_HOURS(trimSeconds(wh.openTime), trimSeconds(wh.closeTime)),
      );
    }
    if (item.breakStart || item.breakEnd) {
      if (!item.breakStart || !item.breakEnd) {
        throw new BadRequestException('Nghỉ giữa ca phải có cả giờ bắt đầu và giờ kết thúc');
      }
      const bs = timeToMinutes(item.breakStart);
      const be = timeToMinutes(item.breakEnd);
      if (be <= bs || bs < start || be > end) {
        throw new BadRequestException('Giờ nghỉ giữa ca phải nằm trong ca làm và kết thúc sau khi bắt đầu');
      }
    }
  }

  async createShifts(stylistId: string, dto: CreateShiftsDto): Promise<ShiftView[]> {
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);

    for (const item of dto.shifts) await this.assertWithinSalonHours(item);

    const created = await this.dataSource.transaction(async (manager) =>
      manager.save(
        dto.shifts.map((item) =>
          manager.create(StylistShift, {
            stylistId,
            workDate: item.workDate,
            startTime: item.startTime,
            endTime: item.endTime,
            breakStart: item.breakStart ?? null,
            breakEnd: item.breakEnd ?? null,
            note: item.note ?? null,
          }),
        ),
      ),
    );
    return created.map((c) => this.shiftView(c, stylist.fullName));
  }

  async updateShift(id: string, dto: UpdateShiftDto): Promise<ShiftView> {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) throw new NotFoundException(MSG.SHIFT_NOT_FOUND);
    const stylist = await this.stylistRepo.findOne({ where: { id: shift.stylistId } });

    const merged: ShiftItemDto = {
      workDate: String(shift.workDate),
      startTime: dto.startTime ?? trimSeconds(shift.startTime),
      endTime: dto.endTime ?? trimSeconds(shift.endTime),
      breakStart: dto.breakStart !== undefined ? dto.breakStart : shift.breakStart ? trimSeconds(shift.breakStart) : null,
      breakEnd: dto.breakEnd !== undefined ? dto.breakEnd : shift.breakEnd ? trimSeconds(shift.breakEnd) : null,
    };
    await this.assertWithinSalonHours(merged);

    // Không được thu hẹp ca ra ngoài các lịch hẹn đang có bên trong
    const inside = await this.appointmentsInsideShift(shift);
    const newStart = combine(merged.workDate, merged.startTime);
    const newEnd = combine(merged.workDate, merged.endTime);
    const broken = inside.filter((a) => a.startAt < newStart || a.endAt > newEnd);
    if (broken.length) {
      throw new ConflictException(
        `Ca mới không bao trọn ${broken.length} lịch hẹn đang có: ${broken.map((b) => b.code).join(', ')}`,
      );
    }

    shift.startTime = merged.startTime;
    shift.endTime = merged.endTime;
    shift.breakStart = merged.breakStart ?? null;
    shift.breakEnd = merged.breakEnd ?? null;
    if (dto.note !== undefined) shift.note = dto.note;
    const saved = await this.shiftRepo.save(shift);
    return this.shiftView(saved, stylist?.fullName ?? '');
  }

  private async appointmentsInsideShift(shift: StylistShift): Promise<Appointment[]> {
    const date = String(shift.workDate);
    return this.apptRepo
      .createQueryBuilder('a')
      .where('a.stylist_id = :sid', { sid: shift.stylistId })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .andWhere('a.start_at >= :from AND a.start_at < :to', {
        from: combine(date, trimSeconds(shift.startTime)),
        to: combine(date, trimSeconds(shift.endTime)),
      })
      .orderBy('a.start_at', 'ASC')
      .getMany();
  }

  /** S2-01: xoá ca đang có lịch hẹn bên trong thì bị chặn, liệt kê các lịch liên quan. */
  async removeShift(id: string): Promise<{ success: boolean }> {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) throw new NotFoundException(MSG.SHIFT_NOT_FOUND);
    const inside = await this.appointmentsInsideShift(shift);
    if (inside.length) {
      throw new ConflictException(
        `${MSG.SHIFT_HAS_APPOINTMENTS}: ${inside.map((a) => `${a.code} (${trimSeconds(String(a.startAt))})`).join(', ')}`,
      );
    }
    await this.shiftRepo.delete(id);
    return { success: true };
  }

  /**
   * S2-01: sao chép ca của một tuần sang tuần kế tiếp.
   * Ngày đã có ca ở tuần đích: ghi đè hoặc bỏ qua tuỳ chọn.
   */
  async copyWeek(dto: CopyWeekDto): Promise<{ created: number; skipped: number; overwritten: number }> {
    const sourceEnd = addDays(dto.sourceWeekStart, 6);
    const qb = this.shiftRepo.createQueryBuilder('sh')
      .where('sh.work_date BETWEEN :from AND :to', { from: dto.sourceWeekStart, to: sourceEnd });
    if (dto.stylistId) qb.andWhere('sh.stylist_id = :sid', { sid: dto.stylistId });
    const source = await qb.getMany();

    let created = 0;
    let skipped = 0;
    let overwritten = 0;

    await this.dataSource.transaction(async (manager) => {
      // Gom theo (thợ, ngày đích) để xử lý ghi đè một lần cho mỗi ngày
      const targetsByKey = new Map<string, { stylistId: string; targetDate: string; items: StylistShift[] }>();
      for (const s of source) {
        const offset = Math.round(
          (new Date(`${String(s.workDate)}T00:00:00Z`).getTime() -
            new Date(`${dto.sourceWeekStart}T00:00:00Z`).getTime()) / 86_400_000,
        );
        const targetDate = addDays(dto.targetWeekStart, offset);
        const key = `${s.stylistId}|${targetDate}`;
        const bucket = targetsByKey.get(key) ?? { stylistId: s.stylistId, targetDate, items: [] };
        bucket.items.push(s);
        targetsByKey.set(key, bucket);
      }

      for (const bucket of targetsByKey.values()) {
        const existing = await manager.find(StylistShift, {
          where: { stylistId: bucket.stylistId, workDate: bucket.targetDate },
        });
        if (existing.length > 0) {
          if (!dto.overwrite) { skipped += bucket.items.length; continue; }
          // Chỉ ghi đè khi ngày đích không có lịch hẹn nào đang giữ chỗ
          const busy = await manager
            .createQueryBuilder(Appointment, 'a')
            .where('a.stylist_id = :sid', { sid: bucket.stylistId })
            .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
            .andWhere('a.start_at >= :from AND a.start_at <= :to', {
              from: startOfDay(bucket.targetDate), to: endOfDay(bucket.targetDate),
            })
            .getCount();
          if (busy > 0) { skipped += bucket.items.length; continue; }
          await manager.delete(StylistShift, { stylistId: bucket.stylistId, workDate: bucket.targetDate });
          overwritten += existing.length;
        }
        await manager.save(
          bucket.items.map((s) =>
            manager.create(StylistShift, {
              stylistId: s.stylistId,
              workDate: bucket.targetDate,
              startTime: trimSeconds(s.startTime),
              endTime: trimSeconds(s.endTime),
              breakStart: s.breakStart ? trimSeconds(s.breakStart) : null,
              breakEnd: s.breakEnd ? trimSeconds(s.breakEnd) : null,
              note: s.note,
            }),
          ),
        );
        created += bucket.items.length;
      }
    });

    return { created, skipped, overwritten };
  }

  // -------------------------------------------------------------- TIME OFF
  async listTimeOff(stylistId?: string, from?: string, to?: string): Promise<StylistTimeOff[]> {
    const qb = this.timeOffRepo.createQueryBuilder('t');
    if (stylistId) qb.andWhere('t.stylist_id = :sid', { sid: stylistId });
    if (from) qb.andWhere('t.off_date >= :from', { from });
    if (to) qb.andWhere('t.off_date <= :to', { to });
    return qb.orderBy('t.off_date', 'ASC').getMany();
  }

  async createTimeOff(
    stylistId: string, dto: CreateTimeOffDto,
  ): Promise<StylistTimeOff | { warning: string; affected: number; codes: string[] }> {
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException('Nghỉ theo khoảng giờ phải có cả giờ bắt đầu và giờ kết thúc');
    }
    if (dto.startTime && dto.endTime && timeToMinutes(dto.endTime) <= timeToMinutes(dto.startTime)) {
      throw new BadRequestException('Giờ kết thúc nghỉ phải sau giờ bắt đầu nghỉ');
    }

    // Cảnh báo lịch hẹn bị ảnh hưởng trước khi lưu (S2-02)
    const qb = this.apptRepo.createQueryBuilder('a')
      .where('a.stylist_id = :sid', { sid: stylistId })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .andWhere('a.start_at >= :from AND a.start_at <= :to', {
        from: dto.startTime ? combine(dto.offDate, dto.startTime) : startOfDay(dto.offDate),
        to: dto.endTime ? combine(dto.offDate, dto.endTime) : endOfDay(dto.offDate),
      });
    const affected = await qb.orderBy('a.start_at', 'ASC').getMany();
    if (affected.length > 0 && !dto.force) {
      return {
        warning: `Ngày nghỉ này đang có ${affected.length} lịch hẹn chưa hoàn tất. Xác nhận để lưu và xử lý các lịch hẹn đó.`,
        affected: affected.length,
        codes: affected.map((a) => a.code),
      };
    }

    return this.timeOffRepo.save(
      this.timeOffRepo.create({
        stylistId,
        offDate: dto.offDate,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason ?? null,
      }),
    );
  }

  async removeTimeOff(id: string): Promise<{ success: boolean }> {
    const found = await this.timeOffRepo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(MSG.TIME_OFF_NOT_FOUND);
    await this.timeOffRepo.delete(id);
    return { success: true };
  }

  async getShiftsForDate(date: string, stylistIds?: string[]): Promise<StylistShift[]> {
    const qb = this.shiftRepo.createQueryBuilder('sh').where('sh.work_date = :d', { d: date });
    if (stylistIds?.length) qb.andWhere('sh.stylist_id IN (:...ids)', { ids: stylistIds });
    return qb.orderBy('sh.start_time', 'ASC').getMany();
  }

  async getTimeOffForDate(date: string, stylistIds?: string[]): Promise<StylistTimeOff[]> {
    const qb = this.timeOffRepo.createQueryBuilder('t').where('t.off_date = :d', { d: date });
    if (stylistIds?.length) qb.andWhere('t.stylist_id IN (:...ids)', { ids: stylistIds });
    return qb.getMany();
  }

  async getShiftsBetween(from: string, to: string, stylistIds?: string[]): Promise<StylistShift[]> {
    const qb = this.shiftRepo.createQueryBuilder('sh')
      .where('sh.work_date BETWEEN :from AND :to', { from, to });
    if (stylistIds?.length) qb.andWhere('sh.stylist_id IN (:...ids)', { ids: stylistIds });
    return qb.orderBy('sh.work_date', 'ASC').addOrderBy('sh.start_time', 'ASC').getMany();
  }

  async getTimeOffBetween(from: string, to: string, stylistIds?: string[]): Promise<StylistTimeOff[]> {
    const qb = this.timeOffRepo.createQueryBuilder('t')
      .where('t.off_date BETWEEN :from AND :to', { from, to });
    if (stylistIds?.length) qb.andWhere('t.stylist_id IN (:...ids)', { ids: stylistIds });
    return qb.getMany();
  }

  /** Số lịch hẹn của từng thợ trong một ngày — dùng để "thợ bất kỳ" chọn người ít lịch nhất (S2-06). */
  async countAppointmentsByStylist(date: string): Promise<Map<string, number>> {
    const rows = await this.apptRepo
      .createQueryBuilder('a')
      .select('a.stylist_id', 'sid')
      .addSelect('COUNT(*)', 'cnt')
      .where('a.start_at BETWEEN :from AND :to', { from: startOfDay(date), to: endOfDay(date) })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .groupBy('a.stylist_id')
      .getRawMany<{ sid: string; cnt: string }>();
    return new Map(rows.map((r) => [r.sid, Number(r.cnt)]));
  }

  async findEntity(id: string): Promise<Stylist> {
    const s = await this.stylistRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
    return s;
  }

  async shiftsOnDateBetween(stylistId: string, from: Date, to: Date): Promise<Appointment[]> {
    return this.apptRepo.find({
      where: { stylistId, startAt: Between(from, to) },
      order: { startAt: 'ASC' },
    });
  }
}
