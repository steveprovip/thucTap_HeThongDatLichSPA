import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { WorkingHoursService } from './working-hours.service';
import { CreateHolidayDto, UpdateWorkingHoursDto } from './dto/working-hours.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';

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
  constructor(private readonly service: WorkingHoursService) {}

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
  @Audit(AuditAction.CREATE, 'salon_holiday', 'Khai báo ngày nghỉ của tiệm')
  create(@Body() dto: CreateHolidayDto) {
    return this.service.createHoliday(dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'salon_holiday', 'Xoá ngày nghỉ của tiệm')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeHoliday(id);
  }
}
