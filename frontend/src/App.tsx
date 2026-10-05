import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ComponentType, ReactNode, Suspense, lazy } from 'react';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { BookingProvider } from '@/contexts/BookingContext';
import { ErrorBoundary, Spinner, UpdateBanner } from '@/components';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import type { Role } from '@/types';

/**
 * Tách chunk theo trang: trang chủ + đăng nhập nạp ngay, còn lại nạp khi vào route
 * (recharts, mockBackend… không còn nằm chung một file 950 KB).
 */
function lazyPage<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

// Trang công khai
import { HomePage } from '@/pages/public/HomePage';
const BookingWizard = lazyPage(() => import('@/pages/public/BookingWizard'), 'BookingWizard');
const LookupPage = lazyPage(() => import('@/pages/public/LookupPage'), 'LookupPage');
const ReviewPage = lazyPage(() => import('@/pages/public/ReviewPage'), 'ReviewPage');

// Xác thực
import { LoginPage } from '@/pages/auth/LoginPage';
const ForgotPasswordPage = lazyPage(() => import('@/pages/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(() => import('@/pages/auth/ResetPasswordPage'), 'ResetPasswordPage');
const ChangePasswordPage = lazyPage(() => import('@/pages/auth/ChangePasswordPage'), 'ChangePasswordPage');

// Lễ tân / vận hành
const DayTimelinePage = lazyPage(() => import('@/pages/reception/DayTimelinePage'), 'DayTimelinePage');
const PendingPage = lazyPage(() => import('@/pages/reception/PendingPage'), 'PendingPage');
const WalkInPage = lazyPage(() => import('@/pages/reception/WalkInPage'), 'WalkInPage');
const InvoicePage = lazyPage(() => import('@/pages/reception/InvoicePage'), 'InvoicePage');
const InvoiceListPage = lazyPage(() => import('@/pages/reception/InvoiceListPage'), 'InvoiceListPage');
const CustomersPage = lazyPage(() => import('@/pages/reception/CustomersPage'), 'CustomersPage');
const BulkReassignPage = lazyPage(() => import('@/pages/reception/BulkReassignPage'), 'BulkReassignPage');
const AppointmentsListPage = lazyPage(() => import('@/pages/reception/AppointmentsListPage'), 'AppointmentsListPage');
const AppointmentDetailPage = lazyPage(() => import('@/pages/reception/AppointmentDetailPage'), 'AppointmentDetailPage');

// Thợ
const MySchedulePage = lazyPage(() => import('@/pages/stylist/MySchedulePage'), 'MySchedulePage');

// Chủ tiệm
const DashboardPage = lazyPage(() => import('@/pages/owner/DashboardPage'), 'DashboardPage');
const RevenuePage = lazyPage(() => import('@/pages/owner/RevenuePage'), 'RevenuePage');
const SlotDensityPage = lazyPage(() => import('@/pages/owner/SlotDensityPage'), 'SlotDensityPage');

// Quản trị
const UsersPage = lazyPage(() => import('@/pages/admin/UsersPage'), 'UsersPage');
const AuditLogsPage = lazyPage(() => import('@/pages/admin/AuditLogsPage'), 'AuditLogsPage');
const ServicesPage = lazyPage(() => import('@/pages/admin/ServicesPage'), 'ServicesPage');
const StylistsPage = lazyPage(() => import('@/pages/admin/StylistsPage'), 'StylistsPage');
const WorkingHoursPage = lazyPage(() => import('@/pages/admin/WorkingHoursPage'), 'WorkingHoursPage');
const ShiftsPage = lazyPage(() => import('@/pages/admin/ShiftsPage'), 'ShiftsPage');
const VouchersPage = lazyPage(() => import('@/pages/admin/VouchersPage'), 'VouchersPage');
const PermissionMatrixPage = lazyPage(() => import('@/pages/admin/PermissionMatrixPage'), 'PermissionMatrixPage');

/** Chặn truy cập ở phía giao diện; máy chủ vẫn kiểm tra lại quyền ở mọi API. */
function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Đang kiểm tra phiên đăng nhập…" />;
  if (!user) return <Navigate to="/dang-nhap" state={{ from: location }} replace />;
  if (user.mustChangePassword && location.pathname !== '/quan-ly/doi-mat-khau') {
    return <Navigate to="/quan-ly/doi-mat-khau" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center">
        <p className="font-semibold text-red-700">Bạn không có quyền xem trang này</p>
        <p className="mt-1 text-sm text-red-600">Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-brand-700">404</p>
      <p className="text-ink-muted">Không tìm thấy trang bạn yêu cầu.</p>
      <a href="/" className="btn-primary">Về trang chủ</a>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RoleSwitcher />
        <UpdateBanner />
        <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
        <Routes>
          {/* ---------------- Trang công khai cho khách ---------------- */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/dat-lich"
              element={<BookingProvider><BookingWizard /></BookingProvider>}
            />
            <Route path="/tra-cuu" element={<LookupPage />} />
            <Route path="/danh-gia" element={<ReviewPage />} />
            <Route path="/danh-gia/:token" element={<ReviewPage />} />
          </Route>

          {/* ---------------- Xác thực ---------------- */}
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
          <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />

          {/* ---------------- Khu vực nội bộ ---------------- */}
          <Route
            path="/quan-ly"
            element={<RequireAuth><AdminLayout /></RequireAuth>}
          >
            <Route index element={
              <RequireAuth roles={['receptionist', 'owner', 'admin']}><DayTimelinePage /></RequireAuth>} />
            <Route path="doi-mat-khau" element={<ChangePasswordPage />} />

            <Route path="cho-xac-nhan" element={
              <RequireAuth roles={['receptionist', 'owner']}><PendingPage /></RequireAuth>} />
            <Route path="khach-vang-lai" element={
              <RequireAuth roles={['receptionist', 'owner']}><WalkInPage /></RequireAuth>} />
            <Route path="chuyen-lich" element={
              <RequireAuth roles={['receptionist', 'owner']}><BulkReassignPage /></RequireAuth>} />
            <Route path="lich-hen" element={
              <RequireAuth roles={['receptionist', 'owner', 'admin', 'stylist']}><AppointmentsListPage /></RequireAuth>} />
            <Route path="lich-hen/:id" element={
              <RequireAuth roles={['receptionist', 'owner', 'admin', 'stylist']}><AppointmentDetailPage /></RequireAuth>} />
            <Route path="phieu-tinh-tien" element={
              <RequireAuth roles={['receptionist', 'owner', 'admin']}><InvoiceListPage /></RequireAuth>} />
            <Route path="phieu-tinh-tien/:appointmentId" element={
              <RequireAuth roles={['receptionist', 'owner']}><InvoicePage /></RequireAuth>} />
            <Route path="khach-hang" element={
              <RequireAuth roles={['receptionist', 'owner', 'admin']}><CustomersPage /></RequireAuth>} />

            <Route path="lich-cua-toi" element={
              <RequireAuth roles={['stylist']}><MySchedulePage /></RequireAuth>} />

            <Route path="tong-quan" element={
              <RequireAuth roles={['owner', 'admin', 'receptionist']}><DashboardPage /></RequireAuth>} />
            <Route path="doanh-thu" element={
              <RequireAuth roles={['owner', 'admin', 'receptionist']}><RevenuePage /></RequireAuth>} />
            <Route path="phan-bo-khung-gio" element={
              <RequireAuth roles={['owner', 'admin']}><SlotDensityPage /></RequireAuth>} />

            <Route path="dich-vu" element={
              <RequireAuth roles={['owner', 'admin', 'receptionist', 'stylist']}><ServicesPage /></RequireAuth>} />
            <Route path="tho" element={
              <RequireAuth roles={['owner', 'admin', 'receptionist']}><StylistsPage /></RequireAuth>} />
            <Route path="ca-lam" element={
              <RequireAuth roles={['owner', 'admin', 'receptionist', 'stylist']}><ShiftsPage /></RequireAuth>} />
            <Route path="gio-mo-cua" element={
              <RequireAuth roles={['owner', 'admin']}><WorkingHoursPage /></RequireAuth>} />
            <Route path="ma-giam-gia" element={
              <RequireAuth roles={['owner', 'admin']}><VouchersPage /></RequireAuth>} />

            <Route path="tai-khoan" element={
              <RequireAuth roles={['admin', 'owner']}><UsersPage /></RequireAuth>} />
            <Route path="nhat-ky" element={
              <RequireAuth roles={['admin', 'owner']}><AuditLogsPage /></RequireAuth>} />
            <Route path="phan-quyen" element={
              <RequireAuth roles={['admin', 'owner']}><PermissionMatrixPage /></RequireAuth>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </ToastProvider>
  );
}
