import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Stylist, StylistGender } from '../../database/entities/stylist.entity';
import { StylistService as StylistServiceLink } from '../../database/entities/stylist-service.entity';
import { StylistShift } from '../../database/entities/stylist-shift.entity';
import { StylistTimeOff } from '../../database/entities/stylist-time-off.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { Appointment, ACTIVE_STATUSES } from '../../database/entities/appointment.entity';
import { User } from '../../database/entities/user.entity';
import { Customer } from '../../database/entities/customer.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { Role } from '../../common/constants/roles.constant';
import { ERROR_CODES, MSG } from '../../common/constants/messages.constant';
import { generateTempPassword } from '../../common/utils/code.util';
import { MailService } from '../notifications/mail.service';
import { MailTemplates } from '../notifications/mail-templates';
import {
  addDays, combine, dayOfWeek, DOW_LABELS, endOfDay, startOfDay, timeToMinutes, toTimeString, trimSeconds,
} from '../../common/utils/time.util';
import { findShiftOverlap, shiftDayText, shiftLabel, ShiftRange, shiftRangeText } from './shift-rules';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import {
  CopyWeekDto, CreateShiftsDto, CreateStylistDto, CreateTimeOffDto, ShiftItemDto,
  UpdateShiftDto, UpdateStylistDto,
} from './dto/stylist.dto';

export interface StylistView {
  id: string;
  userId: string | null;
  /** Email đăng nhập của tài khoản nhân sự gắn với hồ sơ (null nếu chưa có tài khoản). */
  email: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  gender: StylistGender | null;
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
    private readonly config: ConfigService,
    private readonly mail: MailService,
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
    const userIds = stylists.map((s) => s.userId).filter((v): v is string => !!v);
    const users = userIds.length ? await this.userRepo.find({ where: { id: In(userIds) } }) : [];
    const emailMap = new Map(users.map((u) => [u.id, u.email]));

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
        email: s.userId ? emailMap.get(s.userId) ?? null : null,
        fullName: s.fullName,
        phone: s.phone,
        avatarUrl: s.avatarUrl,
        gender: s.gender,
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

  async create(dto: CreateStylistDto): Promise<StylistView & { tempPassword: string | null }> {
    if (dto.userId) {
      const user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException(MSG.USER_NOT_FOUND);
      const taken = await this.stylistRepo.findOne({ where: { userId: dto.userId } });
      if (taken) throw new ConflictException('Tài khoản này đã gắn với một hồ sơ thợ khác');
    }
    // Có email mà chưa gắn tài khoản -> tạo luôn tài khoản vai trò Thợ để hồ sơ và tài khoản khớp nhau
    const email = !dto.userId && dto.email ? dto.email.trim().toLowerCase() : null;
    if (email) {
      const existed = await this.userRepo
        .createQueryBuilder('u').where('lower(u.email) = :email', { email }).getOne();
      if (existed) throw new ConflictException({ message: MSG.EMAIL_DUPLICATED, field: 'email' });
    }
    const tempPassword = email ? generateTempPassword() : null;
    const saved = await this.dataSource.transaction(async (manager) => {
      let userId = dto.userId ?? null;
      if (email && tempPassword) {
        const user = await manager.save(manager.create(User, {
          fullName: dto.fullName.trim(),
          email,
          phone: dto.phone ?? null,
          role: Role.STYLIST,
          isActive: dto.isActive ?? true,
          mustChangePassword: true,
          passwordHash: await bcrypt.hash(tempPassword, this.config.get<number>('security.bcryptRounds')!),
        }));
        userId = user.id;
      }
      const stylist = await manager.save(
        manager.create(Stylist, {
          fullName: dto.fullName.trim(),
          phone: dto.phone ?? null,
          gender: dto.gender,
          bio: dto.bio ?? null,
          isActive: dto.isActive ?? true,
          userId,
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
    if (email && tempPassword) {
      const tpl = MailTemplates.accountCreated(this.mail.salonInfo, saved.fullName, email, tempPassword);
      await this.mail.enqueue({
        kind: EmailKind.ACCOUNT_CREATED, toEmail: email, toName: saved.fullName, subject: tpl.subject, html: tpl.html,
      });
    }
    // Trả mật khẩu tạm MỘT lần cho người tạo để hiển thị/sao chép ngay (Sprint 1 – Lỗi 4)
    return { ...(await this.findOne(saved.id)), tempPassword };
  }

  async update(id: string, dto: UpdateStylistDto): Promise<StylistView> {
    const stylist = await this.stylistRepo.findOne({ where: { id } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);

    if (dto.fullName !== undefined) stylist.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) stylist.phone = dto.phone;
    if (dto.gender !== undefined) stylist.gender = dto.gender;
    if (dto.bio !== undefined) stylist.bio = dto.bio;
    if (dto.isActive !== undefined) stylist.isActive = dto.isActive;

    // Đồng bộ ngược sang tài khoản nhân sự: thợ nghỉ việc mất quyền truy cập ngay (S1-02, S1-07)
    const user = stylist.userId ? await this.userRepo.findOne({ where: { id: stylist.userId } }) : null;
    if (user) {
      if (dto.fullName !== undefined) user.fullName = stylist.fullName;
      if (dto.phone !== undefined) user.phone = stylist.phone;
      if (dto.isActive !== undefined && user.isActive !== dto.isActive) {
        user.isActive = dto.isActive;
        if (!dto.isActive) user.sessionsValidFrom = new Date();
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Stylist, stylist);
      if (user) await manager.save(User, user);
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

  /**
   * Các thợ làm được TẤT CẢ dịch vụ đã chọn và đang làm việc.
   * QA-15: trước đây dùng dataSource.query('SELECT s.*') rồi ép kiểu `as Stylist[]` -> nhận về cột snake_case
   * (full_name, avatar_url) nên `fullName` luôn undefined: API /public/stylists trả thợ KHÔNG tên/ảnh, và
   * "thợ bất kỳ" sập 500 (undefined.localeCompare) mỗi khi hai thợ rảnh có cùng số lịch.
   */
  async findCapableStylists(serviceIds: string[]): Promise<Stylist[]> {
    const ids = Array.from(new Set(serviceIds));
    if (!ids.length) return [];
    return this.stylistRepo
      .createQueryBuilder('s')
      .where('s.is_active = TRUE')
      .andWhere(
        `(SELECT COUNT(DISTINCT ss.service_id) FROM stylist_services ss
           WHERE ss.stylist_id = s.id AND ss.service_id IN (:...ids)) = :n`,
        { ids, n: ids.length },
      )
      .orderBy('s.fullName', 'ASC')
      .getMany();
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
  async assertWithinSalonHours(item: ShiftItemDto): Promise<void> {
    const dow = dayOfWeek(item.workDate);
    const wh = await this.workingHours.getByDayOfWeek(dow);
    const outside = (message: string, details: Record<string, string | null> = {}): BadRequestException =>
      new BadRequestException({
        message, code: ERROR_CODES.SHIFT_OUTSIDE_OPERATING_HOURS, details: { workDate: item.workDate, ...details },
      });
    if (!wh || wh.isClosed) throw outside(`${DOW_LABELS[dow]} ${item.workDate}: ${MSG.SALON_CLOSED_THAT_DAY}`);
    // QA-08: "giờ mở cửa ngày hôm đó" gồm cả ngày nghỉ lễ / nghỉ đột xuất của tiệm, không chỉ lịch theo thứ
    const holiday = await this.workingHours.isHoliday(item.workDate);
    if (holiday) {
      throw outside(MSG.SHIFT_ON_HOLIDAY(shiftDayText(item.workDate), holiday.reason), { holidayReason: holiday.reason });
    }
    const open = timeToMinutes(trimSeconds(wh.openTime));
    const close = timeToMinutes(trimSeconds(wh.closeTime));
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (end <= start) throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu ca');
    if (start < open || end > close) {
      throw outside(MSG.SHIFT_OUT_OF_SALON_HOURS(trimSeconds(wh.openTime), trimSeconds(wh.closeTime)), {
        openTime: trimSeconds(wh.openTime), closeTime: trimSeconds(wh.closeTime),
      });
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

  /** Ca này có nằm trọn trong giờ mở cửa hôm đó không (dùng khi sao chép tuần — bỏ qua thay vì báo lỗi). */
  private async fitsSalonHours(item: ShiftItemDto): Promise<boolean> {
    try {
      await this.assertWithinSalonHours(item);
      return true;
    } catch (e) {
      if (e instanceof BadRequestException) return false;
      throw e;
    }
  }

  /**
   * QA-07: kiểm tra chồng lấn TRƯỚC khi chạm ràng buộc EXCLUDE để thông báo nêu rõ TÊN CA và KHUNG GIỜ
   * đang xung đột (lỗi 23P01 của CSDL chỉ biết báo chung chung). Xét cả ca đã lưu lẫn các ca trong cùng lô.
   */
  async assertNoShiftOverlap(stylistId: string, items: ShiftRange[]): Promise<void> {
    const dates = Array.from(new Set(items.map((i) => i.workDate)));
    const saved = await this.shiftRepo.find({ where: { stylistId, workDate: In(dates) } });
    const accepted: ShiftRange[] = saved.map((s) => ({
      id: s.id, workDate: String(s.workDate), startTime: trimSeconds(s.startTime), endTime: trimSeconds(s.endTime), note: s.note,
    }));
    for (const item of items) {
      const hit = findShiftOverlap(item, accepted);
      if (hit) {
        throw new ConflictException({
          message: MSG.SHIFT_OVERLAP_DETAIL(shiftRangeText(item), shiftLabel(hit), shiftRangeText(hit), shiftDayText(item.workDate)),
          field: 'startTime',
          code: ERROR_CODES.SHIFT_OVERLAP,
          details: {
            workDate: item.workDate,
            conflictWith: { id: hit.id ?? null, label: shiftLabel(hit), startTime: hit.startTime, endTime: hit.endTime },
          },
        });
      }
      accepted.push(item);
    }
  }

  async createShifts(stylistId: string, dto: CreateShiftsDto): Promise<ShiftView[]> {
    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
    if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);

    for (const item of dto.shifts) await this.assertWithinSalonHours(item);
    await this.assertNoShiftOverlap(stylistId, dto.shifts.map((s) => ({ ...s, note: s.note ?? null })));

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
    await this.assertNoShiftOverlap(shift.stylistId, [{
      id: shift.id, workDate: merged.workDate, startTime: merged.startTime, endTime: merged.endTime,
      note: dto.note !== undefined ? dto.note : shift.note,
    }]);

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
      const customerIds = Array.from(new Set(inside.map((a) => a.customerId)));
      const customers = await this.dataSource.getRepository(Customer).find({ where: { id: In(customerIds) } });
      const names = new Map(customers.map((c) => [c.id, c.fullName]));
      const appointments = inside.map((a) => ({
        id: a.id,
        code: a.code,
        startTime: toTimeString(a.startAt),
        endTime: toTimeString(a.endAt),
        customerName: names.get(a.customerId) ?? '',
        status: a.status,
      }));
      throw new ConflictException({
        message: `${MSG.SHIFT_HAS_APPOINTMENTS}: ${appointments
          .map((a) => `${a.code} (${a.startTime}–${a.endTime}${a.customerName ? `, ${a.customerName}` : ''})`)
          .join('; ')}`,
        code: ERROR_CODES.SHIFT_HAS_APPOINTMENTS,
        details: { appointments },
      });
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
        // QA-08: ngày đích có thể là ngày nghỉ của tiệm hoặc giờ mở cửa đã đổi -> chỉ chép ca còn hợp lệ
        const valid: StylistShift[] = [];
        for (const s of bucket.items) {
          const fits = await this.fitsSalonHours({
            workDate: bucket.targetDate,
            startTime: trimSeconds(s.startTime),
            endTime: trimSeconds(s.endTime),
            breakStart: s.breakStart ? trimSeconds(s.breakStart) : null,
            breakEnd: s.breakEnd ? trimSeconds(s.breakEnd) : null,
          });
          if (fits) valid.push(s); else skipped += 1;
        }
        if (!valid.length) continue;
        bucket.items = valid;

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
