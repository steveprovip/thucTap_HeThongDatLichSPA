import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { STYLIST_GENDERS, StylistGender } from '../../../database/entities/stylist.entity';
import { VN_PHONE_MESSAGE, VN_PHONE_REGEX } from '../../../common/utils/phone.util';
import { IsAsciiEmail } from '../../../common/validators/credential.validators';
import { IsCalendarDate } from '../../../common/validators/date.validators';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDER_MESSAGE = 'Vui lòng chọn giới tính Nam hoặc Nữ';

export class CreateStylistDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập họ tên thợ' }) @MinLength(2) @MaxLength(120)
  fullName!: string;

  /** Ảnh đại diện mặc định và ảnh gợi ý tự động dựa vào giới tính nên bắt buộc khi tạo hồ sơ. */
  @IsIn(STYLIST_GENDERS, { message: GENDER_MESSAGE })
  gender!: StylistGender;

  @IsOptional() @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID('4', { message: 'Tài khoản liên kết không hợp lệ' }) userId?: string;

  /** Có email -> tự tạo tài khoản vai trò Thợ gắn với hồ sơ (mật khẩu tạm gửi qua email). */
  @IsOptional() @IsEmail({}, { message: 'Email không đúng định dạng' }) @IsAsciiEmail() @MaxLength(160)
  email?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds?: string[];
}

export class UpdateStylistDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsIn(STYLIST_GENDERS, { message: GENDER_MESSAGE }) gender?: StylistGender;
  @IsOptional() @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE }) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /**
   * QA Sprint 3 · mục 2 — email đăng nhập của thợ: hồ sơ chưa có tài khoản → gắn tài khoản Thợ sẵn có cùng email
   * (tạo ở "Tài khoản nhân sự") hoặc tạo mới kèm mật khẩu tạm; đã có tài khoản → đổi email đăng nhập.
   */
  @IsOptional() @IsEmail({}, { message: 'Email không đúng định dạng' }) @IsAsciiEmail() @MaxLength(160)
  email?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('4', { each: true, message: 'Mã dịch vụ không hợp lệ' })
  serviceIds?: string[];
}

export class ShiftItemDto {
  @Matches(DATE_RE, { message: 'Ngày làm việc phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày làm việc không hợp lệ' })
  workDate!: string;

  @Matches(TIME_RE, { message: 'Giờ bắt đầu ca phải theo định dạng HH:mm' })
  startTime!: string;

  @Matches(TIME_RE, { message: 'Giờ kết thúc ca phải theo định dạng HH:mm' })
  endTime!: string;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu nghỉ giữa ca phải theo định dạng HH:mm' })
  breakStart?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc nghỉ giữa ca phải theo định dạng HH:mm' })
  breakEnd?: string | null;

  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class CreateShiftsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftItemDto)
  shifts!: ShiftItemDto[];
}

/** Ghi chú test 13/10 — kéo thả ca kiểu Jira: chuyển ca sang thợ / ngày khác, hoặc sao chép (giữ Ctrl / Alt khi thả). */
export class MoveShiftDto {
  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' }) stylistId?: string;

  @IsOptional() @Matches(DATE_RE, { message: 'Ngày làm việc phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày làm việc không hợp lệ' })
  workDate?: string;

  /** true = sao chép (ca gốc giữ nguyên). */
  @IsOptional() @IsBoolean() copy?: boolean;
}

export class UpdateShiftDto {
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu ca phải theo định dạng HH:mm' }) startTime?: string;
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc ca phải theo định dạng HH:mm' }) endTime?: string;
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu nghỉ giữa ca phải theo định dạng HH:mm' })
  breakStart?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc nghỉ giữa ca phải theo định dạng HH:mm' })
  breakEnd?: string | null;

  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class CopyWeekDto {
  @Matches(DATE_RE, { message: 'Ngày đầu tuần nguồn phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày đầu tuần nguồn không hợp lệ' })
  sourceWeekStart!: string;

  @Matches(DATE_RE, { message: 'Ngày đầu tuần đích phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày đầu tuần đích không hợp lệ' })
  targetWeekStart!: string;

  @IsOptional() @IsUUID('4') stylistId?: string;

  /** true = ghi đè ca đã có ở tuần đích, false = bỏ qua ngày đã có ca. */
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

export class CreateTimeOffDto {
  @Matches(DATE_RE, { message: 'Ngày nghỉ phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày nghỉ không hợp lệ' })
  offDate!: string;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu nghỉ phải theo định dạng HH:mm' })
  startTime?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc nghỉ phải theo định dạng HH:mm' })
  endTime?: string | null;

  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

/** GET /shifts/coverage?from&to&minStaff — độ phủ ca theo ngày (Mentor S2 · mục 9). */
export class CoverageQueryDto {
  @Matches(DATE_RE, { message: 'Ngày bắt đầu phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày bắt đầu không hợp lệ' })
  from!: string;

  @Matches(DATE_RE, { message: 'Ngày kết thúc phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày kết thúc không hợp lệ' })
  to!: string;

  /** Số thợ tối thiểu phải có mặt ở mọi thời điểm mở cửa (mặc định 1). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  minStaff?: number;
}
