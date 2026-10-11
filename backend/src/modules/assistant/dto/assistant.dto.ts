import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AssistantChatDto {
  @IsString() @MinLength(1, { message: 'Nhập câu hỏi cho trợ lý' }) @MaxLength(500, { message: 'Câu hỏi tối đa 500 ký tự' })
  message!: string;
}

export class ShiftSuggestionQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(14) days?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minStaff?: number;
}
