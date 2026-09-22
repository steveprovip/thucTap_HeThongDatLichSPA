import { api, unwrap } from './client';
import type { Holiday, WorkingHour } from '@/types';

export const workingHoursApi = {
  async list(): Promise<WorkingHour[]> {
    return unwrap<WorkingHour[]>(await api.get('/working-hours'));
  },
  async update(days: Omit<WorkingHour, 'id' | 'dayLabel'>[]): Promise<WorkingHour[]> {
    return unwrap<WorkingHour[]>(await api.put('/working-hours', { days }));
  },
  async holidays(params: { from?: string; to?: string } = {}): Promise<Holiday[]> {
    return unwrap<Holiday[]>(await api.get('/holidays', { params }));
  },
  async createHoliday(payload: { startDate: string; endDate: string; reason: string; force?: boolean }) {
    return unwrap<Holiday | { warning: string; affected: number; codes: string[] }>(
      await api.post('/holidays', payload),
    );
  },
  async removeHoliday(id: string): Promise<void> {
    await api.delete(`/holidays/${id}`);
  },
};
