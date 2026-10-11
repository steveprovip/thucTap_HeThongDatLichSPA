import { api, unwrap } from './client';
import type { AuditLogRow, Paginated, Role, UserRow } from '@/types';
import { normalizePage } from '@/utils/opsHelpers';

export const usersApi = {
  async list(params: { page?: number; limit?: number; role?: Role; isActive?: boolean; search?: string } = {}) {
    return unwrap<Paginated<UserRow>>(await api.get('/users', { params }));
  },
  async create(payload: {
    fullName: string; email: string; phone?: string; role: Role; isActive?: boolean; createStylistProfile?: boolean;
  }): Promise<UserRow & { tempPasswordSentTo: string; tempPassword?: string | null }> {
    return unwrap(await api.post('/users', payload));
  },
  async update(id: string, payload: Partial<{ fullName: string; phone: string; role: Role; isActive: boolean }>) {
    return unwrap<UserRow>(await api.patch(`/users/${id}`, payload));
  },
  async resetPassword(id: string) {
    return unwrap<{ success: boolean; sentTo: string; tempPassword?: string | null }>(await api.post(`/users/${id}/reset-password`, {}));
  },
  async unlock(id: string) {
    return unwrap<UserRow>(await api.post(`/users/${id}/unlock`, {}));
  },
};

export const auditApi = {
  async list(params: { page?: number; limit?: number; from?: string; to?: string; actorId?: string; actor?: string; action?: string; entityType?: string }): Promise<Paginated<AuditLogRow>> {
    return normalizePage<AuditLogRow>(unwrap<unknown>(await api.get('/audit-logs', { params })), params.page ?? 1, params.limit ?? 50);
  },
};
