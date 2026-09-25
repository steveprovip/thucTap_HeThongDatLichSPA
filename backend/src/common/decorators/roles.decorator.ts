import { SetMetadata } from '@nestjs/common';
import { Role } from '../constants/roles.constant';

export const ROLES_KEY = 'roles';
/** Giới hạn endpoint cho danh sách vai trò. Kiểm tra ở MÁY CHỦ, không chỉ ẩn nút (S1-03). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
