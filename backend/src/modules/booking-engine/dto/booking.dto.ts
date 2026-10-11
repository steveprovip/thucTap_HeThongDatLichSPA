import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty,
  IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { VN_PHONE_MESSAGE, VN_PHONE_REGEX } from '../../../common/utils/phone.util';
import { IsAsciiEmail } from '../../../common/validators/credential.validators';
import { IsCalendarDate } from '../../../common/validators/date.validators';
import { AppointmentStatus } from '../../../database/entities/appointment.entity';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE_LENGTH_MESSAGE = 'Mã tra cứu gồm 8 ký tự chữ hoặc số';

/** Chấp nhận cả "a,b,c" trên query string lẫn mảng trong body. */
const toIdList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) ? value : String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

export class AvailabilityQueryDto {
  @Matches(DATE_RE, { message: 'Ngày phải theo định dạng yyyy-MM-dd' })
  date!: string;

  @Transform(toIdList)
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một dịch vụ' })
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];

  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' })
  stylistId?: string;

  /** Giữ chỗ của chính khách đang xem — khung giờ đó không bị ẩn với họ. */
  @IsOptional() @IsString() @MaxLength(64)
  holdToken?: string;
}

/** GET /appointments/smart-slots — Trợ lý AI xếp lịch (Mentor S2 · mục 4). */
export class SmartSlotsQueryDto {
  @Transform(toIdList)
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một dịch vụ' })
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];

  @Matches(DATE_RE, { message: 'Ngày phải theo định dạng yyyy-MM-dd' })
  date!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(7)
  days?: number;

  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' })
  stylistId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  limit?: number;
}

/** Dùng cho màn hình nội bộ: thêm tuỳ chọn bỏ qua chính lịch hẹn đang sửa. */
export class StaffAvailabilityQueryDto extends AvailabilityQueryDto {
  @IsOptional() @IsUUID('4', { message: 'Lịch hẹn không hợp lệ' })
  excludeAppointmentId?: string;
}

/** GET /public/stylists?serviceIds=a,b — trước đây đọc chuỗi thô nên mã không phải UUID rơi xuống CSDL (500). */
export class CapableStylistsQueryDto {
  @Transform(toIdList)
  @IsArray()
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];
}

export class QuoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một dịch vụ' })
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];
}

export class CreateBookingDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một dịch vụ' })
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];

  @Matches(DATE_RE, { message: 'Ngày hẹn phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày hẹn không hợp lệ' })
  date!: string;

  @Matches(TIME_RE, { message: 'Giờ hẹn phải theo định dạng HH:mm' })
  time!: string;

  /** Bỏ trống = để hệ thống tự phân thợ bất kỳ (S2-06). */
  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' })
  stylistId?: string;

  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập họ tên' }) @MaxLength(120)
  fullName!: string;

  @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone!: string;

  @IsOptional() @IsEmail({}, { message: 'Email không đúng định dạng' }) @IsAsciiEmail() @MaxLength(160)
  email?: string;

  @IsOptional() @IsString() @MaxLength(300, { message: 'Ghi chú cho thợ tối đa 300 ký tự' })
  note?: string;

  /** Mã giữ chỗ nhận ở bước Xác nhận (Mentor S2 · mục 11): đổi chỗ đang giữ thành lịch hẹn. */
  @IsOptional() @IsString() @MaxLength(64)
  holdToken?: string;
}

/** POST /public/holds — giữ chỗ khung giờ trong lúc khách điền thông tin. */
export class CreateSlotHoldDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một dịch vụ' })
  @ArrayMaxSize(5, { message: 'Mỗi lượt đặt chỉ được chọn tối đa 5 dịch vụ' })
  @ArrayUnique({ message: 'Mỗi dịch vụ chỉ được chọn một lần' })
  @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds!: string[];

  @Matches(DATE_RE, { message: 'Ngày hẹn phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày hẹn không hợp lệ' })
  date!: string;

  @Matches(TIME_RE, { message: 'Giờ hẹn phải theo định dạng HH:mm' })
  time!: string;

  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' })
  stylistId?: string;

  /** Chỗ đang giữ trước đó của chính khách (đổi giờ) — được trả lại trước khi giữ chỗ mới. */
  @IsOptional() @IsString() @MaxLength(64)
  previousToken?: string;
}

/** POST /public/bookings/email — gửi (lại) email xác nhận đặt lịch (Mentor S2 · mục 10). */
export class SendConfirmationEmailDto {
  @IsString() @MaxLength(8, { message: CODE_LENGTH_MESSAGE }) @IsNotEmpty({ message: CODE_LENGTH_MESSAGE })
  code!: string;

  @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone!: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' }) @IsAsciiEmail() @MaxLength(160)
  email!: string;
}

export class WalkInBookingDto extends CreateBookingDto {
  /** Lịch tại quầy luôn vào thẳng trạng thái Đã xác nhận (S3-07). */
  @IsOptional() @IsBoolean() startNow?: boolean;
}

export class LookupDto {
  @IsOptional() @IsString() @MaxLength(8, { message: CODE_LENGTH_MESSAGE }) code?: string;
  @IsOptional() @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone?: string;
}

export class CancelByCodeDto {
  @IsString() @IsNotEmpty({ message: 'Thiếu mã tra cứu' }) @MaxLength(8, { message: CODE_LENGTH_MESSAGE })
  code!: string;

  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class ConfirmDto {
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class RejectDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng chọn lý do từ chối' }) @MaxLength(255)
  reason!: string;
}

export class RescheduleDto {
  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' }) stylistId?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'Ngày hẹn phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày hẹn không hợp lệ' })
  date?: string;
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ hẹn phải theo định dạng HH:mm' }) time?: string;
}

export class BulkReassignItemDto {
  @IsUUID('4') appointmentId!: string;
  @IsOptional() @IsUUID('4') targetStylistId?: string;
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ hẹn phải theo định dạng HH:mm' }) targetTime?: string;
}

export class BulkReassignDto {
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkReassignItemDto)
  items!: BulkReassignItemDto[];
}

export class DayScheduleQuery {
  @Matches(DATE_RE, { message: 'Ngày phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày không hợp lệ' })
  date!: string;

  @IsOptional() @IsUUID('4') stylistId?: string;
}

/** TASK v3 · NV2: GET /appointments/pending?page=&limit=&sort= (không gửi page = trả mảng như cũ). */
export class PendingQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsIn(['start_asc', 'start_desc', 'name_asc'], { message: 'Kiểu sắp xếp không hợp lệ' })
  sort?: 'start_asc' | 'start_desc' | 'name_asc';
}

export class ListAppointmentsQuery {
  @IsOptional() @Matches(DATE_RE) from?: string;
  @IsOptional() @Matches(DATE_RE) to?: string;
  @IsOptional() @IsEnum(AppointmentStatus, { message: 'Trạng thái không hợp lệ' }) status?: AppointmentStatus;
  @IsOptional() @IsUUID('4') stylistId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  /** Part 4: phân trang theo con trỏ (keyset) — lấy `nextCursor` của trang trước; có cursor thì bỏ qua `page`. */
  @IsOptional() @IsString() @MaxLength(120) cursor?: string;
}
