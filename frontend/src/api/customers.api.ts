import { api, unwrap } from './client';
import type { Customer, Paginated, VisitHistoryItem } from '@/types';

export const customersApi = {
  async search(params: { q?: string; page?: number; limit?: number } = {}): Promise<Paginated<Customer>> {
    return unwrap<Paginated<Customer>>(await api.get('/customers', { params }));
  },
  async byPhone(phone: string): Promise<{ found: boolean; customer: Customer | null; history: VisitHistoryItem[] }> {
    return unwrap(await api.get(`/customers/by-phone/${phone}`));
  },
  async findOne(id: string): Promise<Customer> {
    return unwrap<Customer>(await api.get(`/customers/${id}`));
  },
  async history(id: string): Promise<VisitHistoryItem[]> {
    return unwrap<VisitHistoryItem[]>(await api.get(`/customers/${id}/history`));
  },
  async update(id: string, payload: { fullName?: string; email?: string; note?: string }): Promise<Customer> {
    return unwrap<Customer>(await api.patch(`/customers/${id}`, payload));
  },
};
