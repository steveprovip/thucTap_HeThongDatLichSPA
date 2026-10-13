import { api, unwrap } from './client';
import type { AppNotification, MailStatus, Paginated } from '@/types';

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
  /** Thư đang gửi thật hay vào hộp thư thử nghiệm (MailDev). */
  async mailStatus(): Promise<MailStatus> {
    return unwrap<MailStatus>(await api.get('/notifications/mail-status'));
  },
  async mailTest(to: string): Promise<{ ok: true; mode: MailStatus['mode'] }> {
    return unwrap<{ ok: true; mode: MailStatus['mode'] }>(await api.post('/notifications/mail-test', { to }));
  },
};
