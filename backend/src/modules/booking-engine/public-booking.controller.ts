import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingService } from './booking.service';
import { SlotHoldService } from './slot-hold.service';
import { AppointmentSource } from '../../database/entities/appointment.entity';
import { Public } from '../../common/decorators/public.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { formatVnd } from '../../common/utils/currency.util';
import { ERROR_CODES } from '../../common/constants/messages.constant';
import {
  AvailabilityQueryDto, CancelByCodeDto, CapableStylistsQueryDto, CreateBookingDto, CreateSlotHoldDto, LookupDto, QuoteDto, SendConfirmationEmailDto,
} from './dto/booking.dto';

/**
 * Trang công khai cho khách: không cần tài khoản (S2-03 → S2-09, S3-05).
 */
@Controller('public')
@Public()
export class PublicBookingController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
    private readonly holds: SlotHoldService,
  ) {}

  /** S2-03: danh mục dịch vụ theo nhóm, có tìm kiếm không dấu. */
  @Get('catalog')
  catalog(@Query('search') search?: string) {
    return this.availability.publicCatalog(search);
  }

  /** S2-04: tổng thời lượng và tổng tiền tạm tính khi chọn nhiều dịch vụ. */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  async quote(@Body() dto: QuoteDto) {
    const services = await this.availability.loadServices(dto.serviceIds);
    const totalDuration = services.reduce((s, x) => s + x.durationMinutes, 0);
    const estimatedTotal = services.reduce((s, x) => s + x.price, 0);
    // QA-13: cảnh báo ngay ở giỏ dịch vụ khi tổng thời lượng vượt ca dài nhất trong tuần
    const warning = await this.availability.cartWarning(dto.serviceIds, totalDuration);
    return {
      services: services.map((s) => ({
        id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price,
        priceText: formatVnd(s.price),
      })),
      totalDurationMinutes: totalDuration,
      estimatedTotal,
      estimatedTotalText: formatVnd(estimatedTotal),
      longestShiftMinutes: warning.longestShiftMinutes,
      exceedsLongestShift: warning.exceedsLongestShift,
      warningCode: warning.exceedsLongestShift ? ERROR_CODES.EXCEEDS_LONGEST_SHIFT : null,
      note: 'Đây là số tiền tạm tính, giá cuối do tiệm chốt khi thanh toán.',
    };
  }

  /** S2-06: danh sách thợ làm được toàn bộ dịch vụ đã chọn. */
  @Get('stylists')
  async stylists(@Query() query: CapableStylistsQueryDto) {
    const list = await this.availability.capableStylists(query.serviceIds);
    return list.map((s) => ({
      id: s.id, fullName: s.fullName, avatarUrl: s.avatarUrl, gender: s.gender, bio: s.bio,
    }));
  }

  /** S2-05: khung giờ còn trống cho tổng thời lượng đã chọn. */
  @Get('availability')
  availability_(@Query() query: AvailabilityQueryDto) {
    return this.availability.getAvailability({
      date: query.date,
      serviceIds: query.serviceIds,
      stylistId: query.stylistId,
      holdToken: query.holdToken,
    });
  }

  /** Mentor S2 · mục 11: giữ chỗ khung giờ trong lúc khách điền thông tin (mặc định 10 phút). */
  @Post('holds')
  createHold(@Body() dto: CreateSlotHoldDto, @ClientIp() ip: string) {
    return this.holds.create(dto, ip);
  }

  /** Khách quay lại đổi giờ / rời trang: trả chỗ ngay cho người khác. */
  @Delete('holds/:token')
  releaseHold(@Param('token') token: string) {
    return this.holds.release(String(token).slice(0, 64));
  }

  /** S2-07 + S2-08: chốt lịch, sinh mã tra cứu 8 ký tự. */
  @Post('bookings')
  create(@Body() dto: CreateBookingDto, @ClientIp() ip: string) {
    return this.booking.createBooking({ dto, ip, source: AppointmentSource.ONLINE });
  }

  /** Mentor S2 · mục 10: gửi (lại) email xác nhận chi tiết lịch hẹn — xác thực bằng mã tra cứu + SĐT. */
  @Post('bookings/email')
  @HttpCode(HttpStatus.OK)
  sendConfirmationEmail(@Body() dto: SendConfirmationEmailDto, @ClientIp() ip: string) {
    return this.booking.sendConfirmationEmail({ ...dto, ip });
  }

  /** S2-09: tra cứu bằng mã hoặc số điện thoại. */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: LookupDto, @ClientIp() ip: string) {
    return this.booking.lookup({ code: dto.code, phone: dto.phone, ip });
  }

  /** S3-05: khách tự huỷ bằng mã tra cứu. */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Body() dto: CancelByCodeDto, @ClientIp() ip: string) {
    return this.booking.cancelByCode(dto.code, dto.reason, ip);
  }
}
