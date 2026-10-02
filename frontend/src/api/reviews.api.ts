import { api, unwrap } from './client';
import type { ReviewForm, StylistRating } from '@/types';

export const reviewsApi = {
  async byToken(token: string): Promise<ReviewForm> {
    return unwrap<ReviewForm>(await api.get(`/reviews/token/${token}`));
  },
  async submit(token: string, rating: number, comment?: string): Promise<ReviewForm> {
    return unwrap<ReviewForm>(await api.post(`/reviews/token/${token}`, { rating, comment }));
  },
  async byCode(code: string): Promise<ReviewForm> {
    return unwrap<ReviewForm>(await api.get('/reviews/by-code', { params: { code } }));
  },
  async stylistRatings(): Promise<StylistRating[]> {
    return unwrap<StylistRating[]>(await api.get('/reviews/stylist-ratings'));
  },
};
