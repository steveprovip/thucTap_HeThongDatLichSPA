import { api, unwrap } from './client';
import type { CoverageReport, Shift, Stylist, TimeOff } from '@/types';

export interface ShiftPayload {
  workDate: string;
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  note?: string;
}

export const stylistsApi = {
  async list(params: { isActive?: boolean; serviceId?: string } = {}): Promise<Stylist[]> {
    return unwrap<Stylist[]>(await api.get('/stylists', { params }));
  },
  async findOne(id: string): Promise<Stylist> {
    return unwrap<Stylist>(await api.get(`/stylists/${id}`));
  },
  /** Khi có email, máy chủ tạo kèm tài khoản Thợ và trả `tempPassword` để hiển thị một lần. */
  async create(payload: Partial<Stylist> & { fullName: string }): Promise<Stylist & { tempPassword?: string | null }> {
    return unwrap<Stylist & { tempPassword?: string | null }>(await api.post('/stylists', payload));
  },
  /** QA Sprint 3 · mục 2: gửi `email` để gắn / tạo / đổi tài khoản đăng nhập; tài khoản mới trả `tempPassword` một lần. */
  async update(id: string, payload: Partial<Stylist>): Promise<Stylist & { tempPassword?: string | null }> {
    return unwrap<Stylist & { tempPassword?: string | null }>(await api.patch(`/stylists/${id}`, payload));
  },
  async uploadAvatar(id: string, file: File): Promise<Stylist> {
    const form = new FormData();
    form.append('file', file);
    return unwrap<Stylist>(
      await api.post(`/stylists/${id}/avatar`, form, { headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  },

  // ---- Ca làm
  async shifts(params: { from: string; to: string; stylistId?: string }): Promise<Shift[]> {
    return unwrap<Shift[]>(await api.get('/shifts', { params }));
  },
  async createShifts(stylistId: string, shifts: ShiftPayload[]): Promise<Shift[]> {
    return unwrap<Shift[]>(await api.post(`/stylists/${stylistId}/shifts`, { shifts }));
  },
  async updateShift(id: string, payload: Partial<ShiftPayload>): Promise<Shift> {
    return unwrap<Shift>(await api.patch(`/shifts/${id}`, payload));
  },
  /** Kéo thả trên Bảng ca: chuyển ca sang thợ / ngày khác, hoặc sao chép (`copy`). */
  async moveShift(id: string, payload: { stylistId?: string; workDate?: string; copy?: boolean }): Promise<Shift> {
    return unwrap<Shift>(await api.patch(`/shifts/${id}/move`, payload));
  },
  async removeShift(id: string): Promise<void> {
    await api.delete(`/shifts/${id}`);
  },
  async copyWeek(payload: {
    sourceWeekStart: string; targetWeekStart: string; stylistId?: string; overwrite?: boolean;
  }): Promise<{ created: number; skipped: number; overwritten: number }> {
    return unwrap(await api.post('/shifts/copy-week', payload));
  },

  /** Mentor S2 · mục 9: khung giờ mở cửa chưa có thợ + gợi ý thợ nên xếp. */
  async coverage(params: { from: string; to: string; minStaff?: number }): Promise<CoverageReport> {
    return unwrap<CoverageReport>(await api.get('/shifts/coverage', { params }));
  },

  // ---- Ngày nghỉ riêng
  async timeOff(params: { from?: string; to?: string; stylistId?: string } = {}): Promise<TimeOff[]> {
    return unwrap<TimeOff[]>(await api.get('/time-off', { params }));
  },
  async createTimeOff(stylistId: string, payload: {
    offDate: string; startTime?: string | null; endTime?: string | null; reason?: string; force?: boolean;
  }): Promise<TimeOff | { warning: string; affected: number; codes: string[] }> {
    return unwrap(await api.post(`/stylists/${stylistId}/time-off`, payload));
  },
  async removeTimeOff(id: string): Promise<void> {
    await api.delete(`/time-off/${id}`);
  },
};
