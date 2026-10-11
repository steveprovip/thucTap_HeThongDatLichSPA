import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { BookingService } from './booking.service';
import { AvailabilityService } from './availability.service';
import { AppointmentSource } from '../../database/entities/appointment.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { AuthUser } from '../../common/types/auth.types';
import { todaySalon } from '../../common/utils/time.util';
import {
  BulkReassignDto, CreateBookingDto, DayScheduleQuery, ListAppointmentsQuery, PendingQuery,
  RejectDto, RescheduleDto, SmartSlotsQueryDto, StaffAvailabilityQueryDto, WalkInBookingDto,
} from './dto/booking.dto';
import { CreateServiceNoteDto } from '../customers/dto/customer.dto';

@Controller('appointments')
@UseGuards(RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly service: AppointmentsService,
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
  ) {}

  /** S3-01: lịch ngày dạng cột theo từng thợ. */
  @Get('timeline')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  timeline(@Query() q: DayScheduleQuery, @CurrentUser() user: AuthUser) {
    return this.service.dayTimeline(q.date, user.role, q.stylistId);
  }

  /** S3-08: lịch cá nhân của thợ theo ngày. */
  @Get('my-day')
  @Roles(Role.STYLIST)
  myDay(@Query('date') date: string, @CurrentUser() user: AuthUser) {
    return this.service.myDay(date || todaySalon(), user);
  }

  @Get('pending')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  pending(@Query() q: PendingQuery, @CurrentUser() user: AuthUser) {
    if (!q.page) return this.service.listPending(user);
    return this.service.listPendingPaged({ page: q.page, limit: q.limit ?? 20, sort: q.sort ?? 'start_asc' }, user);
  }

  @Get('reject-reasons')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  rejectReasons() {
    return this.service.rejectReasons;
  }

  @Get('today-summary')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  todaySummary(@Query('date') date?: string) {
    return this.service.todaySummary(date || todaySalon());
  }

  /** Khung giờ trống dùng cho màn hình nội bộ (bỏ qua ràng buộc đặt trước 60 phút). */
  @Get('availability')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  staffAvailability(@Query() q: StaffAvailabilityQueryDto) {
    return this.availability.getAvailability({
      date: q.date,
      serviceIds: q.serviceIds,
      stylistId: q.stylistId,
      ignoreLeadTime: true,
      excludeAppointmentId: q.excludeAppointmentId,
    });
  }

  /** Mentor S2 · mục 4: Trợ lý AI gợi ý khung giờ tốt nhất (sớm · vừa khít · cân bằng thợ) ngay trong màn hình tạo lịch. */
  @Get('smart-slots')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  smartSlots(@Query() q: SmartSlotsQueryDto) {
    return this.availability.smartSlots({
      serviceIds: q.serviceIds, fromDate: q.date, days: q.days, stylistId: q.stylistId, limit: q.limit,
    });
  }

  @Get()
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  list(@Query() q: ListAppointmentsQuery, @CurrentUser() user: AuthUser) {
    return this.service.list(q, user);
  }

  @Get(':id')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.detail(id, user);
  }

  @Get(':id/customer-history')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  customerHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.customerHistoryForAppointment(id, user);
  }

  /** S3-07: lễ tân nhập lịch cho khách vãng lai, vào thẳng trạng thái Đã xác nhận. */
  @Post('walk-in')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.CREATE, 'appointment', 'Tạo lịch hẹn tại quầy cho khách vãng lai')
  walkIn(@Body() dto: WalkInBookingDto, @ClientIp() ip: string, @CurrentUser() user: AuthUser) {
    return this.booking.createBooking({
      dto: dto as CreateBookingDto,
      ip,
      source: AppointmentSource.WALK_IN,
      actorId: user.id,
      actorName: user.fullName,
      ignoreLeadTime: true,
      autoConfirm: true,
      skipRateLimit: true,
    });
  }

  @Patch(':id/confirm')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Xác nhận lịch hẹn')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.confirm(id, user);
  }

  @Patch(':id/reject')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Từ chối lịch hẹn')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, dto.reason, user);
  }

  @Patch(':id/check-in')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Check-in khách')
  checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.checkIn(id, user);
  }

  @Patch(':id/reschedule')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Đổi thợ hoặc dời giờ lịch hẹn')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reschedule(id, dto, user);
  }

  @Patch(':id/no-show')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Đánh dấu khách không đến')
  noShow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.markNoShow(id, user);
  }

  @Patch(':id/undo-no-show')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Hoàn tác đánh dấu không đến')
  undoNoShow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.undoNoShow(id, user);
  }

  @Patch(':id/cancel')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Huỷ lịch hẹn')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() user: AuthUser) {
    return this.service.cancelByStaff(id, dto.reason, user);
  }

  @Patch(':id/start')
  @Roles(Role.STYLIST, Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Bắt đầu lượt dịch vụ')
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.start(id, user);
  }

  @Patch(':id/complete')
  @Roles(Role.STYLIST, Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Hoàn tất lượt dịch vụ')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.complete(id, user);
  }

  /** S4-03: ghi chú kỹ thuật, chỉ nội bộ xem được. */
  @Post(':id/service-note')
  @Roles(Role.STYLIST, Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'service_note', 'Ghi chú kỹ thuật cho lượt dịch vụ')
  serviceNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateServiceNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsertServiceNote(id, dto.content, user);
  }

  // ------------------------------------------------------- S3-09 chuyển lô
  @Get('bulk-reassign/suggestions')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  suggestions(
    @Query('stylistId', ParseUUIDPipe) stylistId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.bulkReassignSuggestions(stylistId, date, user);
  }

  @Post('bulk-reassign')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'appointment', 'Chuyển hàng loạt lịch hẹn sang thợ khác')
  bulkReassign(@Body() dto: BulkReassignDto, @CurrentUser() user: AuthUser) {
    return this.service.bulkReassign(dto, user);
  }
}
