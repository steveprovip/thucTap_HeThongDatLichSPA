import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_REGEX } from '../../../common/utils/password.util';

export class LoginDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MaxLength(100)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu refresh token' })
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  @MaxLength(100)
  @Matches(PASSWORD_REGEX, { message: 'Mật khẩu phải có tối thiểu 8 ký tự, gồm cả chữ và số' })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(160)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu mã đặt lại mật khẩu' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  @MaxLength(100)
  @Matches(PASSWORD_REGEX, { message: 'Mật khẩu phải có tối thiểu 8 ký tự, gồm cả chữ và số' })
  newPassword!: string;
}
