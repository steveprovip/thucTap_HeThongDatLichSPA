import type { AppointmentStatus } from '@/types';
import { PASSWORD_CHARSET_RE } from './validators';

export const SALON = {
  name: import.meta.env.VITE_SALON_NAME || 'Salon & Spa Hương Sen',
  address: import.meta.env.VITE_SALON_ADDRESS || '128 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
  hotline: import.meta.env.VITE_SALON_HOTLINE || '028 3838 6868',
  /** Số Zalo CSKH hiện ở chân trang khi máy chủ chưa cấu hình SALON_ZALO. */
  zalo: import.meta.env.VITE_SALON_ZALO || '0909 686 868',
  /** Chứng chỉ / cam kết chuyên môn ở chân trang — đổi bằng VITE_SALON_CREDENTIALS (ngăn cách bởi dấu ;). */
  credentials: (import.meta.env.VITE_SALON_CREDENTIALS
    || 'Chuyên viên được đào tạo và có chứng chỉ nghề chăm sóc sắc đẹp;Mỹ phẩm chính hãng, có phiếu công bố của Bộ Y tế;Dụng cụ tiệt trùng riêng cho từng khách')
    .split(';').map((x: string) => x.trim()).filter(Boolean),
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

/** Khối lịch hẹn trên lưới ngày: nền pastel + viền trái đậm. */
export const STATUS_BLOCK: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-50 border-amber-500 text-amber-900',
  confirmed: 'bg-blue-50 border-blue-500 text-blue-900',
  arrived: 'bg-violet-50 border-violet-500 text-violet-900',
  in_progress: 'bg-cyan-50 border-cyan-500 text-cyan-900',
  completed: 'bg-emerald-50 border-emerald-500 text-emerald-900',
  cancelled: 'bg-slate-100 border-slate-400 text-slate-600 line-through decoration-slate-400/60',
  no_show: 'bg-rose-50 border-rose-500 text-rose-900',
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

/** Màu nhận diện vai trò (QA Sprint 4 · mục 8) — dùng chung cho huy hiệu trên thanh trên cùng. */
export const ROLE_BADGE: Record<string, { pill: string; dot: string; avatar: string }> = {
  admin: { pill: 'border-slate-800 bg-slate-900 text-amber-200', dot: 'bg-amber-300', avatar: 'bg-slate-900 text-amber-200 ring-amber-300/60' },
  owner: { pill: 'border-amber-300 bg-amber-50 text-amber-900', dot: 'bg-amber-500', avatar: 'bg-amber-50 text-amber-800 ring-amber-300' },
  receptionist: { pill: 'border-teal-300 bg-teal-50 text-teal-800', dot: 'bg-teal-500', avatar: 'bg-teal-50 text-teal-700 ring-teal-300' },
  stylist: { pill: 'border-violet-300 bg-violet-50 text-violet-800', dot: 'bg-violet-500', avatar: 'bg-violet-50 text-violet-700 ring-violet-300' },
  customer: { pill: 'border-slate-200 bg-white text-slate-700', dot: 'bg-slate-400', avatar: 'bg-slate-50 text-slate-700 ring-slate-200' },
};

export const DOW_LABELS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
/** Thứ tự hiển thị quen thuộc với người Việt: T2 → CN */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
};

export const MAX_SERVICES_PER_BOOKING = 5;

/** Trang mặc định sau khi đăng nhập theo vai trò. */
export const ROLE_LANDING: Record<string, string> = {
  admin: '/quan-ly/tai-khoan',
  owner: '/quan-ly/tong-quan',
  receptionist: '/quan-ly',
  stylist: '/quan-ly/lich-cua-toi',
  customer: '/',
};

/**
 * Tài khoản mẫu — NGUỒN DUY NHẤT cho giao diện. Phải trùng khớp tuyệt đối với
 * backend/database/seed.sql, backend/src/database/run-seed.ts, mockBackend.ts và README.md.
 */
export const DEMO_PASSWORDS = {
  admin: 'Admin@123',
  owner: 'Owner@123',
  receptionist: 'Reception@123',
  stylist: 'Stylist@123',
} as const;

export const DEMO_ACCOUNTS: { role: string; label: string; email: string; password: string; hint: string }[] = [
  { role: 'admin', label: 'Quản trị', email: 'admin@salon.vn', password: DEMO_PASSWORDS.admin, hint: 'Tài khoản, nhật ký, phân quyền' },
  { role: 'owner', label: 'Chủ tiệm', email: 'owner@salon.vn', password: DEMO_PASSWORDS.owner, hint: 'Báo cáo, bảng giá, mã giảm giá' },
  { role: 'receptionist', label: 'Lễ tân', email: 'reception@salon.vn', password: DEMO_PASSWORDS.receptionist, hint: 'Lịch ngày, khách vãng lai, thu ngân' },
  { role: 'stylist', label: 'Thợ', email: 'stylist1@salon.vn', password: DEMO_PASSWORDS.stylist, hint: 'Lịch của tôi (stylist1…5)' },
];

/** Quy tắc mật khẩu: tối thiểu 8 ký tự, có chữ và số. */
export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'len', label: 'Tối thiểu 8 ký tự', test: (pw) => pw.length >= 8 },
  { id: 'letter', label: 'Có ít nhất một chữ cái', test: (pw) => /[A-Za-z]/.test(pw) },
  { id: 'digit', label: 'Có ít nhất một chữ số', test: (pw) => /\d/.test(pw) },
  // QA-02: không chữ có dấu, khoảng trắng hay < > " ' ` \
  { id: 'charset', label: 'Không dấu, không khoảng trắng, không < > " \' ` \\', test: (pw) => pw.length > 0 && PASSWORD_CHARSET_RE.test(pw) },
];
