import { api, unwrap, tokenStore } from './client';
import type { AuthUser, LoginResult } from '@/types';

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const result = unwrap<LoginResult>(await api.post('/auth/login', { email, password }));
    tokenStore.set(result.accessToken, result.refreshToken);
    return result;
  },

  async me(): Promise<AuthUser> {
    return unwrap<AuthUser>(await api.get('/auth/me'));
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.refresh });
    } finally {
      tokenStore.clear();
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return unwrap<{ message: string }>(await api.post('/auth/forgot-password', { email }));
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password', { token, newPassword });
  },

  async permissionMatrix() {
    return unwrap<{ roles: Record<string, string>; matrix: Record<string, Record<string, string>> }>(
      await api.get('/auth/permission-matrix'),
    );
  },
};
