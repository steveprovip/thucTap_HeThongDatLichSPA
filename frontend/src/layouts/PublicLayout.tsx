import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck, Home, LogIn, Phone, Search } from 'lucide-react';
import { SALON } from '@/utils/constants';
import { Suspense } from 'react';
import { BackButton, ErrorBoundary, Spinner } from '@/components';
import { SiteFooter } from './SiteFooter';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium transition-colors
   ${isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:text-slate-900'}`;

/** Bố cục trang công khai, tối ưu cho màn hình rộng 360px và dùng một tay. */
export function PublicLayout() {
  const location = useLocation();
  // Lỗi 8: trang con (tra cứu, đánh giá…) có nút quay lại; trang đặt lịch tự có nút lùi theo từng bước
  const showBack = location.pathname !== '/' && !location.pathname.startsWith('/dat-lich');
  // Mentor S2 · mục 8: trang chủ dùng bề ngang rộng (hết khoảng trống hai bên); form đặt lịch / tra cứu giữ cột vừa mắt
  const wide = location.pathname === '/';
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm">
              HS
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-ink">{SALON.name}</span>
              <span className="hidden text-xs text-ink-muted sm:block">{SALON.address}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {/* Điều hướng cho màn rộng (thanh dưới cùng chỉ hiện trên điện thoại) */}
            <nav className="mr-1 hidden items-center gap-1 sm:flex" aria-label="Điều hướng chính">
              <NavLink to="/" end className="btn btn-ghost btn-sm"><Home size={15} /> Trang chủ</NavLink>
              <NavLink to="/dat-lich" className="btn btn-ghost btn-sm"><CalendarCheck size={15} /> Đặt lịch</NavLink>
              <NavLink to="/tra-cuu" className="btn btn-ghost btn-sm"><Search size={15} /> Tra cứu</NavLink>
            </nav>
            <a href={`tel:${SALON.hotline.replace(/\s/g, '')}`}
               className="btn btn-ghost btn-sm hidden lg:inline-flex">
              <Phone size={15} /> {SALON.hotline}
            </a>
            <Link to="/dang-nhap" className="btn btn-outline btn-sm">
              <LogIn size={15} /> <span className="hidden xs:inline">Nhân viên</span>
            </Link>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full ${wide ? 'max-w-7xl' : 'max-w-5xl'} flex-1 px-4 pb-6 pt-4 sm:pb-8`}>
        <div key={location.pathname} className="animate-fade">
          {showBack && (
            <div className="mb-4 animate-slide-in-right-soft">
              <BackButton to="/" />
            </div>
          )}
          <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<Spinner />}><Outlet /></Suspense>
            </ErrorBoundary>
        </div>
      </main>

      {/* Thanh điều hướng dưới cùng cho điện thoại */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
           aria-label="Điều hướng dưới">
        {/* Cao cố định var(--bottom-nav-h) để thanh hành động của trang đặt lịch bám đúng mép trên */}
        <div className="flex h-[var(--bottom-nav-h)] items-stretch gap-1 py-1.5">
          <NavLink to="/" end className={navClass}><Home size={18} /> Trang chủ</NavLink>
          <NavLink to="/dat-lich" className={navClass}><CalendarCheck size={18} /> Đặt lịch</NavLink>
          <NavLink to="/tra-cuu" className={navClass}><Search size={18} /> Tra cứu</NavLink>
        </div>
      </nav>

      {/* Trang đặt lịch trên điện thoại đã có thanh hành động cố định: ẩn chân trang để form không bị che */}
      <div className={location.pathname.startsWith('/dat-lich') ? 'hidden sm:block' : ''}><SiteFooter /></div>
    </div>
  );
}
