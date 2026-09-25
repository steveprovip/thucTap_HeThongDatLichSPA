import { api, unwrap } from './client';
import type { AppNotification, Paginated } from '@/types';

export const notificationsApi = {
  async list(page = 1, limit = 20): Promise<Paginated<AppNotification>> {
    return unwrap<Paginated<AppNotification>>(await api.get('/notifications', { params: { page, limit } }));
  },
  async unreadCount(): Promise<number> {
    return (await unwrap<{ count: number }>(await api.get('/notifications/unread-count'))).count;
  },
  async markRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`, {});
  },
  async markAllRead(): Promise<void> {
    await api.patch('/notifications/read-all', {});
  },
};
