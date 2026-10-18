import type { AppointmentStatus } from '@/types';
import { NO_SHOW_AFTER_MIN } from './opsHelpers';

/**
 * Ghi chú test 13/10 — kéo thả kiểu Jira. Luật THUẦN (không gọi API) để bảng Kanban và Lịch ngày dùng chung và kiểm thử được.
 * Mỗi bước kéo ứng với đúng API trạng thái đã có ở máy chủ (máy chủ vẫn kiểm tra lại: cửa sổ check-in ±60′, không đến
 * sau 30′, hoàn tác trong 15′…), nên kéo thả không mở ra đường tắt nào mà nút bấm không có.
 */
export type BoardAction = 'confirm' | 'reject' | 'checkIn' | 'start' | 'complete' | 'noShow' | 'undoNoShow' | 'cancel';

export type BoardMove =
  | { ok: true; actions: BoardAction[]; needsReason: boolean; label: string }
  | { ok: false; reason: string };

/** Thứ tự cột trên bảng (Kanban). */
export const BOARD_COLUMNS: AppointmentStatus[] = ['pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'no_show', 'cancelled'];

const MOVES: Partial<Record<`${AppointmentStatus}>${AppointmentStatus}`, { actions: BoardAction[]; needsReason?: boolean; label: string }>> = {
  'pending>confirmed': { actions: ['confirm'], label: 'Xác nhận lịch' },
  'pending>arrived': { actions: ['confirm', 'checkIn'], label: 'Xác nhận và check-in' },
  'pending>cancelled': { actions: ['reject'], needsReason: true, label: 'Từ chối lịch' },
  'confirmed>arrived': { actions: ['checkIn'], label: 'Check-in khách' },
  'confirmed>no_show': { actions: ['noShow'], label: 'Đánh dấu không đến' },
  'confirmed>cancelled': { actions: ['cancel'], needsReason: true, label: 'Huỷ lịch' },
  'arrived>in_progress': { actions: ['start'], label: 'Bắt đầu làm' },
  'arrived>cancelled': { actions: ['cancel'], needsReason: true, label: 'Huỷ lịch' },
  'in_progress>completed': { actions: ['complete'], label: 'Hoàn tất' },
  'no_show>confirmed': { actions: ['undoNoShow'], label: 'Hoàn tác "không đến"' },
};

/**
 * Kéo một lịch từ cột `from` sang cột `to`: làm gì, hay vì sao không được.
 * `minutesSinceStart` (tuỳ chọn) = số phút đã qua giờ hẹn → cột "Không đến" chỉ sáng sau 30′ (QA Sprint 3 · mục 3),
 * khỏi kéo vào rồi mới bị máy chủ trả lỗi.
 */
export function boardMove(from: AppointmentStatus, to: AppointmentStatus, minutesSinceStart?: number): BoardMove | null {
  if (from === to) return null;
  const move = MOVES[`${from}>${to}`];
  if (move && move.actions.includes('noShow') && minutesSinceStart !== undefined && minutesSinceStart < NO_SHOW_AFTER_MIN) {
    return { ok: false, reason: `Chỉ báo "Không đến" sau giờ hẹn ${NO_SHOW_AFTER_MIN} phút (còn ${NO_SHOW_AFTER_MIN - Math.max(0, Math.floor(minutesSinceStart))} phút nữa).` };
  }
  if (move) return { ok: true, actions: move.actions, needsReason: !!move.needsReason, label: move.label };
  if (from === 'completed') return { ok: false, reason: 'Lịch đã hoàn tất — muốn sửa tiền thì mở phiếu tính tiền và lập phiếu điều chỉnh.' };
  if (from === 'cancelled') return { ok: false, reason: 'Lịch đã huỷ không mở lại được — hãy tạo lịch mới cho khách.' };
  if (to === 'in_progress') return { ok: false, reason: 'Khách cần ở cột "Đã đến" (check-in) trước khi bắt đầu làm.' };
  if (to === 'completed') return { ok: false, reason: 'Chỉ lịch "Đang làm" mới chuyển sang Hoàn tất được.' };
  if (to === 'no_show') return { ok: false, reason: 'Chỉ lịch đã xác nhận (khách chưa đến) mới đánh dấu không đến được.' };
  if (from === 'in_progress' && to === 'cancelled') return { ok: false, reason: 'Lịch đang làm không huỷ được — hãy hoàn tất rồi điều chỉnh trên phiếu.' };
  if (from === 'no_show') return { ok: false, reason: 'Lịch "không đến" chỉ hoàn tác về "Đã xác nhận" (trong 15 phút).' };
  return { ok: false, reason: 'Không chuyển ngược trạng thái được.' };
}

/** Lịch nào kéo được trên Lịch ngày (đổi thợ / dời giờ) — máy chủ chỉ cho dời lịch chưa bắt đầu làm. */
export const TIMELINE_DRAGGABLE: AppointmentStatus[] = ['pending', 'confirmed', 'arrived'];

/**
 * Giờ bắt đầu mới (phút trong ngày) khi kéo khối lịch theo trục dọc `deltaY` px: bắt bước `step` phút,
 * không ra ngoài giờ mở cửa (kết thúc lịch không vượt giờ đóng cửa).
 */
export function snapStart(startMin: number, deltaY: number, slotH: number, step: number, openMin: number, closeMin: number, duration: number): number {
  const moved = startMin + Math.round(deltaY / slotH) * step;
  return Math.min(Math.max(moved, openMin), Math.max(openMin, closeMin - duration));
}

export const minutesToHHmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
