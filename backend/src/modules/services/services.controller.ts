import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import {
  CreateCategoryDto, CreateServiceDto, ListServicesQuery, UpdateCategoryDto, UpdateServiceDto,
} from './dto/service.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';

@Controller('service-categories')
@UseGuards(RolesGuard)
export class ServiceCategoriesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list() {
    return this.servicesService.listCategories();
  }

  @Post()
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'service_category', 'Tạo nhóm dịch vụ')
  create(@Body() dto: CreateCategoryDto) {
    return this.servicesService.createCategory(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'service_category', 'Cập nhật nhóm dịch vụ')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.servicesService.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'service_category', 'Xoá nhóm dịch vụ')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.removeCategory(id);
  }
}

@Controller('services')
@UseGuards(RolesGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list(@Query() query: ListServicesQuery) {
    return this.servicesService.list(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findOne(id);
  }

  /** Chỉ Chủ tiệm được sửa bảng giá — lễ tân gọi thẳng API vẫn nhận 403 (S1-03). */
  @Post()
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'service', 'Tạo dịch vụ mới')
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'service', 'Cập nhật dịch vụ')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'service', 'Xoá dịch vụ')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.remove(id);
  }
}
