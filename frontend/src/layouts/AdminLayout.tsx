import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, CalendarClock, CalendarDays, ClipboardList, Clock, FileText, Gauge, Home,
  LogOut, Menu, Moon, Receipt, ScrollText, Scissors, Search, Settings, Sun, Ticket, UserCircle2, Users, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BackButton, CommandPalette, ErrorBoundary, LiveStatus, LotusMark, NotificationBell, SmartAiAssistant, SoundToggle, Spinner } from '@/components';
import { useToast } from '@/contexts/ToastContext';
import { subscribeLiveChanges } from '@/utils/liveSync';
import { playCue, primeAudioOnFirstGesture } from '@/utils/sound';
import { setStaffTheme, useStaffTheme } from '@/utils/theme';
import { ROLE_BADGE, ROLE_LABELS, ROLE_LANDING } from '@/utils/constants';
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
  // QA-04: "Tổng quan" luôn là mục ĐẦU TIÊN của thanh điều hướng với mọi vai trò được phép xem
  {
    group: 'Tổng quan',
    items: [
      { to: '/quan-ly/tong-quan', label: 'Tổng quan hôm nay', icon: <Gauge size={18} />, roles: ['owner', 'admin', 'receptionist'] },
    ],
  },
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
      { to: '/quan-ly/dang-ky-ca', label: 'Đăng ký lịch làm', icon: <CalendarClock size={18} />, roles: ['stylist'] },
    ],
  },
  {
    group: 'Báo cáo',
    items: [
      { to: '/quan-ly/doanh-thu', label: 'Doanh thu', icon: <BarChart3 size={18} />, roles: ['owner', 'admin', 'receptionist'] },
      { to: '/quan-ly/phan-bo-khung-gio', label: 'Khung giờ & no-show', icon: <Clock size={18} />, roles: ['owner', 'admin'] },
      { to: '/quan-ly/cai-tien-ai', label: 'Cải tiến Trợ lý AI', icon: <Bot size={18} />, roles: ['admin'] },
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

const CHIME_KEY = 'salon.chime.last';

/**
 * Chuông báo lịch khách tự đặt online (sự kiện SSE 'booking.created'): Lễ tân / Chủ tiệm / Quản trị nghe tiếng chuông
 * ba nốt + thông báo nổi; danh sách đã tự làm mới qua đồng bộ ngầm. Nhiều tab cùng máy chỉ kêu MỘT lần (khoá theo seq).
 */
function useNewBookingChime(enabled: boolean): void {
  const toast = useToast();
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeLiveChanges((change) => {
      if (change.kind !== 'booking.created') return;
      if (change.seq !== undefined) {
        try {
          const [seq, at] = (localStorage.getItem(CHIME_KEY) ?? '').split('@');
          if (seq === String(change.seq) && Date.now() - Number(at) < 10_000) return;
          localStorage.setItem(CHIME_KEY, `${change.seq}@${Date.now()}`);
        } catch { /* chế độ riêng tư: vẫn kêu */ }
      }
      playCue('alert');
      toast.toast('Có lịch khách vừa đặt online — danh sách đã tự cập nhật', 'info');
    });
  }, [enabled, toast]);
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const theme = useStaffTheme();
  useNewBookingChime(!!user && ['receptionist', 'owner', 'admin'].includes(user.role));
  useEffect(() => primeAudioOnFirstGesture(), []);
  // Ctrl / ⌘ + K mở bảng lệnh ở mọi trang quản trị
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({ ...g, items: g.items.filter((i) => user && i.roles.includes(user.role)) }))
        .filter((g) => g.items.length > 0),
    [user],
  );

  const paletteNav = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label, group: g.group, icon: i.icon }))),
    [groups],
  );

  // TASK v4 · NV4: header gọn — tiêu đề trang hiện tại dạng "Nhóm / Trang" (khớp mục đang chọn ở menu trái)
  const current = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/quan-ly';
    let best: { group: string; label: string; len: number } | null = null;
    for (const g of groups) {
      for (const i of g.items) {
        const hit = path === i.to || (i.to !== '/quan-ly' && path.startsWith(`${i.to}/`));
        if (hit && (!best || i.to.length > best.len)) best = { group: g.group, label: i.label, len: i.to.length };
      }
    }
    return best;
  }, [groups, location.pathname]);
  const initialsOf = (name?: string | null) => (name ?? '').trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  // Lỗi 8: mọi trang con (không phải trang chính của vai trò) đều có nút "← Quay lại"
  const landing = user ? ROLE_LANDING[user.role] ?? '/quan-ly' : '/quan-ly';
  const showBack = location.pathname.replace(/\/+$/, '') !== landing.replace(/\/+$/, '');

  const handleLogout = async () => {
    await logout();
    navigate('/dang-nhap');
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/quan-ly'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors
                     ${isActive ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
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
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm"><LotusMark className="h-5 w-5" /></span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-slate-900">Quản lý tiệm</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-400">Hương Sen</span>
          </span>
        </div>
        {sidebar}
      </aside>

      {/* Ngăn kéo trên điện thoại / máy tính bảng */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-scrim/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col pb-[env(safe-area-inset-bottom)] bg-white shadow-pop animate-slide-in-left">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-sm font-bold">Quản lý tiệm</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Đóng menu" className="tap-44 -mr-2 inline-flex items-center justify-center p-1.5">
                <X size={18} />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3
                           border-b border-slate-200 bg-white/90 px-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-2">
            <button className="tap-44 inline-flex items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                    onClick={() => setMobileOpen(true)} aria-label="Mở menu">
              <Menu size={20} />
            </button>
            <Link to="/" className="btn btn-ghost btn-sm" title="Về trang công khai">
              <Home size={16} /> <span className="hidden xl:inline">Trang khách</span>
            </Link>
            {current && (
              <p className="hidden min-w-0 items-center gap-1.5 truncate text-sm md:flex" aria-label="Vị trí hiện tại">
                <span className="text-slate-300">/</span>
                <span className="text-slate-400">{current.group}</span>
                <span className="text-slate-300">/</span>
                <span className="truncate font-semibold text-slate-800">{current.label}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Tìm nhanh (Ctrl + K)" title="Tìm nhanh lịch hẹn, khách, chuyên viên, trang (Ctrl + K)"
                    className="tap-44 inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-2.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 md:min-w-[200px]">
              <Search size={15} /> <span className="hidden md:inline">Tìm nhanh…</span>
              <kbd className="ml-auto hidden rounded border border-slate-200 px-1.5 text-[10px] font-medium md:inline">Ctrl K</kbd>
            </button>
            <LiveStatus />
            <button type="button" onClick={() => setStaffTheme(theme === 'noir' ? 'light' : 'noir')} aria-pressed={theme === 'noir'}
                    aria-label={theme === 'noir' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện Lotus Noir'} title={theme === 'noir' ? 'Giao diện sáng' : 'Giao diện Lotus Noir'}
                    className="tap-44 hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline-flex">
              {theme === 'noir' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <SoundToggle className="hidden rounded-xl sm:inline-flex" />
            <NotificationBell />
            {/* QA Sprint 4 · mục 8: nhìn rõ đang ở vai trò nào — huy hiệu màu theo vai trò, hiện cả trên điện thoại */}
            <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 sm:pr-2.5" title={`${user?.fullName ?? ''} · ${user?.email ?? ''}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ${user ? ROLE_BADGE[user.role]?.avatar ?? '' : ''}`}>
                {initialsOf(user?.fullName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-[160px] truncate text-sm font-semibold">{user?.fullName}</span>
              </span>
              {user && (
                <span data-role={user.role}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ROLE_BADGE[user.role]?.pill ?? ''}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ROLE_BADGE[user.role]?.dot ?? ''}`} />
                  {ROLE_LABELS[user.role]}
                </span>
              )}
            </div>
            <Link to="/quan-ly/doi-mat-khau" className="tap-44 inline-flex items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Đổi mật khẩu">
              <UserCircle2 size={20} />
            </Link>
            <button onClick={handleLogout} className="tap-44 inline-flex items-center justify-center rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Đăng xuất" title="Đăng xuất">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-6">
          <div key={location.pathname} className="animate-fade">
            {showBack && (
              <div className="no-print mb-3 animate-slide-in-right-soft">
                <BackButton to={landing} />
              </div>
            )}
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<Spinner />}><Outlet /></Suspense>
            </ErrorBoundary>
          </div>
        </main>
        {/* Part 5: trợ lý AI nổi góc phải dưới — tự ẩn với vai trò không phải Chủ tiệm / Lễ tân */}
        <SmartAiAssistant />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={user?.role}
                        navItems={paletteNav} />
      </div>
    </div>
  );
}
