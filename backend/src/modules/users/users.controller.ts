import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth.types';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Chủ tiệm chỉ được xem (R), Admin toàn quyền (F). */
  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  list(@Query() query: ListUsersQuery) {
    return this.usersService.list(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Audit(AuditAction.CREATE, 'user', 'Tạo tài khoản nhân sự')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @Audit(AuditAction.UPDATE, 'user', 'Cập nhật tài khoản nhân sự')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.update(id, dto, actor.id);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  @Audit(AuditAction.UPDATE, 'user', 'Cấp lại mật khẩu tạm cho nhân sự')
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.resetTempPassword(id);
  }

  @Post(':id/unlock')
  @Roles(Role.ADMIN)
  @Audit(AuditAction.UPDATE, 'user', 'Mở khoá tài khoản')
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unlock(id);
  }
}
