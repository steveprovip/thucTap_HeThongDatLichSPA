import { api, unwrap } from './client';
import type {
  Availability, BookingResult, PublicAppointment, PublicCatalogGroup, PublicStylist, Quote,
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
}

export const publicApi = {
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

  async createBooking(payload: CreateBookingPayload): Promise<BookingResult> {
    return unwrap<BookingResult>(await api.post('/public/bookings', payload));
  },

  async lookup(params: { code?: string; phone?: string }): Promise<PublicAppointment[]> {
    return unwrap<PublicAppointment[]>(await api.post('/public/lookup', params));
  },

  async cancel(code: string, reason?: string): Promise<PublicAppointment> {
    return unwrap<PublicAppointment>(await api.post('/public/cancel', { code, reason }));
  },
};
