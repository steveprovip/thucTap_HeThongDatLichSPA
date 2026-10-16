import type { Slot } from '@/types';

/**
 * Slot Radar (RFC-2026-SPA-V3 · Pillar I.4 — bước 2): gom khung giờ trống theo buổi và đo ĐỘ TRỐNG THẬT của từng buổi.
 *
 * Độ trống = Σ(số thợ rảnh ở mỗi khung) / (số mốc bắt đầu khả dĩ trong buổi × số thợ rảnh nhiều nhất trong ngày).
 * "Mốc khả dĩ" = các mốc 15 phút trong buổi mà gói dịch vụ còn kịp xong trước giờ đóng cửa của chính ngày đó — nên buổi
 * tối của ngày đóng cửa 20:00 với gói 2 giờ chỉ có các mốc tới 18:00. Không biết giờ mở cửa → tính trên các khung đang có.
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
}

const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const STEP = 15;

/** Số mốc bắt đầu 15 phút trong [from, to) mà gói `duration` phút còn xong trước `close`. */
export function possibleStarts(from: number, to: number, open: number, close: number, duration: number): number {
  const first = Math.ceil(Math.max(from, open) / STEP) * STEP;
  const last = Math.min(to - STEP, close - duration);
  return last < first ? 0 : Math.floor((last - first) / STEP) + 1;
}

export function buildRadar(slots: Slot[], opts: { open?: string; close?: string; duration: number }): SessionView[] {
  const live = slots.filter((s) => s.stylistIds.length > 0);
  const maxFree = Math.max(1, ...live.map((s) => s.stylistIds.length));
  const hasHours = !!opts.open && !!opts.close;
  return SESSIONS.map((def) => {
    const inSession = live.filter((s) => toMin(s.time) >= def.from && toMin(s.time) < def.to).map((s) => ({ ...s, free: s.stylistIds.length }));
    const starts = hasHours ? possibleStarts(def.from, def.to, toMin(opts.open!), toMin(opts.close!), opts.duration) : inSession.length;
    const supply = inSession.reduce((sum, s) => sum + s.free, 0);
    const capacity = starts > 0 ? Math.min(1, supply / (starts * maxFree)) : 0;
    return {
      ...def,
      slots: inSession,
      capacity,
      range: inSession.length ? [inSession[0].time, inSession[inSession.length - 1].time] : null,
    };
  });
}

/** Nhãn độ trống cho người đọc (thanh màu đi kèm chỉ là minh hoạ). */
export function capacityLabel(capacity: number, count: number): string {
  if (!count) return 'Đã kín';
  if (capacity >= 0.6) return 'Còn nhiều chỗ';
  if (capacity >= 0.3) return 'Còn vừa chỗ';
  return 'Sắp kín';
}

/** Mức thợ rảnh của một khung (1–3 chấm) so với khung rảnh nhất trong ngày. */
export function freeLevel(free: number, maxFree: number): 1 | 2 | 3 {
  const r = free / Math.max(1, maxFree);
  return r > 2 / 3 ? 3 : r > 1 / 3 ? 2 : 1;
}
