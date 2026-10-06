import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { AuthUser } from '../../common/types/auth.types';
import { ShiftRequestsService } from './shift-requests.service';
import {
  ApproveShiftRequestDto, BatchApproveShiftRequestsDto, CreateShiftRequestsDto, ListShiftRequestsQueryDto,
  RejectShiftRequestDto,
} from './dto/shift-request.dto';

/** Mentor Sprint 2 · mục 6: thợ tự đăng ký ca làm / ngày nghỉ, quản lý duyệt. */
@Controller('shift-requests')
@UseGuards(RolesGuard)
export class ShiftRequestsController {
  constructor(private readonly service: ShiftRequestsService) {}

  // ---------------------------------------------------------------- thợ
  @Get('mine')
  @Roles(Role.STYLIST)
  mine(@CurrentUser() user: AuthUser, @Query() query: ListShiftRequestsQueryDto) {
    return this.service.listMine(user, query.from, query.to);
  }

  @Post()
  @Roles(Role.STYLIST)
  @Audit(AuditAction.CREATE, 'shift_request', 'Thợ đăng ký ca làm / ngày nghỉ')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftRequestsDto) {
    return this.service.createForSelf(user, dto);
  }

  @Delete(':id')
  @Roles(Role.STYLIST)
  @Audit(AuditAction.UPDATE, 'shift_request', 'Thợ huỷ yêu cầu đăng ký')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelMine(user, id);
  }

  // ------------------------------------------------------------- quản lý
  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST)
  list(@Query() query: ListShiftRequestsQueryDto) {
    return this.service.list(query);
  }

  @Post('approve-batch')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'shift_request', 'Duyệt nhiều yêu cầu đăng ký ca')
  approveMany(@CurrentUser() user: AuthUser, @Body() dto: BatchApproveShiftRequestsDto) {
    return this.service.approveMany(dto.ids, user);
  }

  @Post(':id/approve')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'shift_request', 'Duyệt yêu cầu đăng ký ca / nghỉ')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveShiftRequestDto) {
    return this.service.approve(id, user, dto);
  }

  @Post(':id/reject')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'shift_request', 'Từ chối yêu cầu đăng ký ca / nghỉ')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectShiftRequestDto) {
    return this.service.reject(id, user, dto.note);
  }
}
