import { api, unwrap } from './client';
import type { ServiceCategory, ServiceItem } from '@/types';

export interface ServicePayload {
  categoryId: string;
  name: string;
  durationMinutes: number;
  price: number;
  description?: string;
  /** TASK v4 · NV2: https://… ; '' = xoá ảnh riêng. */
  imageUrl?: string;
  isActive?: boolean;
  stylistIds?: string[];
}

export const catalogApi = {
  async categories(): Promise<ServiceCategory[]> {
    return unwrap<ServiceCategory[]>(await api.get('/service-categories'));
  },
  async createCategory(payload: { name: string; displayOrder?: number }): Promise<ServiceCategory> {
    return unwrap<ServiceCategory>(await api.post('/service-categories', payload));
  },
  async updateCategory(id: string, payload: { name?: string; displayOrder?: number }): Promise<ServiceCategory> {
    return unwrap<ServiceCategory>(await api.patch(`/service-categories/${id}`, payload));
  },
  async removeCategory(id: string): Promise<void> {
    await api.delete(`/service-categories/${id}`);
  },

  async services(params: { categoryId?: string; search?: string; isActive?: boolean } = {}): Promise<ServiceItem[]> {
    return unwrap<ServiceItem[]>(await api.get('/services', { params }));
  },
  async createService(payload: ServicePayload): Promise<ServiceItem> {
    return unwrap<ServiceItem>(await api.post('/services', payload));
  },
  async updateService(id: string, payload: Partial<ServicePayload>): Promise<ServiceItem> {
    return unwrap<ServiceItem>(await api.patch(`/services/${id}`, payload));
  },
  async removeService(id: string): Promise<void> {
    await api.delete(`/services/${id}`);
  },
};
