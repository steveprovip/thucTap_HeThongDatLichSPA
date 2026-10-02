import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { VN_PHONE_MESSAGE, VN_PHONE_REGEX } from '../../../common/utils/phone.util';
import { IsAsciiEmail } from '../../../common/validators/credential.validators';

export class SearchCustomersQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MaxLength(120) fullName?: string;
  @IsOptional() @IsEmail({}, { message: 'Email không đúng định dạng' }) @IsAsciiEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class LookupByPhoneDto {
  @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone!: string;
}

export class CreateServiceNoteDto {
  @IsString() @MaxLength(500, { message: 'Ghi chú kỹ thuật tối đa 500 ký tự' })
  content!: string;
}
