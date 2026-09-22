import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarClock, CalendarDays, ClipboardList, Clock, FileText, Gauge, Home,
  LogOut, Menu, Receipt, ScrollText, Scissors, Settings, Ticket, UserCircle2, Users, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components';
import { ROLE_LABELS } from '@/utils/constants';
import type { Role } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

/**
 * Menu bên trái chỉ hiển thị mục mà vai trò được phép, khớp đúng bảng phân quyền
 * trong tài liệu (S1-03). Máy chủ vẫn kiểm tra lại quyền ở mọi API.
 */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Vận hành',
    items: [
      { to: '/quan-ly', label: 'Lịch ngày', icon: <CalendarDays size={18} />, roles: ['receptionist', 'owner', 'admin'] },
      { to: '/quan-ly/cho-xac-nhan', label: 'Chờ xác nhận', icon: <ClipboardList size={18} />, roles: ['receptionist', 'owner'] },
      { to: '/quan-ly/khach-vang-lai', label: 'Khách vãng lai', icon: <UserCircle2 size={18} />, roles: ['receptionist', 'owner'] },
      { to: '/quan-ly/chuyen-lich', label: 'Chuyển lịch hàng loạt', icon: <CalendarClock size={18} />, roles: ['receptionist', 'owner'] },
      { to: '/quan-ly/phieu-tinh-tien', label: 'Phiếu tính tiền', icon: <Receipt size={18} />, roles: ['receptionist', 'owner', 'admin'] },
      { to: '/quan-ly/khach-hang', label: 'Hồ sơ khách', icon: <Users size={18} />, roles: ['receptionist', 'owner', 'admin'] },
    ],
  },
  {
    group: 'Của tôi',
    items: [
      { to: '/quan-ly/lich-cua-toi', label: 'Lịch của tôi', icon: <CalendarDays size={18} />, roles: ['stylist'] },
    ],
  },
  {
    group: 'Báo cáo',
    items: [
      { to: '/quan-ly/tong-quan', label: 'Tổng quan hôm nay', icon: <Gauge size={18} />, roles: ['owner', 'admin', 'receptionist'] },
      { to: '/quan-ly/doanh-thu', label: 'Doanh thu', icon: <BarChart3 size={18} />, roles: ['owner', 'admin', 'receptionist'] },
      { to: '/quan-ly/phan-bo-khung-gio', label: 'Khung giờ & no-show', icon: <Clock size={18} />, roles: ['owner', 'admin'] },
    ],
  },
  {
    group: 'Thiết lập tiệm',
    items: [
      { to: '/quan-ly/dich-vu', label: 'Dịch vụ & bảng giá', icon: <Scissors size={18} />, roles: ['owner', 'admin', 'receptionist', 'stylist'] },
      { to: '/quan-ly/tho', label: 'Hồ sơ thợ', icon: <Users size={18} />, roles: ['owner', 'admin', 'receptionist'] },
      { to: '/quan-ly/ca-lam', label: 'Bảng ca làm', icon: <CalendarClock size={18} />, roles: ['owner', 'admin', 'receptionist', 'stylist'] },
      { to: '/quan-ly/gio-mo-cua', label: 'Giờ mở cửa & ngày nghỉ', icon: <Clock size={18} />, roles: ['owner', 'admin'] },
      { to: '/quan-ly/ma-giam-gia', label: 'Mã giảm giá', icon: <Ticket size={18} />, roles: ['owner', 'admin'] },
    ],
  },
  {
    group: 'Quản trị',
    items: [
      { to: '/quan-ly/tai-khoan', label: 'Tài khoản nhân sự', icon: <Settings size={18} />, roles: ['admin', 'owner'] },
      { to: '/quan-ly/nhat-ky', label: 'Nhật ký hoạt động', icon: <ScrollText size={18} />, roles: ['admin', 'owner'] },
      { to: '/quan-ly/phan-quyen', label: 'Bảng phân quyền', icon: <FileText size={18} />, roles: ['admin', 'owner'] },
    ],
  },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({ ...g, items: g.items.filter((i) => user && i.roles.includes(user.role)) }))
        .filter((g) => g.items.length > 0),
    [user],
  );

  const handleLogout = async () => {
    await logout();
    navigate('/dang-nhap');
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/quan-ly'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors
                     ${isActive ? 'bg-brand-700 text-white' : 'text-ink-soft hover:bg-brand-50 hover:text-brand-800'}`
                  }
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-surface-page">
      {/* Sidebar cố định trên màn hình rộng */}
      <aside className="hidden w-64 shrink-0 border-r border-brand-100 bg-white lg:block">
        <div className="flex h-14 items-center gap-2.5 border-b border-brand-100 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">HS</span>
          <span className="text-sm font-bold">Quản lý tiệm</span>
        </div>
        {sidebar}
      </aside>

      {/* Ngăn kéo trên điện thoại / máy tính bảng */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative z-10 flex h-full w-72 flex-col bg-white shadow-pop">
            <div className="flex h-14 items-center justify-between border-b border-brand-100 px-4">
              <span className="text-sm font-bold">Quản lý tiệm</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Đóng menu" className="p-1.5">
                <X size={18} />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3
                           border-b border-brand-100 bg-white px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button className="rounded-xl p-2 text-ink-soft hover:bg-brand-50 lg:hidden"
                    onClick={() => setMobileOpen(true)} aria-label="Mở menu">
              <Menu size={20} />
            </button>
            <Link to="/" className="btn btn-ghost btn-sm" title="Về trang công khai">
              <Home size={16} /> <span className="hidden sm:inline">Trang khách</span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{user?.fullName}</p>
              <p className="text-xs text-ink-muted">{user ? ROLE_LABELS[user.role] : ''}</p>
            </div>
            <Link to="/quan-ly/doi-mat-khau" className="rounded-xl p-2 text-ink-soft hover:bg-brand-50"
                  aria-label="Đổi mật khẩu">
              <UserCircle2 size={20} />
            </Link>
            <button onClick={handleLogout} className="rounded-xl p-2 text-ink-soft hover:bg-brand-50"
                    aria-label="Đăng xuất" title="Đăng xuất">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
