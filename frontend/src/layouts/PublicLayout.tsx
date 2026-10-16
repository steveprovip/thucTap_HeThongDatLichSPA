import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck, Home, LogIn, Phone, Search } from 'lucide-react';
import { SALON } from '@/utils/constants';
import { Suspense, useEffect } from 'react';
import { BackButton, ErrorBoundary, LotusMark, SoundToggle, Spinner } from '@/components';
import { primeAudioOnFirstGesture } from '@/utils/sound';
import { SiteFooter } from './SiteFooter';

const NAV = [
  { to: '/', label: 'Trang chủ', icon: Home, end: true },
  { to: '/dat-lich', label: 'Đặt lịch', icon: CalendarCheck, end: false },
  { to: '/tra-cuu', label: 'Tra cứu', icon: Search, end: false },
];

/** Liên kết trên thanh đầu trang: gạch chân vàng mảnh mọc từ giữa (scaleX, lò xo) khi đang ở trang đó. */
const topLink = ({ isActive }: { isActive: boolean }) =>
  `group relative inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium tracking-wide transition-colors duration-200
   ${isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`;

const dockLink = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-medium transition-colors duration-200
   ${isActive ? 'text-teal-700' : 'text-slate-500 hover:text-slate-900'}`;

/**
 * Bố cục trang công khai — Lotus Ivory (sáng nghỉ dưỡng): thanh đầu kính sữa với dấu hoa sen, điều hướng dạng dock
 * kính trên điện thoại (dùng một tay), chân trang biên tập. Tối ưu cho màn 360px trở lên.
 */
export function PublicLayout() {
  const location = useLocation();
  // Lỗi 8: trang con (tra cứu, đánh giá…) có nút quay lại; trang đặt lịch tự có nút lùi theo từng bước
  const showBack = location.pathname !== '/' && !location.pathname.startsWith('/dat-lich');
  // Mentor S2 · mục 8: trang chủ dùng bề ngang rộng (hết khoảng trống hai bên); form đặt lịch / tra cứu giữ cột vừa mắt
  const wide = location.pathname === '/';
  useEffect(() => primeAudioOnFirstGesture(), []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="glass-soft sticky top-0 z-30 !border-x-0 !border-t-0">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/" className="group flex items-center gap-3" aria-label={`${SALON.name} — trang chủ`}>
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-gold ring-1 ring-gold/35 transition-transform duration-spring ease-spring group-hover:scale-105">
              <LotusMark className="h-6 w-6" />
              <span aria-hidden className="absolute inset-[3px] rounded-full ring-1 ring-gold/15" />
            </span>
            <span className="leading-none">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">Salon &amp; Spa</span>
              <span className="mt-1 block font-display text-[22px] font-semibold italic leading-none text-slate-900">Hương Sen</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <nav className="mr-1 hidden items-center gap-0.5 sm:flex" aria-label="Điều hướng chính">
              {NAV.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={topLink}>
                  {({ isActive }) => (
                    <>
                      {label}
                      <span aria-hidden className={`absolute inset-x-3.5 -bottom-px h-px origin-center bg-gold transition-transform duration-spring ease-spring ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'}`} />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
            <a href={`tel:${SALON.hotline.replace(/\s/g, '')}`}
               className="tnum hidden min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] text-slate-500 transition-colors hover:text-slate-900 lg:inline-flex">
              <Phone size={14} className="text-gold" /> {SALON.hotline}
            </a>
            <SoundToggle />
            <Link to="/dang-nhap"
                  className="ml-1 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-[13px] font-medium text-slate-700 transition-[border-color,color] duration-200 hover:border-gold/60 hover:text-slate-900">
              <LogIn size={14} /> <span className="hidden xs:inline">Nhân viên</span>
            </Link>
          </div>
        </div>
      </header>

      {/* /dat-lich ẩn chân trang trên điện thoại → chừa chỗ cho dock điều hướng cố định để dòng cuối không bị che;
          cao tối thiểu một màn hình để chân trang (máy tính) nằm sẵn dưới mép màn hình, không bị đẩy xuống khi bước 1 tải xong (CLS) */}
      <main className={`mx-auto w-full ${wide ? 'max-w-7xl' : 'max-w-5xl'} flex-1 px-4 pt-5 sm:pb-10
        ${location.pathname.startsWith('/dat-lich') ? 'min-h-[100dvh] pb-[calc(var(--bottom-nav-h)+1.5rem+env(safe-area-inset-bottom))]' : 'pb-6'}`}>
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

      {/* Dock điều hướng kính mờ cho điện thoại — chấm vàng dưới mục đang mở */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 rounded-t-3xl !border-b-0 px-2 pb-[env(safe-area-inset-bottom)] sm:hidden"
           aria-label="Điều hướng dưới">
        {/* Cao cố định var(--bottom-nav-h) để thanh hành động của trang đặt lịch bám đúng mép trên */}
        <div className="flex h-[var(--bottom-nav-h)] items-stretch gap-1 py-1.5">
          {NAV.map(({ to, label, end, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={dockLink}>
              {({ isActive }) => (
                <>
                  <Icon size={19} strokeWidth={isActive ? 2.1 : 1.7} />
                  {label}
                  <span aria-hidden className={`absolute bottom-1 h-1 w-1 rounded-full bg-gold transition-transform duration-spring ease-spring ${isActive ? 'scale-100' : 'scale-0'}`} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Trang đặt lịch trên điện thoại đã có thanh hành động cố định: ẩn chân trang để form không bị che */}
      <div className={location.pathname.startsWith('/dat-lich') ? 'hidden sm:block' : ''}><SiteFooter /></div>
    </div>
  );
}
