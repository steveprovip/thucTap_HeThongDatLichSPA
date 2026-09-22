import type { AppointmentStatus } from '@/types';

export const SALON = {
  name: import.meta.env.VITE_SALON_NAME || 'Salon & Spa Hương Sen',
  address: import.meta.env.VITE_SALON_ADDRESS || '128 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
  hotline: import.meta.env.VITE_SALON_HOTLINE || '028 3838 6868',
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  arrived: 'Đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  no_show: 'Không đến',
};

/** Màu nền / chữ / viền cho từng trạng thái (đạt tương phản AA). */
export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-300',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-300',
  arrived: 'bg-violet-50 text-violet-800 border-violet-300',
  in_progress: 'bg-cyan-50 text-cyan-900 border-cyan-300',
  completed: 'bg-green-50 text-green-800 border-green-300',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
  no_show: 'bg-red-50 text-red-800 border-red-300',
};

export const STATUS_DOT: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-500',
  confirmed: 'bg-blue-600',
  arrived: 'bg-violet-600',
  in_progress: 'bg-cyan-600',
  completed: 'bg-green-600',
  cancelled: 'bg-gray-400',
  no_show: 'bg-red-600',
};

export const ROLE_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  stylist: 'Thợ',
  receptionist: 'Lễ tân',
  owner: 'Chủ tiệm',
  admin: 'Quản trị hệ thống',
};

export const DOW_LABELS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
/** Thứ tự hiển thị quen thuộc với người Việt: T2 → CN */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
};

export const MAX_SERVICES_PER_BOOKING = 5;
