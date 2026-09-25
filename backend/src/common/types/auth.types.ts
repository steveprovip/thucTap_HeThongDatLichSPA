import { Role } from '../constants/roles.constant';

/** Nội dung được ký trong access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** id hồ sơ thợ, chỉ có với vai trò stylist */
  stylistId?: string | null;
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}

/** Thông tin người dùng gắn vào request sau khi qua JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  stylistId: string | null;
  mustChangePassword: boolean;
}
