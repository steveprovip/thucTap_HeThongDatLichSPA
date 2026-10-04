import { useLocation, useNavigate } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types';
import { DEMO_MODE } from '@/api/mockBackend';

const roles: { id: Role; label: string; route: string }[] = [
  { id: 'customer', label: 'Khách', route: '/' },
  { id: 'receptionist', label: 'Lễ tân', route: '/quan-ly' },
  { id: 'stylist', label: 'Thợ', route: '/quan-ly/lich-cua-toi' },
  { id: 'owner', label: 'Chủ tiệm', route: '/quan-ly/tong-quan' },
  { id: 'admin', label: 'Quản trị', route: '/quan-ly/tai-khoan' },
];

export function RoleSwitcher() {
  const { user, setDemoRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!DEMO_MODE) return null;
  // Điện thoại: thu gọn thành nút tròn 48px, đặt NGAY TRÊN thanh cố định của từng loại trang để không che nút bấm
  const hasBottomNav = !pathname.startsWith('/quan-ly') && !/^\/(dang-nhap|quen-mat-khau|dat-lai-mat-khau)/.test(pathname);
  const bottom = pathname.startsWith('/dat-lich')
    ? 'bottom-[calc(var(--bottom-nav-h)+7rem+env(safe-area-inset-bottom))]'
    : hasBottomNav ? 'bottom-[calc(var(--bottom-nav-h)+0.75rem+env(safe-area-inset-bottom))]'
      : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]';
  const current = user?.role ?? 'customer';
  return (
    // Góc dưới bên phải ở mọi kích thước màn hình: không còn đè lên menu "Đặt lịch / Tra cứu" của thanh trên cùng
    <div className={`role-switcher no-print animate-fade-in fixed right-3 ${bottom} z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-800 shadow-lg backdrop-blur-md transition-shadow hover:shadow-xl sm:bottom-5 sm:right-5 sm:h-auto sm:w-auto sm:max-w-[calc(100vw-1.5rem)] sm:justify-start sm:gap-2 sm:bg-white/90 sm:py-1.5 sm:pl-3.5 sm:pr-1.5`}>
      <UsersRound size={20} className="pointer-events-none shrink-0 text-teal-600 sm:h-[17px] sm:w-[17px]" aria-hidden="true" />
      <label htmlFor="demo-role" className="sr-only whitespace-nowrap text-xs font-semibold text-slate-600 sm:not-sr-only">Chế độ demo · Xem vai trò</label>
      <select id="demo-role" value={current} onChange={event => {
        const next = roles.find(role => role.id === event.target.value);
        if (!next) return;
        setDemoRole(next.id); navigate(next.route);
      }} className="absolute inset-0 h-full w-full cursor-pointer rounded-full text-base opacity-0 sm:static sm:h-auto sm:w-auto sm:min-h-9 sm:border sm:border-slate-200 sm:bg-slate-50 sm:px-3 sm:text-sm sm:opacity-100 font-semibold text-slate-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40">
        {roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
      </select>
    </div>
  );
}
