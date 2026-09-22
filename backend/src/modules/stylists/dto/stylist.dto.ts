import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID,
  Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { VN_PHONE_REGEX } from '../../../common/utils/phone.util';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateStylistDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập họ tên thợ' }) @MinLength(2) @MaxLength(120)
  fullName!: string;

  @IsOptional() @Matches(VN_PHONE_REGEX, { message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID('4', { message: 'Tài khoản liên kết không hợp lệ' }) userId?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50)
  serviceIds?: string[];
}

export class UpdateStylistDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @Matches(VN_PHONE_REGEX, { message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) serviceIds?: string[];
}

export class ShiftItemDto {
  @Matches(DATE_RE, { message: 'Ngày làm việc phải theo định dạng yyyy-MM-dd' })
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

export class UpdateShiftDto {
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu ca phải theo định dạng HH:mm' }) startTime?: string;
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc ca phải theo định dạng HH:mm' }) endTime?: string;
  @IsOptional() breakStart?: string | null;
  @IsOptional() breakEnd?: string | null;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class CopyWeekDto {
  @Matches(DATE_RE, { message: 'Ngày đầu tuần nguồn phải theo định dạng yyyy-MM-dd' })
  sourceWeekStart!: string;

  @Matches(DATE_RE, { message: 'Ngày đầu tuần đích phải theo định dạng yyyy-MM-dd' })
  targetWeekStart!: string;

  @IsOptional() @IsUUID('4') stylistId?: string;

  /** true = ghi đè ca đã có ở tuần đích, false = bỏ qua ngày đã có ca. */
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

export class CreateTimeOffDto {
  @Matches(DATE_RE, { message: 'Ngày nghỉ phải theo định dạng yyyy-MM-dd' })
  offDate!: string;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu nghỉ phải theo định dạng HH:mm' })
  startTime?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc nghỉ phải theo định dạng HH:mm' })
  endTime?: string | null;

  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}
