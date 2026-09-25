import { api, unwrap } from './client';
import type { RevenueReport, SlotDensityReport, TodayDashboard } from '@/types';

export const analyticsApi = {
  async today(date?: string): Promise<TodayDashboard> {
    return unwrap<TodayDashboard>(await api.get('/analytics/today', { params: { date } }));
  },
  async revenue(from?: string, to?: string): Promise<RevenueReport> {
    return unwrap<RevenueReport>(await api.get('/analytics/revenue', { params: { from, to } }));
  },
  async slotDensity(from?: string, to?: string): Promise<SlotDensityReport> {
    return unwrap<SlotDensityReport>(await api.get('/analytics/slot-density', { params: { from, to } }));
  },
  /** Tải tệp CSV UTF-8 (có BOM) để Excel mở đúng tiếng Việt. */
  async downloadCsv(kind: 'stylists' | 'services' | 'invoices', from: string, to: string): Promise<void> {
    const res = await api.get(`/analytics/export/${kind}.csv`, {
      params: { from, to }, responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const names = { stylists: 'doanh-thu-theo-tho', services: 'doanh-thu-theo-dich-vu', invoices: 'chi-tiet-phieu' };
    a.href = url;
    a.download = `${names[kind]}_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
