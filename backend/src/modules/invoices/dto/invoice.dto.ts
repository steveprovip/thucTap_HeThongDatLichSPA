import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../database/entities/invoice.entity';
import { DiscountType } from '../../../database/entities/voucher.entity';

export class InvoiceItemDto {
  @IsOptional() @IsUUID('4', { message: 'Dịch vụ không hợp lệ' })
  serviceId?: string;

  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập tên dòng dịch vụ' }) @MaxLength(160)
  name!: string;

  @Type(() => Number) @IsInt({ message: 'Đơn giá phải là số nguyên' }) @Min(0)
  unitPrice!: number;

  @Type(() => Number) @IsInt() @Min(1, { message: 'Số lượng tối thiểu là 1' }) @Max(20)
  quantity!: number;
}

export class CreateInvoiceDto {
  @IsUUID('4', { message: 'Lịch hẹn không hợp lệ' })
  appointmentId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu phải có ít nhất một dòng dịch vụ' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @IsOptional() @IsString() @MaxLength(30) voucherCode?: string | null;
}

export class PayInvoiceDto {
  @IsEnum(PaymentMethod, { message: 'Hình thức thanh toán không hợp lệ' })
  paymentMethod!: PaymentMethod;

  @IsOptional() @IsString() @MaxLength(255)
  transferNote?: string;
}

export class AdjustInvoiceDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập lý do điều chỉnh' }) @MaxLength(255)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu điều chỉnh phải có ít nhất một dòng dịch vụ' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @IsOptional() @IsString() @MaxLength(30) voucherCode?: string | null;
}

export class CreateVoucherDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập mã giảm giá' }) @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã chỉ gồm chữ, số, gạch ngang và gạch dưới' })
  code!: string;

  @IsOptional() @IsString() @MaxLength(255) description?: string;

  @IsEnum(DiscountType, { message: 'Kiểu giảm giá không hợp lệ' })
  discountType!: DiscountType;

  @Type(() => Number) @IsInt() @Min(1, { message: 'Giá trị giảm phải lớn hơn 0' })
  discountValue!: number;

  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' }) startDate!: string;
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' }) endDate!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0, { message: 'Giá trị đơn tối thiểu không được âm' }) @Max(999_999_999)
  minOrderValue?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsage?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** QA 12/10 — sửa / bật / tắt mã giảm giá (PATCH /vouchers/:id). Trường nào gửi lên mới đổi; null = xoá giá trị tuỳ chọn. */
export class UpdateVoucherDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Vui lòng nhập mã giảm giá' }) @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã chỉ gồm chữ, số, gạch ngang và gạch dưới' })
  code?: string;

  @IsOptional() @IsString() @MaxLength(255) description?: string | null;
  @IsOptional() @IsEnum(DiscountType, { message: 'Kiểu giảm giá không hợp lệ' }) discountType?: DiscountType;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1, { message: 'Giá trị giảm phải lớn hơn 0' })
  discountValue?: number;

  @IsOptional() @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' }) endDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0, { message: 'Giá trị đơn tối thiểu không được âm' }) @Max(999_999_999)
  minOrderValue?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsage?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
