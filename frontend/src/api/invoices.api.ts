import { api, unwrap } from './client';
import type { Invoice, PaymentMethod, Voucher } from '@/types';

export interface InvoiceItemPayload {
  serviceId?: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export const invoicesApi = {
  async list(params: { from?: string; to?: string; status?: string; page?: number; limit?: number } = {}) {
    return unwrap<{ items: Invoice[]; total: number; page: number; limit: number; totalPages: number }>(
      await api.get('/invoices', { params }),
    );
  },
  async byAppointment(appointmentId: string): Promise<Invoice | null> {
    return unwrap<Invoice | null>(await api.get(`/invoices/by-appointment/${appointmentId}`));
  },
  async findOne(id: string): Promise<Invoice> {
    return unwrap<Invoice>(await api.get(`/invoices/${id}`));
  },
  async create(appointmentId: string, items?: InvoiceItemPayload[]): Promise<Invoice> {
    return unwrap<Invoice>(await api.post('/invoices', { appointmentId, items }));
  },
  async update(id: string, items: InvoiceItemPayload[], voucherCode?: string | null): Promise<Invoice> {
    return unwrap<Invoice>(await api.patch(`/invoices/${id}`, { items, voucherCode: voucherCode || undefined }));
  },
  async pay(id: string, paymentMethod: PaymentMethod, transferNote?: string): Promise<Invoice> {
    return unwrap<Invoice>(await api.patch(`/invoices/${id}/pay`, { paymentMethod, transferNote }));
  },
  async close(id: string): Promise<Invoice> {
    return unwrap<Invoice>(await api.patch(`/invoices/${id}/close`, {}));
  },
  async adjust(id: string, reason: string, items: InvoiceItemPayload[], voucherCode?: string | null): Promise<Invoice> {
    return unwrap<Invoice>(await api.post(`/invoices/${id}/adjust`, { reason, items, voucherCode: voucherCode || undefined }));
  },
  async voucherPreview(code: string, subtotal: number) {
    return unwrap<{ code: string | null; discountAmount: number; discountAmountText: string;
      total: number; totalText: string }>(
      await api.get('/invoices/voucher-preview', { params: { code, subtotal } }),
    );
  },

  async vouchers(): Promise<Voucher[]> {
    return unwrap<Voucher[]>(await api.get('/vouchers'));
  },
  async createVoucher(payload: Omit<Voucher, 'id' | 'usedCount'>): Promise<Voucher> {
    return unwrap<Voucher>(await api.post('/vouchers', payload));
  },
  async removeVoucher(id: string): Promise<void> {
    await api.delete(`/vouchers/${id}`);
  },
};
