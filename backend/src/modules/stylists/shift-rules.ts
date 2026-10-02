import { DOW_LABELS, dayOfWeek, timeToMinutes, trimSeconds } from '../../common/utils/time.util';

/** Một ca theo ngày (giờ 'HH:mm'); `id` có mặt khi là ca đã lưu. */
export interface ShiftRange {
  id?: string;
  workDate: string;
  startTime: string;
  endTime: string;
  note?: string | null;
}

/** Tên ca hiển thị: ghi chú do chủ tiệm đặt, không có thì suy ra theo giờ bắt đầu (QA-07). */
export const shiftLabel = (s: Pick<ShiftRange, 'startTime' | 'note'>): string => {
  const note = s.note?.trim();
  if (note) return note;
  const start = timeToMinutes(s.startTime);
  if (start < 12 * 60) return 'Ca sáng';
  return start < 17 * 60 ? 'Ca chiều' : 'Ca tối';
};

export const shiftRangeText = (s: Pick<ShiftRange, 'startTime' | 'endTime'>): string =>
  `${trimSeconds(s.startTime)}–${trimSeconds(s.endTime)}`;

/** 'Thứ hai 05/10/2026' */
export const shiftDayText = (date: string): string => {
  const [y, m, d] = date.split('-');
  return `${DOW_LABELS[dayOfWeek(date)]} ${d}/${m}/${y}`;
};

/**
 * Ca đầu tiên trong `existing` chồng lấn với `candidate` — cùng ngữ nghĩa nửa mở [start, end)
 * với ràng buộc EXCLUDE stylist_shifts_no_overlap (hai ca nối tiếp 08:00–12:00 & 12:00–17:00 hợp lệ).
 * Bỏ qua chính nó khi đang sửa (trùng id).
 */
export const findShiftOverlap = <T extends ShiftRange>(candidate: ShiftRange, existing: T[]): T | null => {
  const start = timeToMinutes(candidate.startTime);
  const end = timeToMinutes(candidate.endTime);
  return existing.find((e) =>
    e.workDate === candidate.workDate
    && !(candidate.id && e.id === candidate.id)
    && timeToMinutes(e.startTime) < end
    && start < timeToMinutes(e.endTime)) ?? null;
};
