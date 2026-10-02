import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Appointment, ACTIVE_STATUSES, AppointmentSource, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { EmailKind } from '../../database/entities/email-queue.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { ERROR_CODES, MSG } from '../../common/constants/messages.constant';
import { Role } from '../../common/constants/roles.constant';
import { generateBookingCode } from '../../common/utils/code.util';
import {
  addMinutes, combine, formatDateTimeVN, timeToMinutes, toDateString, toTimeString,
} from '../../common/utils/time.util';
import { normalizePhone } from '../../common/utils/phone.util';
import { AvailabilityService } from './availability.service';
import { CustomersService } from '../customers/customers.service';
import { StylistsService } from '../stylists/stylists.service';
import { MailService } from '../notifications/mail.service';
import { MailTemplates, AppointmentMailData } from '../notifications/mail-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { CreateBookingDto } from './dto/booking.dto';
import { mapPublicAppointment } from './appointment.mapper';

export interface BookingResult {
  code: string;
  appointmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  startAtText: string;
  stylistName: string;
  services: { name: string; durationMinutes: number; price: number }[];
  totalDurationMinutes: number;
  estimatedTotal: number;
  status: AppointmentStatus;
  nameConflict: boolean;
  emailQueued: boolean;
}

const SERIALIZATION_ERRORS = new Set(['40001', '40P01']);

/** Số lần tự phân lại sang thợ khác khi thợ vừa chọn bị giành mất khung giờ (QA-15). */
const MAX_AUTO_REASSIGN = 5;

/** QA-18 / QA-20: vượt hạn mức trả 429 Too Many Requests kèm Retry-After, không dùng 400/403. */
const tooManyRequests = (
  message: string, retryAfterSeconds: number, code: string = ERROR_CODES.RATE_LIMITED,
): HttpException =>
  new HttpException({ message, code, details: { retryAfterSeconds } }, HttpStatus.TOO_MANY_REQUESTS);

/** QA-17: quá 3 lịch chưa hoàn tất trên một SĐT. */
const maxAppointmentsExceeded = (active: number, max: number): BadRequestException =>
  new BadRequestException({
    message: MSG.TOO_MANY_ACTIVE_BOOKINGS(active),
    field: 'phone',
    code: ERROR_CODES.MAX_APPOINTMENTS_EXCEEDED,
    details: { activeAppointments: active, maxActiveAppointments: max },
  });

interface PersistContext {
  dto: CreateBookingDto;
  params: { source: AppointmentSource; actorId?: string | null; ip: string; ignoreLeadTime?: boolean; autoConfirm?: boolean };
  ordered: ServiceItem[];
  totalDuration: number;
  estimatedTotal: number;
  startAt: Date;
  endAt: Date;
  now: Date;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly availability: AvailabilityService,
    private readonly customers: CustomersService,
    private readonly stylists: StylistsService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly rateLimit: RateLimitService,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  // =========================================================================
  //  ĐẶT LỊCH
  // =========================================================================

  /**
   * S2-07 + S2-08.
   *
   * LÁ CHẮN CHỐNG ĐẶT TRÙNG gồm ba lớp độc lập:
   *   1. Giao dịch SERIALIZABLE.
   *   2. Khoá dòng `SELECT ... FOR UPDATE` trên bản ghi thợ — hai yêu cầu cùng
   *      chọn một thợ buộc phải xếp hàng, lớp kiểm tra khung giờ không thể
   *      chạy song song.
   *   3. Ràng buộc EXCLUDE trên bảng appointments ở tầng CSDL — chốt chặn cuối
   *      cùng, đúng cả khi có tiến trình khác ghi thẳng vào cơ sở dữ liệu.
   */
  async createBooking(params: {
    dto: CreateBookingDto;
    ip: string;
    source: AppointmentSource;
    actorId?: string | null;
    actorName?: string | null;
    /** Lễ tân tạo lịch tại quầy được bỏ qua ràng buộc đặt trước 60 phút (S3-07). */
    ignoreLeadTime?: boolean;
    /** Lịch tại quầy vào thẳng trạng thái Đã xác nhận. */
    autoConfirm?: boolean;
    skipRateLimit?: boolean;
  }): Promise<BookingResult> {
    const { dto, ip } = params;
    const now = new Date();

    // ----- 1. Chống spam theo IP (S2-07)
    if (!params.skipRateLimit) {
      const limit = this.config.get<number>('security.bookingIpLimitPerHour')!;
      const rl = await this.rateLimit.hit('booking_ip', ip, limit, 60);
      if (!rl.allowed) throw tooManyRequests(MSG.BOOKING_RATE_LIMITED, 3600);
    }

    // ----- 2. Dịch vụ và tổng thời lượng
    const services = await this.availability.loadServices(dto.serviceIds);
    const ordered = dto.serviceIds
      .map((id) => services.find((s) => s.id === id))
      .filter((s): s is ServiceItem => !!s);
    const totalDuration = ordered.reduce((sum, s) => sum + s.durationMinutes, 0);
    const estimatedTotal = ordered.reduce((sum, s) => sum + s.price, 0);

    // ----- 3. Mốc thời gian
    const startAt = combine(dto.date, dto.time);
    const endAt = addMinutes(startAt, totalDuration);
    if (startAt.getTime() <= now.getTime()) throw new BadRequestException(MSG.SLOT_IN_PAST);
    if (!params.ignoreLeadTime) {
      const lead = this.config.get<number>('business.minLeadTimeMinutes')!;
      if (startAt.getTime() - now.getTime() < lead * 60_000) {
        throw new BadRequestException(MSG.SLOT_TOO_SOON(lead));
      }
    }

    // ----- 4. Giới hạn số lịch chưa hoàn tất trên một số điện thoại (S2-07)
    const maxActive = this.config.get<number>('business.maxActiveBookingsPerPhone')!;
    const existingCustomer = await this.customerRepo.findOne({ where: { phone: dto.phone } });
    if (existingCustomer) {
      const activeCount = await this.apptRepo.count({
        where: { customerId: existingCustomer.id, status: In(ACTIVE_STATUSES) },
      });
      if (activeCount >= maxActive) throw maxAppointmentsExceeded(activeCount, maxActive);
    }

    // QA-14: khách đặt online chỉ được chọn khung giờ trên lưới 15 phút (09:00, 09:15…), không nhận 09:07
    const isOnline = params.source === AppointmentSource.ONLINE;
    const step = this.config.get<number>('business.slotStepMinutes')!;
    if (isOnline && timeToMinutes(dto.time) % step !== 0) throw new BadRequestException(MSG.SLOT_INVALID);

    // ----- 5. Chọn thợ (đích danh hoặc tự phân)
    let stylistId: string;
    if (dto.stylistId) {
      stylistId = dto.stylistId;
      const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });
      if (!stylist) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
      if (!stylist.isActive) throw new BadRequestException(MSG.STYLIST_INACTIVE);
      const skill = await this.stylists.canDoAll(stylistId, dto.serviceIds);
      if (!skill.ok) throw new BadRequestException(MSG.STYLIST_MISSING_SKILL(skill.missing.join(', ')));
      // QA-14: trước đây chọn đích danh thợ chỉ kiểm tra "không trùng lịch" trong giao dịch -> gửi thẳng API
      // giờ ngoài ca, trong giờ nghỉ, ngày thợ xin nghỉ hay ngày tiệm đóng cửa vẫn đặt được.
      if (isOnline) {
        const verdict = await this.availability.checkSlot({
          date: dto.date, time: dto.time, stylistId, totalDuration, now,
        });
        if (verdict === 'invalid') throw new BadRequestException(MSG.SLOT_INVALID);
        if (verdict === 'taken') throw new ConflictException(MSG.SLOT_TAKEN);
      }
    } else {
      const auto = await this.availability.pickAutoStylist({
        date: dto.date, time: dto.time, serviceIds: dto.serviceIds,
        totalDuration, ignoreLeadTime: params.ignoreLeadTime, now,
      });
      if (!auto) throw new ConflictException(MSG.SLOT_TAKEN);
      stylistId = auto.id;
    }

    // ----- 6. Ghi lịch. "Thợ bất kỳ" mà thợ vừa chọn bị người khác giành mất trong lúc chốt -> phân lại
    // sang thợ rảnh kế tiếp thay vì báo khách hết chỗ (QA-15, QA-19: 20 khách cùng giây, nhiều thợ rảnh).
    const ctx: PersistContext = { dto, params, ordered, totalDuration, estimatedTotal, startAt, endAt, now };
    const tried: string[] = [];
    for (;;) {
      try {
        return await this.persistWithRetry(ctx, stylistId);
      } catch (e) {
        if (dto.stylistId || !(e instanceof ConflictException) || tried.length >= MAX_AUTO_REASSIGN) throw e;
        tried.push(stylistId);
        const next = await this.availability.pickAutoStylist({
          date: dto.date, time: dto.time, serviceIds: dto.serviceIds,
          totalDuration, ignoreLeadTime: params.ignoreLeadTime, now, excludeStylistIds: tried,
        });
        if (!next) throw e;
        stylistId = next.id;
      }
    }
  }

  /** Ghi lịch trong giao dịch có khoá; thử lại khi CSDL báo xung đột tuần tự hoá. */
  private async persistWithRetry(ctx: PersistContext, stylistId: string): Promise<BookingResult> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      try {
        return await this.persistBooking({ ...ctx, stylistId });
      } catch (e) {
        const code = (e as { driverError?: { code?: string }; code?: string }).driverError?.code
          ?? (e as { code?: string }).code;
        if (code && SERIALIZATION_ERRORS.has(code) && attempt < 3) {
          this.logger.warn(`Xung đột tuần tự hoá khi đặt lịch, thử lại lần ${attempt + 1}`);
          continue;
        }
        if (code === '23P01') throw new ConflictException(MSG.SLOT_TAKEN);
        if (code && SERIALIZATION_ERRORS.has(code)) throw new ConflictException(MSG.SLOT_TAKEN);
        throw e;
      }
    }
  }

  private async persistBooking(ctx: PersistContext & { stylistId: string }): Promise<BookingResult> {
    const { dto, params, ordered, totalDuration, estimatedTotal, startAt, endAt, stylistId, now } = ctx;

    const result = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      // (2) KHOÁ DÒNG trên bản ghi thợ: mọi yêu cầu cho cùng một thợ xếp hàng tại đây
      const locked = await manager.query('SELECT id, is_active FROM stylists WHERE id = $1 FOR UPDATE', [stylistId]);
      if (!locked.length) throw new NotFoundException(MSG.STYLIST_NOT_FOUND);
      if (!locked[0].is_active) throw new BadRequestException(MSG.STYLIST_INACTIVE);

      // Kiểm tra lại khung giờ NGAY TRONG khoá — dữ liệu đọc ở đây không thể bị
      // một giao dịch khác chen ngang.
      const stillFree = await this.isRangeFree(manager, stylistId, startAt, endAt);
      if (!stillFree) throw new ConflictException(MSG.SLOT_TAKEN);

      // QA-17: đếm lại số lịch chưa hoàn tất của SĐT NGAY TRONG giao dịch SERIALIZABLE. Bước kiểm tra trước đó
      // chạy ngoài giao dịch nên N yêu cầu song song cùng một SĐT (khác thợ) từng cùng lọt qua mức 3 lịch.
      const maxActive = this.config.get<number>('business.maxActiveBookingsPerPhone')!;
      const activeRows: { active: number }[] = await manager.query(
        `SELECT COUNT(*)::int AS active FROM appointments a
           JOIN customers c ON c.id = a.customer_id
          WHERE c.phone = $1 AND a.status IN ('pending','confirmed','arrived','in_progress')`,
        [normalizePhone(dto.phone)],
      );
      const active = Number(activeRows[0]?.active ?? 0);
      if (active >= maxActive) throw maxAppointmentsExceeded(active, maxActive);

      const { customer, nameConflict } = await this.customers.findOrCreateByPhone(
        { phone: dto.phone, fullName: dto.fullName, email: dto.email ?? null },
        manager,
      );

      const status = params.autoConfirm ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;
      let appointment: Appointment | null = null;

      // Mã tra cứu 8 ký tự, thử lại nếu trùng
      for (let i = 0; i < 5 && !appointment; i += 1) {
        const code = generateBookingCode(8);
        const exists = await manager.count(Appointment, { where: { code } });
        if (exists) continue;
        appointment = await manager.save(
          manager.create(Appointment, {
            code,
            customerId: customer.id,
            stylistId,
            startAt,
            endAt,
            totalDurationMinutes: totalDuration,
            estimatedTotal,
            status,
            source: params.source,
            customerNote: dto.note ?? null,
            createdBy: params.actorId ?? null,
            createdIp: params.ip,
            confirmedAt: params.autoConfirm ? now : null,
            confirmedBy: params.autoConfirm ? params.actorId ?? null : null,
          }),
        );
      }
      if (!appointment) throw new ConflictException('Không sinh được mã tra cứu, vui lòng thử lại');

      await manager.save(
        ordered.map((s, index) =>
          manager.create(AppointmentServiceItem, {
            appointmentId: appointment!.id,
            serviceId: s.id,
            priceSnapshot: s.price,
            durationSnapshot: s.durationMinutes,
            nameSnapshot: s.name,
            position: index,
          }),
        ),
      );

      return { appointment, customer, nameConflict };
    });

    const stylist = await this.stylistRepo.findOne({ where: { id: stylistId } });

    // ----- 7. Email xác nhận (S4-05) và thông báo trong ứng dụng (S4-06)
    let emailQueued = false;
    const mailData: AppointmentMailData = {
      code: result.appointment.code,
      customerName: result.customer.fullName,
      stylistName: stylist?.fullName ?? '',
      startAt,
      endAt,
      services: ordered.map((s) => ({ name: s.name, durationMinutes: s.durationMinutes, price: s.price })),
      totalDuration,
      estimatedTotal,
    };
    // Lịch ĐÃ commit: lỗi email/thông báo phía sau không được biến thành 500 (khách tưởng đặt hỏng,
    // bấm lại -> 409 "khung giờ đã bị chiếm" bởi chính lịch của mình).
    try {
    if (result.customer.email) {
      const tpl = MailTemplates.bookingConfirmation(this.mail.salonInfo, mailData);
      await this.mail.enqueue({
        kind: EmailKind.BOOKING_CONFIRMATION,
        toEmail: result.customer.email,
        toName: result.customer.fullName,
        subject: tpl.subject,
        html: tpl.html,
        appointmentId: result.appointment.id,
      });
      await this.apptRepo.update(result.appointment.id, { confirmationSentAt: new Date() });
      emailQueued = true;
    }
    if (params.autoConfirm) await this.scheduleReminder(result.appointment.id);

    await this.notifications.notifyStylist(
      stylistId,
      NotificationType.APPOINTMENT_NEW,
      'Lịch hẹn mới',
      `${result.customer.fullName} đặt lúc ${formatDateTimeVN(startAt)} (${totalDuration} phút)`,
      result.appointment.id,
    );
    } catch (e) {
      this.logger.error(`Lịch ${result.appointment.code} đã lưu nhưng gửi email/thông báo lỗi: ${(e as Error).message}`);
    }

    return {
      code: result.appointment.code,
      appointmentId: result.appointment.id,
      date: toDateString(startAt),
      startTime: toTimeString(startAt),
      endTime: toTimeString(endAt),
      startAtText: formatDateTimeVN(startAt),
      stylistName: stylist?.fullName ?? '',
      services: ordered.map((s) => ({ name: s.name, durationMinutes: s.durationMinutes, price: s.price })),
      totalDurationMinutes: totalDuration,
      estimatedTotal,
      status: result.appointment.status,
      nameConflict: result.nameConflict,
      emailQueued,
    };
  }

  /** Khoảng [start, end) của thợ này có còn trống không — chạy TRONG giao dịch đang khoá. */
  private async isRangeFree(
    manager: EntityManager, stylistId: string, start: Date, end: Date, excludeId?: string,
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT 1 FROM appointments
        WHERE stylist_id = $1
          AND status IN ('pending','confirmed','arrived','in_progress')
          AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR id <> $4::uuid)
        LIMIT 1`,
      [stylistId, start.toISOString(), end.toISOString(), excludeId ?? null],
    );
    return rows.length === 0;
  }

  /**
   * S4-05: email nhắc gửi trước giờ hẹn 24 giờ; lịch sát hơn 24 giờ thì gửi
   * ngay sau khi tiệm xác nhận.
   */
  async scheduleReminder(appointmentId: string): Promise<void> {
    const appt = await this.apptRepo.findOne({ where: { id: appointmentId } });
    if (!appt) return;
    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    if (!customer?.email) return;

    const hoursBefore = this.config.get<number>('business.reminderHoursBefore')!;
    const sendAt = new Date(appt.startAt.getTime() - hoursBefore * 3600_000);
    const scheduledAt = sendAt.getTime() > Date.now() ? sendAt : new Date();

    // Không gửi trùng: huỷ email nhắc đang chờ của lịch này trước
    await this.mail.cancelPendingFor(appointmentId, [EmailKind.BOOKING_REMINDER]);

    const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId } });
    const tpl = MailTemplates.bookingReminder(this.mail.salonInfo, {
      code: appt.code,
      customerName: customer.fullName,
      stylistName: stylist?.fullName ?? '',
      startAt: appt.startAt,
      endAt: appt.endAt,
      services: services.map((s) => ({
        name: s.nameSnapshot, durationMinutes: s.durationSnapshot, price: s.priceSnapshot,
      })),
      totalDuration: appt.totalDurationMinutes,
      estimatedTotal: appt.estimatedTotal,
    });
    await this.mail.enqueue({
      kind: EmailKind.BOOKING_REMINDER,
      toEmail: customer.email,
      toName: customer.fullName,
      subject: tpl.subject,
      html: tpl.html,
      appointmentId,
      scheduledAt,
    });
    await this.apptRepo.update(appointmentId, { reminderSentAt: null });
  }

  // =========================================================================
  //  TRA CỨU CÔNG KHAI (S2-09)
  // =========================================================================
  async lookup(params: { code?: string; phone?: string; ip: string }) {
    const limit = this.config.get<number>('security.lookupIpLimitPerHour')!;
    const blockMinutes = this.config.get<number>('security.lookupBlockMinutes')!;

    if (!params.code && !params.phone) {
      throw new BadRequestException('Vui lòng nhập mã tra cứu hoặc số điện thoại');
    }

    // QA-20: IP đang bị tạm khoá thì chặn ngay, không chạy truy vấn
    const blockedUntil = await this.rateLimit.blockedUntil('lookup_ip', params.ip);
    if (blockedUntil) {
      const seconds = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
      throw tooManyRequests(MSG.LOOKUP_RATE_LIMITED(Math.ceil(seconds / 60)), seconds, ERROR_CODES.LOOKUP_LOCKED);
    }

    const qb = this.apptRepo.createQueryBuilder('a');
    if (params.code) {
      qb.where('a.code = :code', { code: params.code.trim().toUpperCase() });
    } else {
      qb.innerJoin('customers', 'c', 'c.id = a.customer_id')
        .where('c.phone = :phone', { phone: params.phone })
        .andWhere('a.status IN (:...st)', { st: [...ACTIVE_STATUSES, AppointmentStatus.COMPLETED] });
    }
    const appointments = await qb.orderBy('a.startAt', 'DESC').take(20).getMany();

    // QA-20: chỉ lượt tra SAI mới bị đếm vào hạn mức 10 lần/giờ; tra theo SĐT thì luôn đếm để chống dò
    // danh sách SĐT (lộ tên, lịch hẹn, mã huỷ lịch). KHÔNG xoá bộ đếm khi tra đúng: kiểu cũ cho phép xen
    // một mã đúng đã biết sau mỗi 9 lần đoán sai để đặt lại hạn mức và dò mã vô hạn.
    const found = appointments.length > 0;
    if (!found || !params.code) {
      const rl = await this.rateLimit.hit('lookup_ip', params.ip, limit, 60, blockMinutes);
      if (!rl.allowed) {
        throw tooManyRequests(MSG.LOOKUP_RATE_LIMITED(blockMinutes), blockMinutes * 60, ERROR_CODES.LOOKUP_LOCKED);
      }
    }
    if (!found) throw new NotFoundException(MSG.CODE_NOT_FOUND);

    const customerIds = Array.from(new Set(appointments.map((a) => a.customerId)));
    const stylistIds = Array.from(new Set(appointments.map((a) => a.stylistId)));
    const customers = await this.customerRepo.find({ where: { id: In(customerIds) } });
    const stylists = await this.stylistRepo.find({ where: { id: In(stylistIds) } });
    const services = await this.apptServiceRepo.find({
      where: { appointmentId: In(appointments.map((a) => a.id)) },
    });

    return appointments.map((a) =>
      mapPublicAppointment(
        a,
        customers.find((c) => c.id === a.customerId)!,
        stylists.find((s) => s.id === a.stylistId)!,
        services.filter((s) => s.appointmentId === a.id),
      ),
    );
  }

  // =========================================================================
  //  KHÁCH TỰ HUỶ (S3-05)
  // =========================================================================
  // ip giữ trong chữ ký để controller truyền vào (dành cho giới hạn tần suất sau này)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancelByCode(code: string, reason: string | undefined, ip: string) {
    const cutoff = this.config.get<number>('business.cancelCutoffMinutes')!;
    const appt = await this.apptRepo.findOne({ where: { code: code.trim().toUpperCase() } });
    if (!appt) throw new NotFoundException(MSG.CODE_NOT_FOUND);

    if (appt.status === AppointmentStatus.CANCELLED) throw new BadRequestException(MSG.ALREADY_CANCELLED);
    if (!ACTIVE_STATUSES.includes(appt.status)) {
      throw new BadRequestException(
        MSG.INVALID_STATUS_TRANSITION(appt.status, AppointmentStatus.CANCELLED),
      );
    }
    if (appt.startAt.getTime() - Date.now() < cutoff * 60_000) {
      throw new BadRequestException(MSG.CANCEL_TOO_LATE(cutoff));
    }

    appt.status = AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancelledByLabel = 'Khách hàng';
    appt.cancelReason = reason?.slice(0, 255) ?? 'Khách tự huỷ qua trang tra cứu';
    await this.apptRepo.save(appt);

    await this.mail.cancelPendingFor(appt.id, [EmailKind.BOOKING_REMINDER]);
    await this.customers.refreshCounters(appt.customerId);
    await this.notifications.notifyStylist(
      appt.stylistId,
      NotificationType.APPOINTMENT_CANCELLED,
      'Khách huỷ lịch',
      `Lịch ${appt.code} lúc ${formatDateTimeVN(appt.startAt)} đã bị khách huỷ`,
      appt.id,
    );

    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId: appt.id } });
    if (customer?.email) {
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
        appt.cancelReason,
      );
      await this.mail.enqueue({
        kind: EmailKind.BOOKING_CANCELLED,
        toEmail: customer.email,
        toName: customer.fullName,
        subject: tpl.subject,
        html: tpl.html,
        appointmentId: appt.id,
      });
    }

    return mapPublicAppointment(appt, customer!, stylist!, services);
  }

  /** Dùng chung cho các module khác khi cần bản đồ dữ liệu của một lịch hẹn. */
  async loadFull(appointmentId: string) {
    const appt = await this.apptRepo.findOne({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
    const customer = await this.customerRepo.findOne({ where: { id: appt.customerId } });
    const stylist = await this.stylistRepo.findOne({ where: { id: appt.stylistId } });
    const services = await this.apptServiceRepo.find({ where: { appointmentId } });
    return { appt, customer: customer!, stylist: stylist!, services };
  }

  /** Bản đồ hiển thị công khai (dùng cho trang đánh giá). */
  publicView(appt: Appointment, customer: Customer, stylist: Stylist, services: AppointmentServiceItem[]) {
    return mapPublicAppointment(appt, customer, stylist, services);
  }

  /** Vai trò mặc định khi xem dữ liệu công khai. */
  readonly publicRole = Role.CUSTOMER;
}
