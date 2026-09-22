import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { AuditService } from './audit.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';

class ListAuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải theo định dạng yyyy-MM-dd' }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải theo định dạng yyyy-MM-dd' }) to?: string;
  @IsOptional() @IsUUID('4', { message: 'Mã tài khoản không hợp lệ' }) actorId?: string;
  @IsOptional() entityType?: string;
}

/** Nhật ký chỉ đọc: không có endpoint sửa/xoá cho bất kỳ vai trò nào (S1-09). */
@Controller('audit-logs')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: ListAuditQuery) {
    return this.auditService.list(query);
  }
}
