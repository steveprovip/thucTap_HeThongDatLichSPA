import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ACTIVE_STATUSES, Appointment, AppointmentStatus,
} from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { AppointmentChange } from '../../database/entities/appointment-change.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist, StylistGender } from '../../database/entities/stylist.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { ERROR_CODES, MSG, REJECT_REASONS } from '../../common/constants/messages.constant';
import { Role } from '../../common/constants/roles.constant';
import { AuthUser } from '../../common/types/auth.types';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import {
  addMinutes, combine, dayOfWeek, diffMinutes, endOfDay, formatDateTimeVN, startOfDay,
  toDateString, toTimeString, trimSeconds,
} from '../../common/utils/time.util';
import { normalizeSearch } from '../../common/utils/text.util';
import { AvailabilityService } from './availability.service';
import { saveAppointmentGuarded } from './appointment-guard';
import { SlotHoldService } from './slot-hold.service';
import { BookingService } from './booking.service';
import { StylistsService } from '../stylists/stylists.service';
import { CustomersService } from '../customers/customers.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { MailService } from '../notifications/mail.service';
import { MailTemplates } from '../notifications/mail-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { EventDispatcherService } from '../notifications/event-dispatcher.service';
import { AppointmentView, mapAppointment } from './appointment.mapper';
import {
  BulkReassignDto, ListAppointmentsQuery, RescheduleDto,
} from './dto/booking.dto';

export interface TimelineColumn {
  stylistId: string;
  stylistName: string;
  avatarUrl: string | null;
  gender: StylistGender | null;
  /** Các khoảng thợ có mặt (trong ca), theo 'HH:mm'. */
  workingBlocks: { start: string; end: string }[];
  /** Nghỉ giữa ca và nghỉ riêng — tô khác màu, không nhận thao tác đặt lịch. */
  offBlocks: { start: string; end: string; reason: string }[];
  appointments: AppointmentView[];
}

export interface DayTimeline {
  date: string;
  dayLabel: string;
  salonOpen: string;
  salonClose: string;
  salonClosed: boolean;
  closedReason: string | null;
  stepMinutes: number;
  columns: TimelineColumn[];
  summary: Record<AppointmentStatus, number>;
}

/** Con trỏ keyset của danh sách lịch hẹn: base64url("<start_at ISO>|<id>"). */
export const encodeListCursor = (startAt: Date, id: string): string =>
  Buffer.from(`${startAt.toISOString()}|${id}`).toString('base64url');
export const decodeListCursor = (cursor: string): { startAt: Date; id: string } | null => {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const startAt = new Date(iso ?? '');
  return !Number.isNaN(startAt.getTime()) && /^[0-9a-f-]{36}$/i.test(id ?? '') ? { startAt, id } : null;
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
    private readonly stylists: StylistsService,
    private readonly customers: CustomersService,
    private readonly workingHours: WorkingHoursService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly dispatcher: EventDispatcherService,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
    @InjectRepository(AppointmentChange) private readonly changeRepo: Repository<AppointmentChange>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  private get pendingOverdueHours(): number {
    return this.config.get<number>('business.pendingOverdueHours')!;
  }

  // ------------------------------------------------------------ HỖ TRỢ MAP
  private async decorate(appts: Appointment[], viewerRole: Role): Promise<AppointmentView[]> {
    if (!appts.length) return [];
    const customers = await this.customerRepo.find({
      where: { id: In(Array.from(new Set(appts.map((a) => a.customerId)))) },
    });
    const stylists = await this.stylistRepo.find({
      where: { id: In(Array.from(new Set(appts.map((a) => a.stylistId)))) },
    });
    const services = await this.apptServiceRepo.find({
      where: { appointmentId: In(appts.map((a) => a.id)) },
    });
    const ctx = { viewerRole, pendingOverdueHours: this.pendingOverdueHours };
    return appts.map((a) =>
      mapAppointment(
        a,
        customers.find((c) => c.id === a.customerId)!,
        stylists.find((s) => s.id === a.stylistId)!,
        services.filter((s) => s.appointmentId === a.id),
        ctx,
      ),
    );
  }

  private async getOrFail(id: string): Promise<Appointment> {
    const appt = await this.apptRepo.findOne({ where: { id } });
    if (!appt) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
    return appt;
  }

  private async logChange(
    appointmentId: string, field: string, oldValue: string | null, newValue: string | null, actor: AuthUser,
  ): Promise<void> {
    await this.changeRepo.save(
      this.changeRepo.create({
        appointmentId, field, oldValue, newValue,
        changedBy: actor.id, changedByName: actor.fullName,
      }),
    );
  }

  /** Thợ chỉ được thao tác trên lịch hẹn của chính mình (S3-08). */
  private assertOwnership(appt: Appointment, user: AuthUser): void {
    if (user.role === Role.STYLIST && appt.stylistId !== user.stylistId) {
      throw new ForbiddenException(MSG.FORBIDDEN_OWN_DATA);
    }
  }

  // =========================================================================
  //  S3-01 — LỊCH NGÀY DẠNG CỘT THEO THỢ
  // =========================================================================
  async dayTimeline(date: string, viewerRole: Role, onlyStylistId?: string): Promise<DayTimeline> {
    const dow = dayOfWeek(date);
    const wh = await this.workingHours.getByDayOfWeek(dow);
    const holiday = await this.workingHours.isHoliday(date);

    let stylists = await this.stylistRepo.find({ where: { isActive: true }, order: { fullName: 'ASC' } });
    if (onlyStylistId) stylists = stylists.filter((s) => s.id === onlyStylistId);
    const stylistIds = stylists.map((s) => s.id);

    const shifts = stylistIds.length ? await this.stylists.getShiftsForDate(date, stylistIds) : [];
    const timeOff = stylistIds.length ? await this.stylists.getTimeOffForDate(date, stylistIds) : [];

    const appts = stylistIds.length
      ? await this.apptRepo
          .createQueryBuilder('a')
          .where('a.stylist_id IN (:...ids)', { ids: stylistIds })
          .andWhere('a.start_at >= :from AND a.start_at <= :to', {
            from: startOfDay(date), to: endOfDay(date),
          })
          .orderBy('a.start_at', 'ASC')
          .getMany()
      : [];

    const views = await this.decorate(appts, viewerRole);
    const viewById = new Map(views.map((v) => [v.id, v]));

    const columns: TimelineColumn[] = stylists.map((stylist) => {
      const myShifts = shifts.filter((s) => s.stylistId === stylist.id);
      const myOff = timeOff.filter((t) => t.stylistId === stylist.id);

      const offBlocks: { start: string; end: string; reason: string }[] = [];
      for (const s of myShifts) {
        if (s.breakStart && s.breakEnd) {
          offBlocks.push({
            start: trimSeconds(s.breakStart), end: trimSeconds(s.breakEnd), reason: 'Nghỉ giữa ca',
          });
        }
      }
      for (const t of myOff) {
        offBlocks.push({
          start: t.startTime ? trimSeconds(t.startTime) : (wh ? trimSeconds(wh.openTime) : '08:00'),
          end: t.endTime ? trimSeconds(t.endTime) : (wh ? trimSeconds(wh.closeTime) : '20:00'),
          reason: t.reason ?? 'Thợ nghỉ',
        });
      }

      return {
        stylistId: stylist.id,
        stylistName: stylist.fullName,
        avatarUrl: stylist.avatarUrl,
        gender: stylist.gender,
        workingBlocks: myShifts.map((s) => ({
          start: trimSeconds(s.startTime), end: trimSeconds(s.endTime),
        })),
        offBlocks,
        appointments: appts
          .filter((a) => a.stylistId === stylist.id)
          .map((a) => viewById.get(a.id)!)
          .filter(Boolean),
      };
    });

    const summary = {
      [AppointmentStatus.PENDING]: 0,
      [AppointmentStatus.CONFIRMED]: 0,
      [AppointmentStatus.ARRIVED]: 0,
      [AppointmentStatus.IN_PROGRESS]: 0,
      [AppointmentStatus.COMPLETED]: 0,
      [AppointmentStatus.CANCELLED]: 0,
      [AppointmentStatus.NO_SHOW]: 0,
    } as Record<AppointmentStatus, number>;
    for (const a of appts) summary[a.status] += 1;

    return {
      date,
      dayLabel: ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][dow],
      salonOpen: wh ? trimSeconds(wh.openTime) : '08:00',
      salonClose: wh ? trimSeconds(wh.closeTime) : '20:00',
      salonClosed: !wh || wh.isClosed || !!holiday,
      closedReason: holiday ? holiday.reason : !wh || wh.isClosed ? MSG.SALON_CLOSED_WEEKLY : null,
      stepMinutes: this.config.get<number>('business.slotStepMinutes')!,
      columns,
      summary,
    };
  }

  // =========================================================================
  //  DANH SÁCH / CHI TIẾT
  // =========================================================================
  async list(
    query: ListAppointmentsQuery, user: AuthUser,
  ): Promise<PaginatedResult<AppointmentView> & { nextCursor: string | null }> {
    const qb = this.apptRepo.createQueryBuilder('a');
    // customer_id NOT NULL + khoá ngoại → JOIN chỉ cần khi tìm theo tên / SĐT khách (đếm tổng nhanh gấp ~5 lần ở 50k dòng)
    if (query.search) qb.innerJoin('customers', 'c', 'c.id = a.customer_id');

    if (user.role === Role.STYLIST) {
      if (!user.stylistId) return { ...paginate<AppointmentView>([], 0, query.page, query.limit), nextCursor: null };
      qb.andWhere('a.stylist_id = :own', { own: user.stylistId });
    } else if (query.stylistId) {
      qb.andWhere('a.stylist_id = :sid', { sid: query.stylistId });
    }
    if (query.from) qb.andWhere('a.start_at >= :from', { from: startOfDay(query.from) });
    if (query.to) qb.andWhere('a.start_at <= :to', { to: endOfDay(query.to) });
    if (query.status) qb.andWhere('a.status = :st', { st: query.status });
    if (query.source) qb.andWhere('a.source = :src', { src: query.source });
    if (query.search) {
      qb.andWhere(
        '(a.code ILIKE :raw OR c.phone LIKE :raw OR f_unaccent(lower(c.full_name)) LIKE :t)',
        { raw: `%${query.search.trim()}%`, t: `%${normalizeSearch(query.search)}%` },
      );
    }
    const total = await qb.getCount();
    // Part 4 (tải x10): JOIN customers là 1–1 nên dùng OFFSET/LIMIT thẳng (skip/take của TypeORM dựng thêm truy vấn
    // con DISTINCT rất chậm ở 50.000+ lịch). Có `cursor` thì phân trang keyset theo (start_at, id) — luôn dùng chỉ mục,
    // trang sâu nhanh như trang đầu. orderBy dùng tên thuộc tính (startAt) như cũ.
    // TASK v4 · NV3: order=asc (lịch sắp tới, sớm nhất trước) chỉ lật theo số trang; con trỏ keyset giữ nguyên cho 'desc'
    const asc = query.order === 'asc';
    if (query.cursor && !asc) {
      const c = decodeListCursor(query.cursor);
      if (!c) throw new BadRequestException({ message: 'Con trỏ phân trang không hợp lệ', field: 'cursor' });
      qb.andWhere('(a.start_at, a.id) < (:cs, :cid)', { cs: c.startAt, cid: c.id });
    } else {
      qb.offset((query.page - 1) * query.limit);
    }
    qb.orderBy('a.startAt', asc ? 'ASC' : 'DESC').addOrderBy('a.id', asc ? 'ASC' : 'DESC').limit(query.limit);

    const items = await qb.getMany();
    const last = !asc && items.length === query.limit ? items[items.length - 1] : null;
    return {
      ...paginate(await this.decorate(items, user.role), total, query.page, query.limit),
      nextCursor: last ? encodeListCursor(last.startAt, last.id) : null,
    };
  }

  async detail(id: string, user: AuthUser): Promise<AppointmentView & { changes: AppointmentChange[] }> {
    const appt = await this.getOrFail(id);
    this.assertOwnership(appt, user);
    const [view] = await this.decorate([appt], user.role);
    const changes = await this.changeRepo.find({
      where: { appointmentId: id }, order: { createdAt: 'DESC' },
    });
    return { ...view, changes };
  }

  /** S3-02: danh sách riêng các lịch đặt online đang chờ xác nhận. */
  async listPending(user: AuthUser): Promise<AppointmentView[]> {
    const appts = await this.apptRepo.find({
      where: { status: AppointmentStatus.PENDING },
      order: { startAt: 'ASC' },
    });
    return this.decorate(appts, user.role);
  }

  /**
   * TASK v3 · NV2 — danh sách Chờ xác nhận có phân trang ở MÁY CHỦ (5.000+ lịch): lịch chưa xử lý quá 12 giờ luôn
   * xếp đầu (nên nằm ở trang 1), sau đó theo lựa chọn: giờ hẹn cũ nhất / mới nhất, tên khách A–Z (không dấu).
   */
  async listPendingPaged(
    q: { page: number; limit: number; sort: 'start_asc' | 'start_desc' | 'name_asc' }, user: AuthUser,
  ): Promise<PaginatedResult<AppointmentView> & { overdueCount: number }> {
    const overdueBefore = new Date(Date.now() - this.pendingOverdueHours * 3600_000);
    const order = q.sort === 'start_desc' ? 'a.start_at DESC' : q.sort === 'name_asc' ? 'f_unaccent(lower(c.full_name)) ASC, a.start_at ASC' : 'a.start_at ASC';
    const [{ total, overdue }] = await this.dataSource.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at < $1)::int AS overdue
         FROM appointments WHERE status = 'pending'`, [overdueBefore]);
    const ids: { id: string }[] = await this.dataSource.query(
      `SELECT a.id FROM appointments a JOIN customers c ON c.id = a.customer_id
        WHERE a.status = 'pending'
        ORDER BY (a.created_at < $1) DESC, ${order}, a.id
        LIMIT $2 OFFSET $3`, [overdueBefore, q.limit, (q.page - 1) * q.limit]);
    const appts = ids.length ? await this.apptRepo.find({ where: { id: In(ids.map((r) => r.id)) } }) : [];
    const byId = new Map(appts.map((a) => [a.id, a]));
    const items = await this.decorate(ids.map((r) => byId.get(r.id)!).filter(Boolean), user.role);
    return { ...paginate(items, total, q.page, q.limit), overdueCount: overdue };
  }

  get rejectReasons(): readonly string[] {
    return REJECT_REASONS;
  }

  // =========================================================================
  //  S3-02 — XÁC NHẬN / TỪ CHỐI
  // =========================================================================
  async confirm(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException(MSG.INVALID_STATUS_TRANSITION(appt.status, AppointmentStatus.CONFIRMED));
    }
    appt.status = AppointmentStatus.CONFIRMED;
    appt.confirmedAt = new Date();
    appt.confirmedBy = user.id;
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.PENDING]);

    await this.logChange(id, 'status', 'pending', 'confirmed', user);
    await this.booking.scheduleReminder(id);
    await this.notifications.notifyStylist(
      appt.stylistId, NotificationType.APPOINTMENT_ASSIGNED, 'Lịch hẹn đã được xác nhận',
      `Lịch ${appt.code} lúc ${formatDateTimeVN(appt.startAt)} đã được xác nhận`, id,
    );

    const [view] = await this.decorate([appt], user.role);
    void this.dispatcher.emit('appointment.confirmed', {
      appointmentId: appt.id, code: appt.code, status: appt.status, source: appt.source, startAt: appt.startAt.toISOString(),
      startAtText: formatDateTimeVN(appt.startAt), customerName: view.customer.fullName, customerPhone: view.customer.phone,
      stylistName: view.stylist?.fullName ?? '', services: view.services.map((s) => s.name), estimatedTotal: view.estimatedTotal,
    });
    return view;
  }

  async reject(id: string, reason: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException(MSG.INVALID_STATUS_TRANSITION(appt.status, AppointmentStatus.CANCELLED));
    }
    if (!reason?.trim()) throw new BadRequestException(MSG.REJECT_REASON_REQUIRED);

    appt.status = AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancelledByUser = user.id;
    appt.cancelledByLabel = user.fullName;
    appt.cancelReason = reason.slice(0, 255);
    appt.rejectedReason = reason.slice(0, 255);
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.PENDING]);

    await this.logChange(id, 'status', 'pending', 'cancelled', user);
    await this.mail.cancelPendingFor(id, [EmailKind.BOOKING_REMINDER]);
    await this.sendCancelEmail(appt, reason);
    await this.customers.refreshCounters(appt.customerId);

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  /**
   * QA 11/10: khách có email PHẢI nhận thư khi lịch bị huỷ / dời — gửi ngay (không chờ worker mỗi phút).
   * Thao tác nghiệp vụ đã lưu xong trước khi gọi, nên lỗi email chỉ ghi log, không biến thành 500.
   */
  private async safeMail(appt: Appointment, what: string, send: () => Promise<boolean>): Promise<void> {
    try {
      if (await send()) this.booking.kickMailWorker();
    } catch (e) {
      this.logger.error(`Lịch ${appt.code}: xếp email ${what} lỗi — ${(e as Error).message}`);
    }
  }

  private sendCancelEmail(appt: Appointment, reason: string): Promise<void> {
    return this.safeMail(appt, 'huỷ lịch', () => this.enqueueCancelEmail(appt, reason));
  }

  private sendChangedEmail(appt: Appointment, summary: string): Promise<void> {
    return this.safeMail(appt, 'đổi lịch', () => this.enqueueChangedEmail(appt, summary));
  }

  private async enqueueCancelEmail(appt: Appointment, reason: string): Promise<boolean> {
    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    if (!customer?.email) return false;
    const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId: appt.id } });
    const tpl = MailTemplates.bookingCancelled(
      this.mail.salonInfo,
      {
        code: appt.code, customerName: customer.fullName, stylistName: stylist?.fullName ?? '',
        startAt: appt.startAt, endAt: appt.endAt,
        services: services.map((s) => ({
          name: s.nameSnapshot, durationMinutes: s.durationSnapshot, price: s.priceSnapshot,
        })),
        totalDuration: appt.totalDurationMinutes, estimatedTotal: appt.estimatedTotal,
      },
      reason,
    );
    await this.mail.enqueue({
      kind: EmailKind.BOOKING_CANCELLED, toEmail: customer.email, toName: customer.fullName,
      subject: tpl.subject, html: tpl.html, appointmentId: appt.id,
    });
    return true;
  }

  private async enqueueChangedEmail(appt: Appointment, summary: string): Promise<boolean> {
    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    if (!customer?.email) return false;
    const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId: appt.id } });
    const tpl = MailTemplates.bookingChanged(
      this.mail.salonInfo,
      {
        code: appt.code, customerName: customer.fullName, stylistName: stylist?.fullName ?? '',
        startAt: appt.startAt, endAt: appt.endAt,
        services: services.map((s) => ({
          name: s.nameSnapshot, durationMinutes: s.durationSnapshot, price: s.priceSnapshot,
        })),
        totalDuration: appt.totalDurationMinutes, estimatedTotal: appt.estimatedTotal,
      },
      summary,
    );
    await this.mail.enqueue({
      kind: EmailKind.BOOKING_CHANGED, toEmail: customer.email, toName: customer.fullName,
      subject: tpl.subject, html: tpl.html, appointmentId: appt.id,
    });
    return true;
  }

  // =========================================================================
  //  S3-03 — CHECK-IN
  // =========================================================================
  async checkIn(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException(MSG.CHECKIN_REQUIRES_CONFIRMED);
    }
    const window = this.config.get<number>('business.checkInWindowMinutes')!;
    const now = new Date();
    const delta = diffMinutes(now, appt.startAt);
    if (delta < -window || delta > window) throw new BadRequestException(MSG.CHECKIN_WINDOW);

    appt.status = AppointmentStatus.ARRIVED;
    appt.arrivedAt = now;
    appt.checkedInBy = user.id;
    if (delta > 15) {
      appt.isLate = true;
      appt.lateMinutes = delta;
    }
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.CONFIRMED]);
    await this.logChange(id, 'status', 'confirmed', 'arrived', user);

    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    await this.notifications.notifyStylist(
      appt.stylistId, NotificationType.CUSTOMER_CHECKED_IN, 'Khách đã đến',
      `${customer?.fullName ?? 'Khách'} (${appt.code}) đã check-in${appt.isLate ? `, trễ ${appt.lateMinutes} phút` : ''}`,
      id,
    );

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  // =========================================================================
  //  S3-04 — ĐỔI THỢ / DỜI GIỜ
  // =========================================================================
  async reschedule(id: string, dto: RescheduleDto, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (!ACTIVE_STATUSES.includes(appt.status)) {
      throw new BadRequestException(`Không thể dời lịch ở trạng thái "${appt.status}"`);
    }

    const services = await this.apptServiceRepo.find({ where: { appointmentId: id } });
    const serviceIds = services.map((s) => s.serviceId);
    const totalDuration = appt.totalDurationMinutes;

    const newStylistId = dto.stylistId ?? appt.stylistId;
    const newDate = dto.date ?? toDateString(appt.startAt);
    const newTime = dto.time ?? toTimeString(appt.startAt);

    if (newStylistId === appt.stylistId && newDate === toDateString(appt.startAt)
        && newTime === toTimeString(appt.startAt)) {
      const [unchanged] = await this.decorate([appt], user.role);
      return unchanged;
    }

    // Tiệm nghỉ cả ngày (nghỉ lễ / nghỉ cố định): không dời lịch vào ngày đó, báo rõ lý do
    await this.availability.assertSalonOpen(newDate, 'reschedule');

    // Kiểm tra kỹ năng thợ mới
    if (newStylistId !== appt.stylistId) {
      const stylist = await this.stylistRepo.findOne({ where: { id: newStylistId } });
      if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
      if (!stylist.isActive) throw new BadRequestException(MSG.STYLIST_INACTIVE);
      const skill = await this.stylists.canDoAll(newStylistId, serviceIds);
      if (!skill.ok) throw new BadRequestException(MSG.STYLIST_MISSING_SKILL(skill.missing.join(', ')));
    }

    // Kiểm tra khoảng trống, bỏ qua chính lịch hẹn đang sửa
    const free = await this.availability.canBook({
      date: newDate, time: newTime, stylistId: newStylistId, totalDuration,
      ignoreLeadTime: true, excludeAppointmentId: id,
    });
    if (!free) throw new ConflictException(MSG.SLOT_INVALID);

    const oldStylistId = appt.stylistId;
    const oldStart = appt.startAt;
    const newStart = combine(newDate, newTime);
    const newEnd = addMinutes(newStart, totalDuration);

    appt.stylistId = newStylistId;
    appt.startAt = newStart;
    appt.endAt = newEnd;
    // Ghi trong giao dịch có khoá dòng thợ ĐÍCH (cùng khoá với luồng đặt lịch) + khoá dòng lịch hẹn: kiểm tra lại
    // chồng lịch và chỗ đang được khách giữ ngay trong khoá, không dựa vào lần kiểm tra canBook ở ngoài giao dịch.
    await this.dataSource.transaction(async (manager) => {
      const locked: { id: string }[] = await manager.query('SELECT id FROM stylists WHERE id = $1 FOR UPDATE', [newStylistId]);
      if (!locked.length) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
      const cur: { status: AppointmentStatus }[] = await manager.query(
        'SELECT status FROM appointments WHERE id = $1 FOR UPDATE', [id],
      );
      if (!cur.length) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
      if (!ACTIVE_STATUSES.includes(cur[0].status)) {
        throw new ConflictException(MSG.APPOINTMENT_CHANGED_CONCURRENTLY(cur[0].status));
      }
      const clash: unknown[] = await manager.query(
        `SELECT 1 FROM appointments
          WHERE stylist_id = $1 AND id <> $4
            AND status IN ('pending','confirmed','arrived','in_progress')
            AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
          LIMIT 1`,
        [newStylistId, newStart.toISOString(), newEnd.toISOString(), id],
      );
      if (clash.length) throw new ConflictException(MSG.SLOT_TAKEN);
      if (await SlotHoldService.heldByOthers(manager, newStylistId, newStart, newEnd)) {
        throw new ConflictException({ message: MSG.SLOT_HELD, code: ERROR_CODES.SLOT_HELD });
      }
      await manager.save(Appointment, appt);
    });

    const parts: string[] = [];
    if (oldStylistId !== newStylistId) {
      const [oldS, newS] = await Promise.all([
        this.stylistRepo.findOne({ where: { id: oldStylistId } }),
        this.stylistRepo.findOne({ where: { id: newStylistId } }),
      ]);
      await this.logChange(id, 'stylist', oldS?.fullName ?? oldStylistId, newS?.fullName ?? newStylistId, user);
      parts.push(`Đổi thợ từ ${oldS?.fullName} sang ${newS?.fullName}`);
    }
    if (oldStart.getTime() !== newStart.getTime()) {
      await this.logChange(id, 'start_at', formatDateTimeVN(oldStart), formatDateTimeVN(newStart), user);
      parts.push(`Dời giờ từ ${formatDateTimeVN(oldStart)} sang ${formatDateTimeVN(newStart)}`);
    }

    const summary = parts.join('. ');
    await this.sendChangedEmail(appt, summary);
    await this.booking.scheduleReminder(id);

    if (oldStylistId !== newStylistId) {
      await this.notifications.notifyStylist(
        newStylistId, NotificationType.APPOINTMENT_ASSIGNED, 'Bạn vừa được giao một lịch hẹn',
        `Lịch ${appt.code} lúc ${formatDateTimeVN(newStart)}`, id,
      );
      await this.notifications.notifyStylist(
        oldStylistId, NotificationType.APPOINTMENT_RESCHEDULED, 'Lịch hẹn đã chuyển cho thợ khác',
        `Lịch ${appt.code} lúc ${formatDateTimeVN(oldStart)} đã chuyển sang thợ khác`, id,
      );
    } else {
      await this.notifications.notifyStylist(
        newStylistId, NotificationType.APPOINTMENT_RESCHEDULED, 'Lịch hẹn đổi giờ',
        `Lịch ${appt.code} chuyển sang ${formatDateTimeVN(newStart)}`, id,
      );
    }

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  // =========================================================================
  //  S3-06 — KHÔNG ĐẾN / HOÀN TÁC
  // =========================================================================
  async markNoShow(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status === AppointmentStatus.ARRIVED || appt.status === AppointmentStatus.IN_PROGRESS
        || appt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException(MSG.NO_SHOW_ALREADY_ARRIVED);
    }
    if (!ACTIVE_STATUSES.includes(appt.status)) {
      throw new BadRequestException(MSG.INVALID_STATUS_TRANSITION(appt.status, AppointmentStatus.NO_SHOW));
    }
    const after = this.config.get<number>('business.noShowAfterMinutes')!;
    if (diffMinutes(new Date(), appt.startAt) < after) {
      throw new BadRequestException(MSG.NO_SHOW_TOO_EARLY(after));
    }

    const prev = appt.status;
    appt.status = AppointmentStatus.NO_SHOW;
    appt.noShowAt = new Date();
    appt.noShowBy = user.id;
    await saveAppointmentGuarded(this.dataSource, appt, [prev]);

    await this.logChange(id, 'status', prev, 'no_show', user);
    await this.mail.cancelPendingFor(id, [EmailKind.BOOKING_REMINDER]);
    await this.customers.refreshCounters(appt.customerId);

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  /** Hoàn tác trong vòng 15 phút (S3-06). */
  async undoNoShow(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status !== AppointmentStatus.NO_SHOW) {
      throw new BadRequestException('Lịch hẹn không ở trạng thái không đến');
    }
    const undoWindow = this.config.get<number>('business.noShowUndoMinutes')!;
    if (!appt.noShowAt || diffMinutes(new Date(), appt.noShowAt) > undoWindow) {
      throw new BadRequestException(MSG.UNDO_WINDOW_EXPIRED(undoWindow));
    }

    appt.status = appt.confirmedAt ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;
    appt.noShowAt = null;
    appt.noShowBy = null;
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.NO_SHOW]);

    await this.logChange(id, 'status', 'no_show', appt.status, user);
    await this.customers.refreshCounters(appt.customerId);

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  /** Lễ tân / chủ tiệm huỷ lịch (khác với khách tự huỷ). */
  async cancelByStaff(id: string, reason: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    if (appt.status === AppointmentStatus.CANCELLED) throw new BadRequestException(MSG.ALREADY_CANCELLED);
    if (!ACTIVE_STATUSES.includes(appt.status)) {
      throw new BadRequestException(MSG.INVALID_STATUS_TRANSITION(appt.status, AppointmentStatus.CANCELLED));
    }
    const prev = appt.status;
    appt.status = AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancelledByUser = user.id;
    appt.cancelledByLabel = user.fullName;
    appt.cancelReason = (reason || 'Tiệm huỷ').slice(0, 255);
    await saveAppointmentGuarded(this.dataSource, appt, [prev]);

    await this.logChange(id, 'status', prev, 'cancelled', user);
    await this.mail.cancelPendingFor(id, [EmailKind.BOOKING_REMINDER]);
    await this.sendCancelEmail(appt, appt.cancelReason);
    await this.customers.refreshCounters(appt.customerId);
    await this.notifications.notifyStylist(
      appt.stylistId, NotificationType.APPOINTMENT_CANCELLED, 'Lịch hẹn bị huỷ',
      `Lịch ${appt.code} lúc ${formatDateTimeVN(appt.startAt)} đã bị huỷ`, id,
    );

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  // =========================================================================
  //  S3-08 — THỢ BẮT ĐẦU / HOÀN TẤT
  // =========================================================================
  async start(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    this.assertOwnership(appt, user);
    if (appt.status !== AppointmentStatus.ARRIVED) throw new BadRequestException(MSG.START_REQUIRES_ARRIVED);

    appt.status = AppointmentStatus.IN_PROGRESS;
    appt.startedAt = new Date();
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.ARRIVED]);
    await this.logChange(id, 'status', 'arrived', 'in_progress', user);

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  async complete(id: string, user: AuthUser): Promise<AppointmentView> {
    const appt = await this.getOrFail(id);
    this.assertOwnership(appt, user);
    if (appt.status !== AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException(MSG.COMPLETE_REQUIRES_STARTED);
    }

    const now = new Date();
    appt.status = AppointmentStatus.COMPLETED;
    appt.completedAt = now;
    appt.actualDurationMinutes = appt.startedAt ? diffMinutes(now, appt.startedAt) : appt.totalDurationMinutes;
    await saveAppointmentGuarded(this.dataSource, appt, [AppointmentStatus.IN_PROGRESS]);

    await this.logChange(id, 'status', 'in_progress', 'completed', user);
    await this.customers.refreshCounters(appt.customerId);

    // Vượt thời lượng chuẩn quá ngưỡng thì cảnh báo lễ tân (S3-08) — trừ khi đã cảnh báo TRONG LÚC làm (watchOverruns)
    const overrun = this.config.get<number>('business.overrunWarningMinutes')!;
    const [warned] = await this.dataSource.query(
      `SELECT 1 FROM notifications WHERE appointment_id = $1 AND type = 'overrun_warning' LIMIT 1`, [id]);
    if (!warned && (appt.actualDurationMinutes ?? 0) - appt.totalDurationMinutes > overrun) {
      const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
      const receptionists = await this.dataSource.query(
        `SELECT id FROM users WHERE role IN ('receptionist','owner') AND is_active = TRUE`,
      );
      for (const r of receptionists as { id: string }[]) {
        await this.notifications.create({
          userId: r.id,
          type: NotificationType.OVERRUN_WARNING,
          title: 'Lượt dịch vụ vượt thời lượng chuẩn',
          body: `${stylist?.fullName ?? 'Thợ'} làm lịch ${appt.code} mất ${appt.actualDurationMinutes} phút `
            + `so với chuẩn ${appt.totalDurationMinutes} phút. Các lịch sau có nguy cơ trễ.`,
          appointmentId: id,
        });
      }
    }

    const [view] = await this.decorate([appt], user.role);
    return view;
  }

  /**
   * QA Sprint 3 · mục 6 — cảnh báo NGAY KHI lịch đang làm vượt thời lượng chuẩn quá ngưỡng (mặc định 20′), không đợi
   * thợ bấm Hoàn tất: lễ tân còn kịp báo khách kế tiếp / chuyển thợ. Mỗi lịch cảnh báo đúng một lần.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async watchOverruns(now: Date = new Date()): Promise<number> {
    const overrun = this.config.get<number>('business.overrunWarningMinutes')!;
    const rows: { id: string; code: string; full_name: string; total: number; elapsed: number; next_appt: string | null }[] =
      await this.dataSource.query(
        `SELECT a.id, a.code, s.full_name, a.total_duration_minutes AS total,
                floor(extract(epoch FROM ($2::timestamptz - a.started_at)) / 60)::int AS elapsed,
                (SELECT n.code || ' lúc ' || to_char(n.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI')
                   FROM appointments n
                  WHERE n.stylist_id = a.stylist_id AND n.id <> a.id AND n.status IN ('pending','confirmed','arrived')
                    AND n.start_at >= a.start_at
                  ORDER BY n.start_at LIMIT 1) AS next_appt
           FROM appointments a JOIN stylists s ON s.id = a.stylist_id
          WHERE a.status = 'in_progress' AND a.started_at IS NOT NULL
            AND a.started_at + make_interval(mins => a.total_duration_minutes + $1) < $2::timestamptz
            AND NOT EXISTS (SELECT 1 FROM notifications x WHERE x.appointment_id = a.id AND x.type = 'overrun_warning')`,
        [overrun, now],
      );
    if (!rows.length) return 0;
    const managers: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM users WHERE role IN ('receptionist','owner') AND is_active = TRUE`);
    for (const r of rows) {
      for (const m of managers) {
        await this.notifications.create({
          userId: m.id,
          type: NotificationType.OVERRUN_WARNING,
          title: `Lịch ${r.code} đang vượt giờ chuẩn`,
          body: `${r.full_name} đã làm ${r.elapsed} phút (chuẩn ${r.total} phút, vượt ${r.elapsed - r.total} phút). `
            + (r.next_appt ? `Lịch kế tiếp ${r.next_appt} có nguy cơ trễ — cân nhắc báo khách hoặc chuyển thợ.` : 'Thợ chưa có lịch kế tiếp.'),
          appointmentId: r.id,
        });
      }
    }
    return rows.length;
  }

  // =========================================================================
  //  S3-09 — CHUYỂN HÀNG LOẠT KHI THỢ NGHỈ ĐỘT XUẤT
  // =========================================================================
  async bulkReassignSuggestions(stylistId: string, date: string, user: AuthUser) {
    const appts = await this.apptRepo
      .createQueryBuilder('a')
      .where('a.stylist_id = :sid', { sid: stylistId })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .andWhere('a.start_at >= :from AND a.start_at <= :to', {
        from: startOfDay(date), to: endOfDay(date),
      })
      .orderBy('a.start_at', 'ASC')
      .getMany();

    const views = await this.decorate(appts, user.role);
    const results: {
      appointment: AppointmentView;
      sameTimeOptions: { stylistId: string; stylistName: string }[];
      alternativeTimeOptions: { stylistId: string; stylistName: string; time: string }[];
      needsPhoneCall: boolean;
    }[] = [];

    for (const appt of appts) {
      const services = await this.apptServiceRepo.find({ where: { appointmentId: appt.id } });
      const serviceIds = services.map((s) => s.serviceId);
      const time = toTimeString(appt.startAt);

      // 1. Thợ khác còn rảnh đúng khung giờ đó
      const capable = (await this.stylists.findCapableStylists(serviceIds)).filter((s) => s.id !== stylistId);
      const sameTime: { stylistId: string; stylistName: string }[] = [];
      for (const c of capable) {
        const ok = await this.availability.canBook({
          date, time, stylistId: c.id, totalDuration: appt.totalDurationMinutes,
          ignoreLeadTime: true, excludeAppointmentId: appt.id,
        });
        if (ok) sameTime.push({ stylistId: c.id, stylistName: c.fullName });
      }

      // 2. Nếu không có, gợi ý phương án dời giờ trong cùng ngày
      const alternativeTimes: { stylistId: string; stylistName: string; time: string }[] = [];
      if (!sameTime.length) {
        for (const c of capable) {
          const av = await this.availability.getAvailability({
            date, serviceIds, stylistId: c.id, ignoreLeadTime: true, excludeAppointmentId: appt.id,
            totalDurationOverride: appt.totalDurationMinutes,
          });
          for (const slot of av.slots.slice(0, 3)) {
            alternativeTimes.push({ stylistId: c.id, stylistName: c.fullName, time: slot.time });
          }
        }
      }

      results.push({
        appointment: views.find((v) => v.id === appt.id)!,
        sameTimeOptions: sameTime,
        alternativeTimeOptions: alternativeTimes.slice(0, 6),
        /** Không có phương án nào: cần gọi điện cho khách (S3-09). */
        needsPhoneCall: sameTime.length === 0 && alternativeTimes.length === 0,
      });
    }

    return { stylistId, date, total: results.length, items: results };
  }

  /**
   * Áp dụng theo lô: lỗi ở một lịch KHÔNG làm hỏng các lịch đã chuyển xong
   * (mỗi lịch là một giao dịch riêng) — đúng yêu cầu S3-09.
   */
  async bulkReassign(dto: BulkReassignDto, user: AuthUser) {
    const succeeded: string[] = [];
    const failed: { appointmentId: string; reason: string }[] = [];

    for (const item of dto.items) {
      try {
        const appt = await this.getOrFail(item.appointmentId);
        const sameStylist = !item.targetStylistId || item.targetStylistId === appt.stylistId;
        const sameTime = !item.targetTime || item.targetTime === toTimeString(appt.startAt);
        if (sameStylist && sameTime) {
          // Không có thợ thay thế / giờ mới: KHÔNG tính là "đã chuyển" (trước đây bị đếm vào thành công dù không đổi gì)
          failed.push({ appointmentId: item.appointmentId, reason: MSG.BULK_NO_TARGET });
          continue;
        }
        await this.reschedule(
          item.appointmentId,
          {
            stylistId: item.targetStylistId,
            date: toDateString(appt.startAt),
            time: item.targetTime ?? toTimeString(appt.startAt),
          },
          user,
        );
        succeeded.push(item.appointmentId);
      } catch (e) {
        failed.push({ appointmentId: item.appointmentId, reason: (e as Error).message });
      }
    }
    return { succeeded: succeeded.length, failed, succeededIds: succeeded };
  }

  // =========================================================================
  //  LỊCH CÁ NHÂN CỦA THỢ (S3-08) & GHI CHÚ KỸ THUẬT (S4-03)
  // =========================================================================
  async myDay(date: string, user: AuthUser): Promise<AppointmentView[]> {
    if (!user.stylistId) throw new ForbiddenException(MSG.FORBIDDEN_OWN_DATA);
    const appts = await this.apptRepo
      .createQueryBuilder('a')
      .where('a.stylist_id = :sid', { sid: user.stylistId })
      .andWhere('a.start_at >= :from AND a.start_at <= :to', {
        from: startOfDay(date), to: endOfDay(date),
      })
      .orderBy('a.start_at', 'ASC')
      .getMany();
    return this.decorate(appts, user.role);
  }

  async upsertServiceNote(id: string, content: string, user: AuthUser) {
    const appt = await this.getOrFail(id);
    this.assertOwnership(appt, user);
    if (content.length > 500) throw new BadRequestException('Ghi chú kỹ thuật tối đa 500 ký tự');
    return this.customers.upsertServiceNote({
      appointmentId: id,
      customerId: appt.customerId,
      stylistId: appt.stylistId,
      content,
      createdBy: user.id,
    });
  }

  /** Lịch sử 10 lượt gần nhất của khách trong một lịch hẹn (S4-03). */
  async customerHistoryForAppointment(id: string, user: AuthUser) {
    const appt = await this.getOrFail(id);
    this.assertOwnership(appt, user);
    const history = await this.customers.visitHistory(appt.customerId, 10);
    // "Khách mới" = chưa có lượt hoàn tất nào — cùng định nghĩa với hồ sơ khách (không suy từ độ dài lịch sử)
    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    return { customerId: appt.customerId, isNewCustomer: (customer?.totalVisits ?? 0) === 0, history };
  }

  /** Số liệu tổng quan hôm nay cho dashboard chủ tiệm (S4-08). */
  async todaySummary(date: string) {
    const rows = await this.apptRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.start_at >= :from AND a.start_at <= :to', {
        from: startOfDay(date), to: endOfDay(date),
      })
      .groupBy('a.status')
      .getRawMany<{ status: AppointmentStatus; count: string }>();

    const summary: Record<string, number> = {
      pending: 0, confirmed: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0,
    };
    for (const r of rows) summary[r.status] = Number(r.count);
    return summary;
  }
}
