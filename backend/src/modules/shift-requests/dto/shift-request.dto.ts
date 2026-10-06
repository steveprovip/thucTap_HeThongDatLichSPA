import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/date.validators';
import { ShiftRequestKind, ShiftRequestStatus } from '../../../database/entities/shift-request.entity';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ShiftRequestItemDto {
  @IsEnum(ShiftRequestKind, { message: 'Loại yêu cầu phải là ca làm (shift) hoặc nghỉ (time_off)' })
  kind!: ShiftRequestKind;

  @Matches(DATE_RE, { message: 'Ngày phải theo định dạng yyyy-MM-dd' })
  @IsCalendarDate({ message: 'Ngày không hợp lệ' })
  workDate!: string;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu phải theo định dạng HH:mm (24 giờ)' })
  startTime?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc phải theo định dạng HH:mm (24 giờ)' })
  endTime?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu nghỉ giữa ca phải theo định dạng HH:mm' })
  breakStart?: string | null;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc nghỉ giữa ca phải theo định dạng HH:mm' })
  breakEnd?: string | null;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

/** Thợ gửi một hoặc nhiều ngày (vd. đăng ký cả tuần) trong một lần. */
export class CreateShiftRequestsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một ngày' })
  @ArrayMaxSize(31, { message: 'Mỗi lần gửi tối đa 31 ngày' })
  @ValidateNested({ each: true })
  @Type(() => ShiftRequestItemDto)
  items!: ShiftRequestItemDto[];
}

export class ListShiftRequestsQueryDto {
  @IsOptional() @IsIn(Object.values(ShiftRequestStatus), { message: 'Trạng thái không hợp lệ' })
  status?: ShiftRequestStatus;

  @IsOptional() @Matches(DATE_RE, { message: 'Ngày bắt đầu phải theo định dạng yyyy-MM-dd' })
  from?: string;

  @IsOptional() @Matches(DATE_RE, { message: 'Ngày kết thúc phải theo định dạng yyyy-MM-dd' })
  to?: string;

  @IsOptional() @IsUUID('4', { message: 'Thợ không hợp lệ' })
  stylistId?: string;
}

export class ApproveShiftRequestDto {
  /** Quản lý chỉnh lại giờ cho khớp hoạt động của tiệm trước khi duyệt (bỏ trống = giữ giờ thợ đăng ký). */
  @IsOptional() @Matches(TIME_RE, { message: 'Giờ bắt đầu phải theo định dạng HH:mm (24 giờ)' })
  startTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'Giờ kết thúc phải theo định dạng HH:mm (24 giờ)' })
  endTime?: string;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;

  /** Duyệt nghỉ dù đang có lịch hẹn của khách (quản lý đã xem danh sách và sẽ xử lý). */
  @IsOptional() @IsBoolean()
  force?: boolean;
}

export class RejectShiftRequestDto {
  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

export class BatchApproveShiftRequestsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4', { each: true, message: 'Mã yêu cầu không hợp lệ' })
  ids!: string[];
}
