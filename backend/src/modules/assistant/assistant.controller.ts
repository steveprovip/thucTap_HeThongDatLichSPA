import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
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
    return this.service.chat(dto.message);
  }
}
