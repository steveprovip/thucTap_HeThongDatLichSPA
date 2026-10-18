import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/constants/roles.constant';
import type { AuthUser } from '../../common/types/auth.types';
import { ERROR_CODES } from '../../common/constants/messages.constant';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { AssistantService, LearningRejected } from './assistant.service';
import { AssistantChatDto, AssistantFeedbackDto, LearningAddDto, LearningUpdateDto, ShiftSuggestionQuery } from './dto/assistant.dto';

/** Part 5 — API nội bộ của Trợ lý AI (chỉ Chủ tiệm và Lễ tân). */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService, private readonly rateLimit: RateLimitService) {}

  @Get('status')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  status() {
    return this.service.status();
  }

  /** QA 12/10 — bật AI local một chạm (model_AI_local đã tải sẵn trên máy chạy backend). */
  @Post('local/start')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  startLocal() {
    return this.service.startLocal(true);
  }

  /** QA 12/10 — thợ có ca hôm nay, ai đang làm khách / đang rảnh. */
  @Get('working-today')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  workingToday() {
    return this.service.workingToday();
  }

  /**
   * Câu khách hỏi mà trợ lý tư vấn chưa trả lời được (30 ngày, đã che dữ liệu cá nhân) — chủ tiệm xem để bổ sung mô tả
   * dịch vụ / chính sách: vòng cải tiến liên tục kiểu "knowledge gaps" của các trợ lý CSKH hàng đầu.
   */
  @Get('knowledge-gaps')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  knowledgeGaps() {
    return this.service.knowledgeGaps(30);
  }

  /**
   * Vòng tự cải tiến của trợ lý tư vấn: câu chưa trả lời được + đề xuất học (mô hình viết lại / khách diễn đạt lại) chờ duyệt
   * + phản hồi 👍/👎 của khách. Chủ tiệm duyệt đề xuất → trợ lý hiểu câu đó ngay, không cần mô hình.
   */
  // QA Sprint 4: "Cải tiến Trợ lý AI" CHỈ dành cho Quản trị hệ thống — chặn cả ở API, không chỉ ẩn menu
  @Get('improvement')
  @Roles(Role.ADMIN)
  improvement() {
    return this.service.improvementReport(30);
  }

  @Get('learning')
  @Roles(Role.ADMIN)
  learning(@Query('status') status?: string) {
    const s = status === 'approved' || status === 'rejected' ? status : 'suggested';
    return this.service.learningList(s);
  }

  @Patch('learning/:id')
  @Roles(Role.ADMIN)
  async learningUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LearningUpdateDto) {
    try {
      const row = await this.service.learningUpdate(id, dto);
      if (!row) throw new NotFoundException('Không tìm thấy đề xuất này');
      return row;
    } catch (e) {
      if (e instanceof LearningRejected) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('learning')
  @Roles(Role.ADMIN)
  async learningAdd(@Body() dto: LearningAddDto) {
    try {
      return await this.service.learningAdd(dto.kind, dto.phrase, dto.rewrite);
    } catch (e) {
      if (e instanceof LearningRejected) throw new BadRequestException(e.message);
      throw e;
    }
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
  async chat(@Body() dto: AssistantChatDto, @ClientIp() ip: string, @Headers('x-assistant-eval') evalRun?: string) {
    const rl = await this.rateLimit.hit('public_assistant_ip', ip, 20, 10);
    if (!rl.allowed) {
      throw new HttpException({
        message: 'Bạn nhắn hơi nhanh, đợi vài phút rồi hỏi tiếp giúp mình nhé', code: ERROR_CODES.RATE_LIMITED,
        details: { retryAfterSeconds: 600 },
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Lượt của bộ chấm điểm không làm bẩn báo cáo "Cải tiến AI" (chỉ bỏ ghi nhận, câu trả lời y hệt)
    return this.service.customerChat(dto.message, dto.history, dto.state, evalRun !== '1');
  }

  /** Khách bấm 👍 / 👎 dưới câu trả lời — 30 lần / 10 phút / IP. */
  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  async feedback(@Body() dto: AssistantFeedbackDto, @ClientIp() ip: string) {
    const rl = await this.rateLimit.hit('public_assistant_feedback_ip', ip, 30, 10);
    if (!rl.allowed) throw new HttpException({ message: 'Bạn thao tác hơi nhanh, thử lại sau ít phút nhé', code: ERROR_CODES.RATE_LIMITED }, HttpStatus.TOO_MANY_REQUESTS);
    await this.service.customerFeedback(dto.question, dto.intent, dto.helpful);
    return { ok: true };
  }
}
