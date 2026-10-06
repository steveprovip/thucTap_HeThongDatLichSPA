import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const TIME_MSG = 'Giờ phải theo định dạng HH:mm';

export class WorkingHourItemDto {
  @Type(() => Number)
  @IsInt() @Min(0) @Max(6)
  dayOfWeek!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: TIME_MSG })
  openTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: TIME_MSG })
  closeTime!: string;

  @IsBoolean()
  isClosed!: boolean;
}

export class UpdateWorkingHoursDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  days!: WorkingHourItemDto[];
}

export class CreateHolidayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải theo định dạng yyyy-MM-dd' })
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải theo định dạng yyyy-MM-dd' })
  endDate!: string;

  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập lý do nghỉ' }) @MaxLength(255)
  reason!: string;

  /** Bỏ qua cảnh báo lịch hẹn bị ảnh hưởng và lưu luôn. */
  @IsOptional() @IsBoolean()
  force?: boolean;
}

export class HolidaySuggestionQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'Năm không hợp lệ' }) @Min(2000, { message: 'Năm phải từ 2000' }) @Max(2100, { message: 'Năm phải trước 2100' })
  year!: number;
}

export class GenerateHolidaysDto {
  @Type(() => Number)
  @IsInt({ message: 'Năm không hợp lệ' }) @Min(2000, { message: 'Năm phải từ 2000' }) @Max(2100, { message: 'Năm phải trước 2100' })
  year!: number;

  /** Chỉ áp dụng các ngày lễ được chọn (khoá trả về từ /holidays/suggestions). Bỏ trống = tất cả. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  keys?: string[];

  /** true = vẫn tạo ngày lễ đang có lịch hẹn của khách (chủ tiệm đã xem và chấp nhận xử lý các lịch đó). */
  @IsOptional() @IsBoolean()
  force?: boolean;
}
