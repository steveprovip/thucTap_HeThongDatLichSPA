import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class ChatTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(2000) content!: string;
}

export class AssistantChatDto {
  @IsString() @MinLength(1, { message: 'Nhập câu hỏi cho trợ lý' }) @MaxLength(500, { message: 'Câu hỏi tối đa 500 ký tự' })
  message!: string;

  /** Vài lượt hội thoại gần nhất để mô hình hiểu câu nối tiếp (chỉ dùng khi bật AI_PROVIDER). */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class ShiftSuggestionQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(14) days?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minStaff?: number;
}
