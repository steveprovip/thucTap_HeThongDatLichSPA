import { api, unwrap } from './client';
import type {
  Availability, BookingResult, PublicAppointment, PublicCatalogGroup, PublicStylist, Quote, SalonInfo, SlotHold,
} from '@/types';

export interface CreateBookingPayload {
  serviceIds: string[];
  date: string;
  time: string;
  stylistId?: string;
  fullName: string;
  phone: string;
  email?: string;
  note?: string;
  /** Mã giữ chỗ (Mentor S2 · mục 11) — đổi chỗ đang giữ thành lịch hẹn. */
  holdToken?: string;
}

export const publicApi = {
  /** Mentor S2 · mục 7: liên hệ, mạng xã hội, giờ mở cửa và đội ngũ chuyên viên cho chân trang. */
  async salonInfo(): Promise<SalonInfo> {
    return unwrap<SalonInfo>(await api.get('/public/salon-info'));
  },

  async catalog(search?: string): Promise<PublicCatalogGroup[]> {
    return unwrap<PublicCatalogGroup[]>(
      await api.get('/public/catalog', { params: search ? { search } : undefined }),
    );
  },

  async quote(serviceIds: string[]): Promise<Quote> {
    return unwrap<Quote>(await api.post('/public/quote', { serviceIds }));
  },

  async stylists(serviceIds: string[]): Promise<PublicStylist[]> {
    return unwrap<PublicStylist[]>(
      await api.get('/public/stylists', { params: { serviceIds: serviceIds.join(',') } }),
    );
  },

  async availability(date: string, serviceIds: string[], stylistId?: string): Promise<Availability> {
    return unwrap<Availability>(
      await api.get('/public/availability', {
        params: { date, serviceIds: serviceIds.join(','), ...(stylistId ? { stylistId } : {}) },
      }),
    );
  },

  /** Giữ chỗ khung giờ trong lúc điền thông tin; previousToken = chỗ cũ cần trả lại. */
  async hold(payload: { serviceIds: string[]; date: string; time: string; stylistId?: string; previousToken?: string }): Promise<SlotHold> {
    return unwrap<SlotHold>(await api.post('/public/holds', payload));
  },

  async releaseHold(token: string): Promise<void> {
    await api.delete(`/public/holds/${encodeURIComponent(token)}`);
  },

  async createBooking(payload: CreateBookingPayload): Promise<BookingResult> {
    return unwrap<BookingResult>(await api.post('/public/bookings', payload));
  },

  /** Mentor S2 · mục 10: gửi (lại) email xác nhận, xác thực bằng mã tra cứu + SĐT. */
  async sendConfirmationEmail(payload: { code: string; phone: string; email: string }): Promise<{ emailQueued: boolean; toEmail: string }> {
    return unwrap(await api.post('/public/bookings/email', payload));
  },

  async lookup(params: { code?: string; phone?: string }): Promise<PublicAppointment[]> {
    return unwrap<PublicAppointment[]>(await api.post('/public/lookup', params));
  },

  async cancel(code: string, reason?: string): Promise<PublicAppointment> {
    return unwrap<PublicAppointment>(await api.post('/public/cancel', { code, reason }));
  },
};
