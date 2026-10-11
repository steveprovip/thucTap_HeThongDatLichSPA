import { api, unwrap } from './client';
import type {
  AssistantChatReply, AssistantInsights, AssistantShiftGap, AssistantStatus, AssistantToday, ChatTurn, CustomerAssistantReply,
} from '@/types';

/** Part 5 — API nội bộ của Trợ lý AI (Chủ tiệm, Lễ tân). */
export const assistantApi = {
  /** TASK v4 · NV5: đang dùng AI local (Spark-X2.5-4B) hay Smart Rule Assistant. */
  async status(): Promise<AssistantStatus> {
    return unwrap<AssistantStatus>(await api.get('/assistant/status'));
  },
  /** TASK v4 · NV1: số liệu hôm nay cho chế độ "Phân tích & số liệu". */
  async today(): Promise<AssistantToday> {
    return unwrap<AssistantToday>(await api.get('/assistant/today'));
  },
  async insights(): Promise<AssistantInsights> {
    return unwrap<AssistantInsights>(await api.get('/assistant/insights'));
  },
  async shiftSuggestions(params: { days?: number; minStaff?: number } = {}): Promise<{ from: string; to: string; gaps: AssistantShiftGap[] }> {
    return unwrap(await api.get('/assistant/shift-suggestions', { params }));
  },
  async chat(message: string, history: ChatTurn[] = []): Promise<AssistantChatReply> {
    return unwrap<AssistantChatReply>(await api.post('/assistant/chat', { message, history: history.slice(-6) }));
  },
  /** TASK v3 · NV1: AI tư vấn khách trên trang công khai (không cần đăng nhập). */
  async customerChat(message: string, history: ChatTurn[] = []): Promise<CustomerAssistantReply> {
    return unwrap<CustomerAssistantReply>(await api.post('/public/assistant/chat', { message, history: history.slice(-6) }));
  },
};
