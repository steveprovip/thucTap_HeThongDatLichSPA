import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/constants/roles.constant';
import type { AuthUser } from '../../common/types/auth.types';
import { ERROR_CODES } from '../../common/constants/messages.constant';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { AssistantService } from './assistant.service';
import { AssistantChatDto, ShiftSuggestionQuery } from './dto/assistant.dto';

/** Part 5 — API nội bộ của Trợ lý AI (chỉ Chủ tiệm và Lễ tân). */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService, private readonly rateLimit: RateLimitService) {}

  @Get('status')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  status() {
    return this.service.status();
  }

  /** TASK v4 · NV1 — số liệu hôm nay cho chế độ "Phân tích & số liệu" của widget. */
  @Get('today')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  today() {
    return this.service.todaySnapshot();
  }

  /** Giờ vàng / giờ vắng + combo dịch vụ — lễ tân xem nhanh khi đang nghe điện thoại. */
  @Get('insights')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  insights() {
    return this.service.insights();
  }

  /** Khung giờ thiếu thợ + thợ nên xếp (tự động, cân bằng giờ làm). */
  @Get('shift-suggestions')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  shiftSuggestions(@Query() q: ShiftSuggestionQuery) {
    return this.service.shiftSuggestions(q.days ?? 7, q.minStaff ?? 1);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  async chat(@Body() dto: AssistantChatDto, @CurrentUser() user: AuthUser) {
    const rl = await this.rateLimit.hit('assistant_chat', user.id, 30, 10);
    if (!rl.allowed) {
      throw new HttpException({
        message: 'Bạn hỏi trợ lý quá nhanh, vui lòng thử lại sau ít phút', code: ERROR_CODES.RATE_LIMITED,
        details: { retryAfterSeconds: 600 },
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.service.chat(dto.message, { userName: user.fullName, history: dto.history });
  }
}

/**
 * TASK v3 · NV1 — AI tư vấn trên trang công khai: không cần đăng nhập, 20 câu / 10 phút / IP, chỉ đọc danh mục công khai.
 * Đăng ký trong AssistantModule (controllers) → mount tại POST /api/public/assistant/chat (tiền tố toàn cục API_PREFIX);
 * @Public() ở cấp lớp để JwtAuthGuard toàn cục bỏ qua mọi route của controller (kiểm thử: test/qa-v4-ai-local.e2e-spec.ts).
 */
@Controller('public/assistant')
@Public()
export class PublicAssistantController {
  constructor(private readonly service: AssistantService, private readonly rateLimit: RateLimitService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: AssistantChatDto, @ClientIp() ip: string) {
    const rl = await this.rateLimit.hit('public_assistant_ip', ip, 20, 10);
    if (!rl.allowed) {
      throw new HttpException({
        message: 'Bạn nhắn hơi nhanh, đợi vài phút rồi hỏi tiếp giúp mình nhé', code: ERROR_CODES.RATE_LIMITED,
        details: { retryAfterSeconds: 600 },
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.service.customerChat(dto.message, dto.history);
  }
}
