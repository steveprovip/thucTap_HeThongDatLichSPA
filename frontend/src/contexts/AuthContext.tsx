import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { authApi, onUnauthorized, tokenStore } from '@/api';
import type { AuthUser, Role } from '@/types';
import { DEMO_MODE } from '@/api/demoMode';
import type { demoRole as DemoRoleApi } from '@/api/mockBackend';
import { startRealtime, stopRealtime } from '@/utils/realtime';
import { swrStore } from '@/utils/swrStore';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  setDemoRole: (role: Role) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Bộ chuyển vai trò của bản demo — chỉ nạp (động) khi DEMO_MODE; bản production không bao giờ tải mockBackend. */
let demoRole: typeof DemoRoleApi | null = null;
const loadDemoRole = async (): Promise<typeof DemoRoleApi> => (demoRole ??= (await import('@/api/mockBackend')).demoRole);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (DEMO_MODE) {
      const demo = await loadDemoRole();
      setUser(demo.user()); setLoading(false); return;
    }
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await authApi.me());
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    // Khi refresh token cũng hết hạn -> đưa về trang đăng nhập
    onUnauthorized.handler = () => {
      swrStore.clear();
      setUser(null);
      if (!window.location.pathname.startsWith('/dang-nhap')) {
        window.location.assign('/dang-nhap');
      }
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    // Đổi tài khoản trên cùng tab: bỏ bản đệm của người trước (lịch của chuyên viên khác, SĐT chưa che…)
    swrStore.clear();
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    // API lỗi (mạng, token đã hết hạn…) vẫn phải xoá phiên phía giao diện; trước đây lỗi làm
    // setUser(null) không chạy -> token đã xoá nhưng UI vẫn hiển thị đang đăng nhập.
    try {
      await authApi.logout();
    } catch { /* token cục bộ đã được xoá trong authApi.logout */ }
    if (DEMO_MODE) (await loadDemoRole()).set('customer');
    // Đệm dữ liệu sống ở cấp module (không mất khi điều hướng SPA) → xoá để người đăng nhập sau không thấy dữ liệu cũ
    swrStore.clear();
    setUser(null);
  }, []);

  // Nhân viên đã đăng nhập thì giữ luồng đồng bộ trực tiếp giữa các thiết bị; đăng xuất / chưa đổi mật khẩu lần đầu thì dừng
  const liveUserId = user && !user.mustChangePassword ? user.id : null;
  useEffect(() => {
    if (!liveUserId || DEMO_MODE) return undefined;
    startRealtime();
    return () => stopRealtime();
  }, [liveUserId]);

  const hasRole = useCallback(
    (...roles: Role[]) => !!user && roles.includes(user.role),
    [user],
  );

  const setDemoRole = useCallback((role: Role) => {
    if (!demoRole) return; // chỉ có ở chế độ demo (đã nạp khi khởi động AuthProvider)
    demoRole.set(role);
    swrStore.clear();
    setUser(demoRole.user());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refreshUser, hasRole, setDemoRole }),
    [user, loading, login, logout, refreshUser, hasRole, setDemoRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
