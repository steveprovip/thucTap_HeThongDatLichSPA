/** 5 vai trò cố định của hệ thống (S1-03). */
export enum Role {
  CUSTOMER = 'customer',
  STYLIST = 'stylist',
  RECEPTIONIST = 'receptionist',
  OWNER = 'owner',
  ADMIN = 'admin',
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.CUSTOMER]: 'Khách hàng',
  [Role.STYLIST]: 'Thợ',
  [Role.RECEPTIONIST]: 'Lễ tân',
  [Role.OWNER]: 'Chủ tiệm',
  [Role.ADMIN]: 'Quản trị hệ thống',
};

/** Vai trò nội bộ (được phép đăng nhập vào khu vực quản trị). */
export const INTERNAL_ROLES: Role[] = [Role.STYLIST, Role.RECEPTIONIST, Role.OWNER, Role.ADMIN];

/**
 * Ma trận phân quyền theo module — bản sao trung thực của bảng trong tài liệu
 * (tab "2. User Roles"). Dùng cho tài liệu hoá và cho bộ kiểm thử đối chiếu S4-10.
 *   F = toàn quyền | W = ghi trong phạm vi được giao | R = chỉ xem | '-' = không truy cập
 */
export type PermissionLevel = 'F' | 'W' | 'R' | '-';

export const PERMISSION_MATRIX: Record<string, Record<Role, PermissionLevel>> = {
  'Tài khoản và phân quyền': {
    [Role.CUSTOMER]: '-', [Role.STYLIST]: '-', [Role.RECEPTIONIST]: '-', [Role.OWNER]: 'R', [Role.ADMIN]: 'F',
  },
  'Danh mục dịch vụ và giá': {
    [Role.CUSTOMER]: 'R', [Role.STYLIST]: 'R', [Role.RECEPTIONIST]: 'R', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Hồ sơ thợ và ca làm việc': {
    [Role.CUSTOMER]: 'R', [Role.STYLIST]: 'R', [Role.RECEPTIONIST]: 'W', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Đặt lịch trên trang công khai': {
    [Role.CUSTOMER]: 'W', [Role.STYLIST]: '-', [Role.RECEPTIONIST]: 'F', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Lịch hẹn hằng ngày và check-in': {
    [Role.CUSTOMER]: 'R', [Role.STYLIST]: 'W', [Role.RECEPTIONIST]: 'F', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Phiếu tính tiền': {
    [Role.CUSTOMER]: 'R', [Role.STYLIST]: 'R', [Role.RECEPTIONIST]: 'F', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Hồ sơ và lịch sử dịch vụ của khách': {
    [Role.CUSTOMER]: 'R', [Role.STYLIST]: 'R', [Role.RECEPTIONIST]: 'W', [Role.OWNER]: 'F', [Role.ADMIN]: 'R',
  },
  'Báo cáo doanh thu và nhật ký hoạt động': {
    [Role.CUSTOMER]: '-', [Role.STYLIST]: '-', [Role.RECEPTIONIST]: 'R', [Role.OWNER]: 'F', [Role.ADMIN]: 'F',
  },
};
