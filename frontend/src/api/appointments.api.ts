import { api, unwrap } from './client';
import type { Appointment, Availability, DayTimeline, Paginated, AppointmentStatus, VisitHistoryItem } from '@/types';

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
  async rejectReasons(): Promise<string[]> {
    return unwrap<string[]>(await api.get('/appointments/reject-reasons'));
  },
  async list(params: {
    from?: string; to?: string; status?: AppointmentStatus; stylistId?: string;
    search?: string; page?: number; limit?: number;
  }): Promise<Paginated<Appointment>> {
    return unwrap<Paginated<Appointment>>(await api.get('/appointments', { params }));
  },
  async detail(id: string): Promise<Appointment> {
    return unwrap<Appointment>(await api.get(`/appointments/${id}`));
  },
  async customerHistory(id: string): Promise<{ customerId: string; isNewCustomer: boolean; history: VisitHistoryItem[] }> {
    return unwrap(await api.get(`/appointments/${id}/customer-history`));
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
  async walkIn(payload: WalkInPayload) {
    return unwrap(await api.post('/appointments/walk-in', payload));
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
