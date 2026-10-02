import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { InvoicesService } from './invoices.service';
import {
  AdjustInvoiceDto, CreateInvoiceDto, CreateVoucherDto, PayInvoiceDto, UpdateInvoiceDto,
} from './dto/invoice.dto';
import { InvoiceStatus } from '../../database/entities/invoice.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth.types';

class ListInvoicesQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}

@Controller('invoices')
@UseGuards(RolesGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  list(@Query() q: ListInvoicesQuery) {
    return this.service.list(q);
  }

  @Get('by-appointment/:appointmentId')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  byAppointment(@Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.service.findByAppointment(appointmentId);
  }

  @Get('voucher-preview')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  voucherPreview(@Query('code') code: string, @Query('subtotal') subtotal: string) {
    return this.service.previewVoucher(code, Number(subtotal) || 0);
  }

  @Get(':id')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.CREATE, 'invoice', 'Lập phiếu tính tiền')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'invoice', 'Cập nhật dòng dịch vụ trên phiếu')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/pay')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'invoice', 'Ghi nhận thanh toán phiếu')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayInvoiceDto) {
    return this.service.pay(id, dto);
  }

  @Patch(':id/close')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'invoice', 'Đóng phiếu và kết thúc lịch hẹn')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(id);
  }

  @Post(':id/adjust')
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'invoice', 'Tạo phiếu điều chỉnh')
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.service.adjust(id, dto, user);
  }
}

@Controller('vouchers')
@UseGuards(RolesGuard)
export class VouchersController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.ADMIN)
  list() {
    return this.service.listVouchers();
  }

  @Post()
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'voucher', 'Tạo mã giảm giá')
  create(@Body() dto: CreateVoucherDto) {
    return this.service.createVoucher(dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'voucher', 'Ngưng sử dụng mã giảm giá')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVoucher(id);
  }
}
