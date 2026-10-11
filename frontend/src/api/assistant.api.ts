import { api, unwrap } from './client';
import type { AssistantChatReply, AssistantInsights, AssistantShiftGap } from '@/types';

/** Part 5 — API nội bộ của Trợ lý AI (Chủ tiệm, Lễ tân). */
export const assistantApi = {
  async status(): Promise<{ provider: string | null; model: string | null }> {
    return unwrap(await api.get('/assistant/status'));
  },
  async insights(): Promise<AssistantInsights> {
    return unwrap<AssistantInsights>(await api.get('/assistant/insights'));
  },
  async shiftSuggestions(params: { days?: number; minStaff?: number } = {}): Promise<{ from: string; to: string; gaps: AssistantShiftGap[] }> {
    return unwrap(await api.get('/assistant/shift-suggestions', { params }));
  },
  async chat(message: string): Promise<AssistantChatReply> {
    return unwrap<AssistantChatReply>(await api.post('/assistant/chat', { message }));
  },
};
