import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { SearchCustomersQuery, UpdateCustomerDto } from './dto/customer.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth.types';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';

@Controller('customers')
@UseGuards(RolesGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  search(@Query() q: SearchCustomersQuery, @CurrentUser() user: AuthUser) {
    return this.service.search(q.q, q.page, q.limit, user.role);
  }

  /** Lễ tân gõ số điện thoại để tự điền tên và xem lịch sử gần nhất (S3-07). */
  @Get('by-phone/:phone')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN)
  async byPhone(@Param('phone') phone: string, @CurrentUser() user: AuthUser) {
    const customer = await this.service.findByPhone(phone, user.role);
    if (!customer) return { found: false, customer: null, history: [] };
    const history = await this.service.visitHistory(customer.id, 5);
    return { found: true, customer, history };
  }

  @Get(':id')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findById(id, user.role);
  }

  @Get(':id/history')
  @Roles(Role.RECEPTIONIST, Role.OWNER, Role.ADMIN, Role.STYLIST)
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.visitHistory(id, 10);
  }

  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.OWNER)
  @Audit(AuditAction.UPDATE, 'customer', 'Cập nhật hồ sơ khách hàng')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(id, dto);
  }
}
