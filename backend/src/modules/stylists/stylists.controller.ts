import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { StylistsService } from './stylists.service';
import {
  CopyWeekDto, CreateShiftsDto, CreateStylistDto, CreateTimeOffDto, UpdateShiftDto, UpdateStylistDto,
} from './dto/stylist.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { MSG } from '../../common/constants/messages.constant';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB (S1-07)

@Controller('stylists')
@UseGuards(RolesGuard)
export class StylistsController {
  constructor(
    private readonly service: StylistsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list(@Query('isActive') isActive?: string, @Query('serviceId') serviceId?: string) {
    return this.service.list({
      isActive: isActive === undefined ? undefined : isActive === 'true',
      serviceId,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'stylist', 'Tạo hồ sơ thợ')
  create(@Body() dto: CreateStylistDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'stylist', 'Cập nhật hồ sơ thợ')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStylistDto) {
    return this.service.update(id, dto);
  }

  /** Ảnh đại diện tối đa 2MB, định dạng JPG hoặc PNG (S1-07). */
  @Post(':id/avatar')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'stylist', 'Cập nhật ảnh đại diện của thợ')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR ?? 'uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          // Đuôi tệp lấy theo MIME đã được kiểm tra, KHÔNG theo tên gốc: "x.html" gửi kèm
          // Content-Type image/png sẽ thành avatar-*.html và chạy script trên cùng origin (XSS).
          cb(null, `avatar-${unique}${file.mimetype === 'image/png' ? '.png' : '.jpg'}`);
        },
      }),
      limits: { fileSize: MAX_AVATAR_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException(MSG.FILE_TYPE_INVALID), ok);
      },
    }),
  )
  async uploadAvatar(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui lòng chọn tệp ảnh');
    return this.service.setAvatar(id, `/uploads/${file.filename}`);
  }

  // ---------------------------------------------------------------- SHIFTS
  @Get(':id/shifts')
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  listShifts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.listShifts({ stylistId: id, from, to });
  }

  @Post(':id/shifts')
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'stylist_shift', 'Xếp ca làm cho thợ')
  createShifts(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateShiftsDto) {
    return this.service.createShifts(id, dto);
  }

  // -------------------------------------------------------------- TIME OFF
  @Get(':id/time-off')
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  listTimeOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listTimeOff(id, from, to);
  }

  @Post(':id/time-off')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  @Audit(AuditAction.CREATE, 'stylist_time_off', 'Khai báo ngày nghỉ riêng của thợ')
  createTimeOff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTimeOffDto) {
    return this.service.createTimeOff(id, dto);
  }
}

@Controller('shifts')
@UseGuards(RolesGuard)
export class ShiftsController {
  constructor(private readonly service: StylistsService) {}

  /** Bảng ca của cả tiệm trong một khoảng ngày. */
  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list(@Query('from') from: string, @Query('to') to: string, @Query('stylistId') stylistId?: string) {
    return this.service.listShifts({ from, to, stylistId });
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.UPDATE, 'stylist_shift', 'Sửa ca làm')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.service.updateShift(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audit(AuditAction.DELETE, 'stylist_shift', 'Xoá ca làm')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeShift(id);
  }

  @Post('copy-week')
  @Roles(Role.OWNER)
  @Audit(AuditAction.CREATE, 'stylist_shift', 'Sao chép bảng ca sang tuần khác')
  copyWeek(@Body() dto: CopyWeekDto) {
    return this.service.copyWeek(dto);
  }
}

@Controller('time-off')
@UseGuards(RolesGuard)
export class TimeOffController {
  constructor(private readonly service: StylistsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.RECEPTIONIST, Role.STYLIST)
  list(@Query('from') from?: string, @Query('to') to?: string, @Query('stylistId') stylistId?: string) {
    return this.service.listTimeOff(stylistId, from, to);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.RECEPTIONIST)
  @Audit(AuditAction.DELETE, 'stylist_time_off', 'Xoá khai báo nghỉ của thợ')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeTimeOff(id);
  }
}
