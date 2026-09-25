import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth.types';
import { PERMISSION_MATRIX, ROLE_LABELS } from '../../common/constants/roles.constant';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @ClientIp() ip: string, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @ClientIp() ip: string, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, ip, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: Partial<RefreshDto>, @CurrentUser() user: AuthUser) {
    return this.authService.logout(dto?.refreshToken, user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthUser) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgot(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    return this.authService.forgotPassword(dto.email, ip);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /** Bảng phân quyền dùng cho màn hình quản trị và bộ kiểm thử đối chiếu (S4-10). */
  @Public()
  @Get('permission-matrix')
  matrix() {
    return { roles: ROLE_LABELS, matrix: PERMISSION_MATRIX };
  }
}
