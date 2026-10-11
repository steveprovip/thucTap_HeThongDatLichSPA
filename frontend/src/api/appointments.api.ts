import { api, unwrap } from './client';
import type {
  Appointment, AppointmentStatus, Availability, DayTimeline, Paginated, SmartSlotsResult, VisitHistoryItem,
} from '@/types';
import { normalizePage, sortPending, type PendingSort } from '@/utils/opsHelpers';

export interface WalkInPayload {
  serviceIds: string[];
  date: string;
  time: string;
  stylistId?: string;
  fullName: string;
  phone: string;
  email?: string;
  note?: string;
}

export interface BulkReassignSuggestion {
  appointment: Appointment;
  sameTimeOptions: { stylistId: string; stylistName: string }[];
  alternativeTimeOptions: { stylistId: string; stylistName: string; time: string }[];
  needsPhoneCall: boolean;
}

export const appointmentsApi = {
  async timeline(date: string, stylistId?: string): Promise<DayTimeline> {
    return unwrap<DayTimeline>(await api.get('/appointments/timeline', { params: { date, stylistId } }));
  },
  async myDay(date: string): Promise<Appointment[]> {
    return unwrap<Appointment[]>(await api.get('/appointments/my-day', { params: { date } }));
  },
  async pending(): Promise<Appointment[]> {
    return unwrap<Appointment[]>(await api.get('/appointments/pending'));
  },
  /**
   * TASK v3 · NV2: phân trang ở máy chủ; lịch quá hạn 12 giờ luôn đứng đầu (trang 1).
   * TASK v4 · NV3: máy chủ cũ trả MẢNG (không phân trang) → tự sắp xếp + cắt trang ở trình duyệt, không bao giờ sập trang.
   */
  async pendingPage(params: { page: number; limit: number; sort: PendingSort }): Promise<Paginated<Appointment> & { overdueCount: number }> {
    const raw = unwrap<unknown>(await api.get('/appointments/pending', { params }));
    if (Array.isArray(raw)) {
      const all = sortPending(raw as Appointment[], params.sort);
      return { ...normalizePage<Appointment>(all, params.page, params.limit), overdueCount: all.filter((a) => a.pendingOverdue).length };
    }
    const page = normalizePage<Appointment>(raw, params.page, params.limit);
    const overdue = (raw as { overdueCount?: unknown } | null)?.overdueCount;
    return { ...page, overdueCount: typeof overdue === 'number' ? overdue : page.items.filter((a) => a.pendingOverdue).length };
  },
  async rejectReasons(): Promise<string[]> {
    return unwrap<string[]>(await api.get('/appointments/reject-reasons'));
  },
  async list(params: {
    from?: string; to?: string; status?: AppointmentStatus; stylistId?: string;
    search?: string; page?: number; limit?: number; cursor?: string;
    /** TASK v4 · NV3: lọc khách vãng lai / đặt online; order=asc cho danh sách lịch sắp tới. */
    source?: 'online' | 'walk_in'; order?: 'asc' | 'desc';
  }): Promise<Paginated<Appointment> & { nextCursor?: string | null }> {
    const raw = unwrap<unknown>(await api.get('/appointments', { params }));
    const nextCursor = (raw as { nextCursor?: unknown } | null)?.nextCursor;
    return { ...normalizePage<Appointment>(raw, params.page ?? 1, params.limit ?? 50), nextCursor: typeof nextCursor === 'string' ? nextCursor : null };
  },
  /**
   * Lấy TOÀN BỘ lịch hẹn trong khoảng ngày: máy chủ giới hạn tối đa 200 dòng/trang (PaginationDto),
   * nên tự lật trang thay vì gửi limit lớn (lỗi "limit must not be greater than 200").
   * Part 4: lật bằng con trỏ keyset (`nextCursor`) — không trùng / sót dòng khi có lịch mới chen vào giữa chừng;
   * máy chủ cũ chưa trả `nextCursor` thì lùi về lật theo số trang như trước.
   */
  async listAll(params: { from?: string; to?: string; status?: AppointmentStatus; stylistId?: string; source?: 'online' | 'walk_in' }): Promise<Appointment[]> {
    const PAGE_SIZE = 200;
    const out: Appointment[] = [];
    let cursor: string | undefined;
    for (let page = 1; page <= 50; page += 1) {
      const res = await appointmentsApi.list({ ...params, limit: PAGE_SIZE, ...(cursor ? { cursor } : { page }) });
      out.push(...res.items);
      if (res.items.length < PAGE_SIZE) break;
      if (res.nextCursor) cursor = res.nextCursor;
      else if (page >= (res.totalPages ?? 1)) break;
    }
    return out;
  },
  async detail(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.get(`/appointments/${id}`));
  },
  async customerHistory(id: string): Promise<{ customerId: string; isNewCustomer: boolean; history: VisitHistoryItem[] }> {
    return unwrap(await api.get(`/appointments/${id}/customer-history`));
  },
  /** Mentor S2 · mục 4: gợi ý khung giờ tốt nhất kèm lý do + khoảng rảnh từng thợ. */
  async smartSlots(params: { date: string; serviceIds: string[]; days?: number; stylistId?: string; limit?: number }): Promise<SmartSlotsResult> {
    return unwrap<SmartSlotsResult>(await api.get('/appointments/smart-slots', {
      params: { ...params, serviceIds: params.serviceIds.join(',') },
    }));
  },
  async availability(params: {
    date: string; serviceIds: string[]; stylistId?: string; excludeAppointmentId?: string;
  }): Promise<Availability> {
    return unwrap<Availability>(
      await api.get('/appointments/availability', {
        params: {
          date: params.date,
          serviceIds: params.serviceIds.join(','),
          stylistId: params.stylistId,
          excludeAppointmentId: params.excludeAppointmentId,
        },
      }),
    );
  },
  /**
   * Máy chủ thật trả BookingResult ({ appointmentId, code… }) còn bản demo trả thẳng Appointment.
   * Chuẩn hoá: luôn trả về Appointment đầy đủ (có id, customer, services) để check-in và hiển thị ngay.
   */
  async walkIn(payload: WalkInPayload): Promise<Appointment> {
    const res = unwrap<Partial<Appointment> & { appointmentId?: string }>(await api.post('/appointments/walk-in', payload));
    if (res.id && res.customer) return res as Appointment;
    const id = res.appointmentId ?? res.id;
    if (!id) throw new Error('Máy chủ không trả mã lịch hẹn vừa tạo');
    return appointmentsApi.detail(id);
  },
  async confirm(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/confirm`, {}));
  },
  async reject(id: string, reason: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/reject`, { reason }));
  },
  async checkIn(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/check-in`, {}));
  },
  async reschedule(id: string, payload: { stylistId?: string; date?: string; time?: string }): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/reschedule`, payload));
  },
  async noShow(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/no-show`, {}));
  },
  async undoNoShow(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/undo-no-show`, {}));
  },
  async cancel(id: string, reason: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/cancel`, { reason }));
  },
  async start(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/start`, {}));
  },
  async complete(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.patch(`/appointments/${id}/complete`, {}));
  },
  async serviceNote(id: string, content: string) {
    return unwrap(await api.post(`/appointments/${id}/service-note`, { content }));
  },
  async todaySummary(date?: string): Promise<Record<AppointmentStatus, number>> {
    return unwrap(await api.get('/appointments/today-summary', { params: { date } }));
  },
  async bulkSuggestions(stylistId: string, date: string): Promise<{
    stylistId: string; date: string; total: number; items: BulkReassignSuggestion[];
  }> {
    return unwrap(await api.get('/appointments/bulk-reassign/suggestions', { params: { stylistId, date } }));
  },
  async bulkReassign(items: { appointmentId: string; targetStylistId?: string; targetTime?: string }[]) {
    return unwrap<{ succeeded: number; failed: { appointmentId: string; reason: string }[] }>(
      await api.post('/appointments/bulk-reassign', { items }),
    );
  },
};
