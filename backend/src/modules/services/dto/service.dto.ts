import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập tên nhóm dịch vụ' }) @MaxLength(120)
  name!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999)
  displayOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) displayOrder?: number;
}

export class CreateServiceDto {
  @IsUUID('4', { message: 'Nhóm dịch vụ không hợp lệ' })
  categoryId!: string;

  @IsString() @IsNotEmpty({ message: 'Vui lòng nhập tên dịch vụ' }) @MaxLength(160)
  name!: string;

  /** Bội số của 15, từ 15 đến 240 phút (S1-05). */
  @Type(() => Number)
  @IsInt({ message: 'Thời lượng phải là số nguyên (phút)' })
  @Min(15, { message: 'Thời lượng tối thiểu là 15 phút' })
  @Max(240, { message: 'Thời lượng tối đa là 240 phút' })
  durationMinutes!: number;

  @Type(() => Number)
  @IsInt({ message: 'Giá phải là số nguyên' })
  @Min(1, { message: 'Giá phải lớn hơn 0' })
  @Max(20000000, { message: 'Giá tối đa là 20.000.000 đ' })
  price!: number;

  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Danh sách thợ đảm nhận được dịch vụ này. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('4', { each: true, message: 'Mã thợ không hợp lệ' })
  stylistIds?: string[];
}

export class UpdateServiceDto {
  @IsOptional() @IsUUID('4', { message: 'Nhóm dịch vụ không hợp lệ' }) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15, { message: 'Thời lượng tối thiểu là 15 phút' })
  @Max(240, { message: 'Thời lượng tối đa là 240 phút' }) durationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20000000, { message: 'Giá tối đa là 20.000.000 đ' }) price?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('4', { each: true, message: 'Mã thợ không hợp lệ' })
  stylistIds?: string[];
}

export class ListServicesQuery {
  @IsOptional() @IsUUID('4') categoryId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  // Boolean('false') === true, nên phải đọc chuỗi query một cách tường minh
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean() isActive?: boolean;
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean() onlyWithStylist?: boolean;
}
