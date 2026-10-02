import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { authApi, onUnauthorized, tokenStore } from '@/api';
import type { AuthUser, Role } from '@/types';
import { DEMO_MODE, demoRole } from '@/api/mockBackend';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEMO_MODE ? demoRole.user() : null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  const refreshUser = useCallback(async () => {
    if (DEMO_MODE) {
      setUser(demoRole.user()); setLoading(false); return;
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
      setUser(null);
      if (!window.location.pathname.startsWith('/dang-nhap')) {
        window.location.assign('/dang-nhap');
      }
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    // API lỗi (mạng, token đã hết hạn…) vẫn phải xoá phiên phía giao diện; trước đây lỗi làm
    // setUser(null) không chạy -> token đã xoá nhưng UI vẫn hiển thị đang đăng nhập.
    try {
      await authApi.logout();
    } catch { /* token cục bộ đã được xoá trong authApi.logout */ }
    if (DEMO_MODE) demoRole.set('customer');
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => !!user && roles.includes(user.role),
    [user],
  );

  const setDemoRole = useCallback((role: Role) => {
    demoRole.set(role);
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
