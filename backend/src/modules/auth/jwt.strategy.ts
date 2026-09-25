import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { JwtPayload, AuthUser } from '../../common/types/auth.types';
import { MSG } from '../../common/constants/messages.constant';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /**
   * Mỗi request đều đọc lại tài khoản từ CSDL nên:
   *  - đổi vai trò có hiệu lực ngay ở lần gọi API kế tiếp, không cần đăng xuất (S1-03)
   *  - ngưng hoạt động tài khoản làm mọi phiên hết hiệu lực ngay (S1-02)
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException(MSG.TOKEN_INVALID);
    if (!user.isActive) throw new UnauthorizedException(MSG.ACCOUNT_INACTIVE);

    // Token phát hành trước mốc vô hiệu hoá phiên thì không còn giá trị
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (issuedAt && user.sessionsValidFrom.getTime() - 1000 > issuedAt) {
      throw new UnauthorizedException(MSG.TOKEN_EXPIRED);
    }

    const stylist = await this.stylistRepo.findOne({ where: { userId: user.id } });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      stylistId: stylist?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
