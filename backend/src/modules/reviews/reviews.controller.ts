import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/review.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  /** Trang đánh giá công khai, mở bằng liên kết một lần trong email. */
  @Public()
  @Get('token/:token')
  byToken(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('token/:token')
  submit(@Param('token') token: string, @Body() dto: SubmitReviewDto) {
    return this.service.submit(token, dto);
  }

  /** Khách tra cứu bằng mã lịch hẹn cũng mở được biểu mẫu. */
  @Public()
  @Get('by-code')
  byCode(@Query('code') code: string) {
    return this.service.getByAppointmentCode(code);
  }

  /** Chủ tiệm xem điểm trung bình của từng thợ. */
  @Get('stylist-ratings')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  ratings() {
    return this.service.stylistRatings();
  }

  @Get('stylist/:stylistId')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  forStylist(@Param('stylistId') stylistId: string) {
    return this.service.listForStylist(stylistId);
  }
}
