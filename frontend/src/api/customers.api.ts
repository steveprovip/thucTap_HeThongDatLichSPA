import { api, unwrap } from './client';
import type { Customer, Paginated, VisitHistoryItem } from '@/types';
import { normalizePage } from '@/utils/opsHelpers';

export const customersApi = {
  async search(params: { q?: string; page?: number; limit?: number } = {}): Promise<Paginated<Customer>> {
    // TASK v4 · NV3: mảng (máy chủ cũ) hay trang đều chuẩn hoá về một trang an toàn
    return normalizePage<Customer>(unwrap<unknown>(await api.get('/customers', { params })), params.page ?? 1, params.limit ?? 20);
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
  async update(id: string, payload: { fullName?: string; email?: string | null; note?: string }): Promise<Customer> {
    return unwrap<Customer>(await api.patch(`/customers/${id}`, payload));
  },
  /** Chỉ Chủ tiệm. Khách đã có lịch hẹn → máy chủ ẩn danh thay vì xoá hẳn (giữ doanh thu, thống kê). */
  async remove(id: string): Promise<{ id: string; mode: 'deleted' | 'anonymized' }> {
    return unwrap(await api.delete(`/customers/${id}`));
  },
};
