import { Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Role } from '../../../common/constants/roles.constant';
import { VN_PHONE_REGEX } from '../../../common/utils/phone.util';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MinLength(2, { message: 'Họ tên quá ngắn' })
  @MaxLength(120)
  fullName!: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @Matches(VN_PHONE_REGEX, { message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' })
  phone?: string;

  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  role!: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  /** Với vai trò Thợ: tạo luôn hồ sơ thợ tương ứng. */
  @IsOptional()
  @IsBoolean()
  createStylistProfile?: boolean;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @Matches(VN_PHONE_REGEX, { message: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0' }) phone?: string;
  @IsOptional() @IsEnum(Role, { message: 'Vai trò không hợp lệ' }) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListUsersQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 20;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
