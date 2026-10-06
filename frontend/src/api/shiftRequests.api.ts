import { api, unwrap } from './client';
import type { ShiftRequest, ShiftRequestItem, ShiftRequestStatus } from '@/types';

export interface ApproveWarning { warning: string; affected: number; codes: string[]; requiresForce: true }

/** Mentor Sprint 2 · mục 6 — đăng ký ca (thợ) và duyệt (quản lý). */
export const shiftRequestsApi = {
  async mine(params: { from?: string; to?: string } = {}): Promise<ShiftRequest[]> {
    return unwrap<ShiftRequest[]>(await api.get('/shift-requests/mine', { params }));
  },
  async submit(items: ShiftRequestItem[]): Promise<ShiftRequest[]> {
    return unwrap<ShiftRequest[]>(await api.post('/shift-requests', { items }));
  },
  async cancel(id: string): Promise<void> {
    await api.delete(`/shift-requests/${id}`);
  },
  async list(params: { status?: ShiftRequestStatus; from?: string; to?: string; stylistId?: string } = {}): Promise<ShiftRequest[]> {
    return unwrap<ShiftRequest[]>(await api.get('/shift-requests', { params }));
  },
  async approve(id: string, payload: { startTime?: string; endTime?: string; note?: string; force?: boolean } = {}): Promise<ShiftRequest | ApproveWarning> {
    return unwrap<ShiftRequest | ApproveWarning>(await api.post(`/shift-requests/${id}/approve`, payload));
  },
  async approveMany(ids: string[]): Promise<{ approved: string[]; failed: { id: string; message: string }[] }> {
    return unwrap(await api.post('/shift-requests/approve-batch', { ids }));
  },
  async reject(id: string, note?: string): Promise<ShiftRequest> {
    return unwrap<ShiftRequest>(await api.post(`/shift-requests/${id}/reject`, { note }));
  },
};
