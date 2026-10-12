import { api, unwrap } from './client';
import type {
  AssistantChatReply, AssistantInsights, AssistantShiftGap, AssistantStatus, AssistantToday, ChatTurn, CustomerAssistantReply, CustomerDialogState,
  AssistantImprovementReport, AssistantLearnedPhrase,
} from '@/types';

/** Part 5 — API nội bộ của Trợ lý AI (Chủ tiệm, Lễ tân). */
export const assistantApi = {
  /** TASK v4 · NV5: đang dùng AI local (Spark-X2.5-4B) hay Smart Rule Assistant. */
  async status(): Promise<AssistantStatus> {
    return unwrap<AssistantStatus>(await api.get('/assistant/status'));
  },
  /** QA 12/10: bật AI local một chạm (máy chủ tự chạy model_AI_local\chay_ai_local.cmd ở chế độ ẩn). */
  async startLocal(): Promise<{ started: boolean; starting: boolean; message: string }> {
    return unwrap(await api.post('/assistant/local/start'));
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
  async customerChat(message: string, history: ChatTurn[] = [], state?: CustomerDialogState): Promise<CustomerAssistantReply> {
    return unwrap<CustomerAssistantReply>(await api.post('/public/assistant/chat', { message, history: history.slice(-6), ...(state ? { state } : {}) }));
  },
  /** Khách bấm 👍 / 👎 dưới câu trả lời. */
  async customerFeedback(question: string, intent: string, helpful: boolean): Promise<void> {
    await api.post('/public/assistant/feedback', { question: question.slice(0, 500), intent: intent.slice(0, 40), helpful });
  },
  /** Vòng tự cải tiến: câu chưa trả lời được + đề xuất học chờ duyệt + phản hồi của khách. */
  async improvement(): Promise<AssistantImprovementReport> {
    return unwrap<AssistantImprovementReport>(await api.get('/assistant/improvement'));
  },
  async learning(status: 'suggested' | 'approved' | 'rejected'): Promise<AssistantLearnedPhrase[]> {
    return unwrap<AssistantLearnedPhrase[]>(await api.get('/assistant/learning', { params: { status } }));
  },
  async learningUpdate(id: string, patch: { status?: 'approved' | 'rejected' | 'suggested'; rewrite?: string }): Promise<AssistantLearnedPhrase> {
    return unwrap<AssistantLearnedPhrase>(await api.patch(`/assistant/learning/${id}`, patch));
  },
  async learningAdd(kind: 'question' | 'alias' | 'answer', phrase: string, rewrite: string): Promise<AssistantLearnedPhrase> {
    return unwrap<AssistantLearnedPhrase>(await api.post('/assistant/learning', { kind, phrase, rewrite }));
  },
};
