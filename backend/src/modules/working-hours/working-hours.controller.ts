import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { WorkingHoursService } from './working-hours.service';
import { CreateHolidayDto, UpdateWorkingHoursDto } from './dto/working-hours.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

@Controller('working-hours')
@UseGuards(RolesGuard)
export class WorkingHoursController {
  constructor(private readonly service: WorkingHoursService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list() {
    return this.service.list();
  }

  @Put()
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'working_hours', 'Cập nhật giờ mở cửa của tiệm')
  update(@Body() dto: UpdateWorkingHoursDto) {
    return this.service.update(dto);
  }
}

@Controller('holidays')
@UseGuards(RolesGuard)
export class HolidaysController {
  constructor(private readonly service: WorkingHoursService, private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.listHolidays(from, to);
  }

  @Get('impact')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  impact(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.service.previewHolidayImpact(startDate, endDate);
  }

  @Post()
  @Roles(Role.OWNER)
  async create(@Body() dto: CreateHolidayDto, @CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    const result = await this.service.createHoliday(dto);
    if ('warning' in result) return result;
    await this.audit.write({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: AuditAction.CREATE, entityType: 'salon_holiday', entityId: result.id,
      summary: 'Khai báo ngày nghỉ của tiệm', changes: { ...dto }, ipAddress: ip,
    });
    return result;
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'salon_holiday', 'Xoá ngày nghỉ của tiệm')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeHoliday(id);
  }
}
