import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class ChatTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(2000) content!: string;
}

/**
 * Trạng thái hội thoại (dialogue state) — việc trợ lý đang làm dở qua nhiều lượt, TÁCH khỏi lịch sử chat: khách hỏi
 * "sáng mai còn giờ nào?" → trợ lý hỏi dịch vụ → khách đáp "cắt tóc nữ" thì vẫn tra đúng SÁNG MAI. Máy chủ trả về,
 * widget gửi lại nguyên văn ở lượt sau; mọi trường đều được kiểm tra (dữ liệu từ trình duyệt).
 */
export class DialogStateDto {
  @IsOptional() @IsIn(['availability']) task?: 'availability';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsIn(['sang', 'trua', 'chieu', 'toi']) part?: 'sang' | 'trua' | 'chieu' | 'toi';
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsBoolean() awaitingService?: boolean;
  /** Số lượt liên tiếp trợ lý chưa hiểu → lượt thứ hai chuyển khách sang nhân viên. */
  @IsOptional() @IsInt() @Min(0) @Max(9) misses?: number;
}

export class AssistantChatDto {
  @IsString() @MinLength(1, { message: 'Nhập câu hỏi cho trợ lý' }) @MaxLength(500, { message: 'Câu hỏi tối đa 500 ký tự' })
  message!: string;

  /** Vài lượt hội thoại gần nhất để mô hình hiểu câu nối tiếp (chỉ dùng khi bật AI_PROVIDER). */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];

  @IsOptional() @ValidateNested() @Type(() => DialogStateDto)
  state?: DialogStateDto;
}

export class ShiftSuggestionQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(14) days?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minStaff?: number;
}

/** Chủ tiệm duyệt / từ chối / sửa một đề xuất học của trợ lý. */
export class LearningUpdateDto {
  @IsOptional() @IsIn(['approved', 'rejected', 'suggested']) status?: 'approved' | 'rejected' | 'suggested';
  @IsOptional() @IsString() @MaxLength(1000) rewrite?: string;
}

/** Chủ tiệm tự dạy trợ lý: cụm từ ("mát xoa" → "massage") hoặc cả câu → câu rõ nghĩa. */
export class LearningAddDto {
  @IsIn(['question', 'alias', 'answer']) kind!: 'question' | 'alias' | 'answer';
  @IsString() @MinLength(2) @MaxLength(200) phrase!: string;
  @IsString() @MinLength(1) @MaxLength(1000) rewrite!: string;
}

/** Khách bấm 👍 / 👎 dưới câu trả lời. */
export class AssistantFeedbackDto {
  @IsString() @MinLength(1) @MaxLength(500) question!: string;
  @IsString() @MaxLength(40) intent!: string;
  @IsBoolean() helpful!: boolean;
}
