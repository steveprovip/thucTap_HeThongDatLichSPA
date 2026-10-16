import type { Slot } from '@/types';

/**
 * Slot Radar (RFC-2026-SPA-V3 · Pillar I.4 — bước 2): gom khung giờ trống theo buổi và đo ĐỘ TRỐNG THẬT của từng buổi.
 *
 * Độ trống = Σ(số thợ rảnh ở mỗi khung) / (số mốc bắt đầu khả dĩ trong buổi × số thợ rảnh nhiều nhất trong ngày).
 * "Mốc khả dĩ" = các mốc 15 phút trong buổi mà gói dịch vụ còn kịp xong trước giờ đóng cửa của chính ngày đó — nên buổi
 * tối của ngày đóng cửa 20:00 với gói 2 giờ chỉ có các mốc tới 18:00. Không biết giờ mở cửa → tính trên các khung đang có.
 * Xem HÔM NAY (`now` = mốc sớm nhất còn đặt được — `earliestStartMinutes` máy chủ trả, đã cộng thời gian đặt trước; máy
 * chủ cũ không trả thì dùng giờ hiện tại): mốc trước đó không tính vào mẫu số, và buổi mà mọi mốc khả dĩ đều trước đó được
 * đánh dấu `past` thay vì bị coi là "đã kín". Chỉ có giờ hiện tại thì mẫu số còn gồm các mốc trong khoảng đặt trước — độ
 * trống chỉ có thể bị báo THẤP hơn thật một chút, không bao giờ cao hơn.
 */
export type SessionKey = 'morning' | 'afternoon' | 'evening';
export interface SessionDef { key: SessionKey; label: string; from: number; to: number }

export const SESSIONS: SessionDef[] = [
  { key: 'morning', label: 'Sáng', from: 0, to: 12 * 60 },
  { key: 'afternoon', label: 'Chiều', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', label: 'Tối', from: 17 * 60, to: 24 * 60 },
];

export interface SessionView extends SessionDef {
  slots: (Slot & { free: number })[];
  /** 0..1 — tỷ lệ chỗ còn trống của buổi. */
  capacity: number;
  /** Khung đầu / cuối còn trống (hiển thị "08:30 – 11:15"). */
  range: [string, string] | null;
  /** Hôm nay: mọi mốc bắt đầu khả dĩ của buổi đều trước mốc sớm nhất còn đặt được — buổi "đã qua", không phải "đã kín". */
  past: boolean;
}

const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const STEP = 15;

/** Số mốc bắt đầu 15 phút trong [from, to) mà gói `duration` phút còn xong trước `close`. */
export function possibleStarts(from: number, to: number, open: number, close: number, duration: number): number {
  const first = Math.ceil(Math.max(from, open) / STEP) * STEP;
  const last = Math.min(to - STEP, close - duration);
  return last < first ? 0 : Math.floor((last - first) / STEP) + 1;
}

/** `now` (phút kể từ 00:00 theo giờ tiệm, mốc sớm nhất còn đặt được) chỉ truyền khi xem lịch HÔM NAY; ngày khác để trống. */
export function buildRadar(slots: Slot[], opts: { open?: string; close?: string; duration: number; now?: number }): SessionView[] {
  const live = slots.filter((s) => s.stylistIds.length > 0);
  const maxFree = Math.max(1, ...live.map((s) => s.stylistIds.length));
  const hasHours = !!opts.open && !!opts.close;
  const { now } = opts;
  // Hôm nay chỉ bỏ các mốc trước `now` (làm tròn lên lưới 15 phút). KHÔNG lấy khung trống sớm nhất làm cận dưới:
  // các mốc đầu buổi có thể vắng vì đã kín chứ không phải vì đã qua — buổi chỉ còn 1 mốc sẽ bị báo "còn nhiều chỗ".
  const notBefore = now === undefined ? Number.NEGATIVE_INFINITY : Math.ceil(now / STEP) * STEP;
  return SESSIONS.map((def) => {
    const inSession = live.filter((s) => toMin(s.time) >= def.from && toMin(s.time) < def.to).map((s) => ({ ...s, free: s.stylistIds.length }));
    const starts = hasHours
      ? possibleStarts(def.from, def.to, Math.max(toMin(opts.open!), notBefore), toMin(opts.close!), opts.duration)
      : inSession.length;
    const supply = inSession.reduce((sum, s) => sum + s.free, 0);
    const capacity = starts > 0 ? Math.min(1, supply / (starts * maxFree)) : 0;
    // Mốc bắt đầu muộn nhất của buổi (gói còn kịp xong trước giờ đóng cửa) đã trước `now` → buổi đã qua
    const lastStart = hasHours ? Math.min(def.to - STEP, toMin(opts.close!) - opts.duration) : def.to - STEP;
    return {
      ...def,
      slots: inSession,
      capacity,
      range: inSession.length ? [inSession[0].time, inSession[inSession.length - 1].time] : null,
      past: now !== undefined && inSession.length === 0 && lastStart < now,
    };
  });
}

/** Nhãn độ trống cho người đọc (thanh màu đi kèm chỉ là minh hoạ). */
export function capacityLabel(capacity: number, count: number, past = false): string {
  return TONE_LABEL[radarTone(capacity, count, past)];
}

/** Mức độ trống của buổi — quyết định màu thanh radar: xanh (còn chỗ) · hổ phách (sắp kín) · đỏ (đã kín) · xám (đã qua). */
export type RadarTone = 'many' | 'some' | 'few' | 'full' | 'past';
const TONE_LABEL: Record<RadarTone, string> = {
  many: 'Còn nhiều chỗ', some: 'Còn vừa chỗ', few: 'Sắp kín', full: 'Đã kín', past: 'Đã qua',
};
export function radarTone(capacity: number, count: number, past = false): RadarTone {
  if (past) return 'past';
  if (!count) return 'full';
  if (capacity >= 0.6) return 'many';
  if (capacity >= 0.3) return 'some';
  return 'few';
}

/** Mức thợ rảnh của một khung (1–3 chấm) so với khung rảnh nhất trong ngày. */
export function freeLevel(free: number, maxFree: number): 1 | 2 | 3 {
  const r = free / Math.max(1, maxFree);
  return r > 2 / 3 ? 3 : r > 1 / 3 ? 2 : 1;
}
