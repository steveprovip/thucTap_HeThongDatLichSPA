import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { MailService } from './mail.service';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth.types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';

class ListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

class MailTestDto {
  @IsEmail({}, { message: 'Email nhận thư thử không hợp lệ' }) @MaxLength(160) to!: string;
}

@Controller('notifications')
@UseGuards(RolesGuard)
@Roles(Role.STYLIST, Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
export class NotificationsController {
  constructor(private readonly service: NotificationsService, private readonly mail: MailService) {}

  /** Thư đang gửi thật hay vào hộp thư thử nghiệm (MailDev) — trang Tổng quan cảnh báo khi khách không nhận được thư. */
  @Get('mail-status')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  mailStatus() {
    return this.mail.status();
  }

  /** Gửi ngay một thư thử để kiểm tra cấu hình Gmail. */
  @Post('mail-test')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  async mailTest(@Body() dto: MailTestDto) {
    try {
      return await this.mail.sendTest(dto.to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.service.listForUser(user.id, q.page, q.limit);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.service.unreadCount(user.id) };
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }
}
