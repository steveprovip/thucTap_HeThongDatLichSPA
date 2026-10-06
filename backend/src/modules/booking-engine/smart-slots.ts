/**
 * ===========================================================================
 *  TRỢ LÝ AI XẾP LỊCH (Mentor Sprint 2 · mục 4) — hàm THUẦN, đơn vị phút kể từ 00:00
 * ===========================================================================
 *  Lễ tân không phải mở lịch ngày / bảng ca ra đối chiếu nữa: trợ lý duyệt MỌI khung giờ hợp lệ của mọi thợ
 *  trong vài ngày tới (đã qua bộ tính khung giờ — ca, nghỉ giữa ca, ngày nghỉ, lịch hẹn, giữ chỗ) rồi CHẤM ĐIỂM
 *  theo các tiêu chí vận hành của tiệm và giải thích lý do bằng tiếng Việt:
 *   1. Sớm      — khách thường muốn giờ gần nhất (trừ điểm theo ngày và theo giờ trễ so với khung sớm nhất).
 *   2. Vừa khít — ưu tiên khung nối tiếp ngay lịch / mép ca, không để lại "khoảng lẻ" < 30 phút không ai đặt được.
 *   3. Cân bằng — ưu tiên thợ đang ít phút làm trong ngày để chia đều khối lượng.
 *  Kết quả đa dạng: mỗi thợ mỗi ngày tối đa 2 gợi ý để lễ tân có nhiều lựa chọn khác nhau.
 * ===========================================================================
 */

export interface SmartSlotCandidate {
  date: string;
  /** 0 = ngày đầu của khoảng xem. */
  dayOffset: number;
  /** Phút bắt đầu. */
  start: number;
  duration: number;
  stylistId: string;
  stylistName: string;
  /** Khoảng rảnh liên tục chứa khung giờ này. */
  freeStart: number;
  freeEnd: number;
  /** Phút đã có lịch của thợ trong ngày, và lớn nhất trong các thợ cùng ngày. */
  dayLoadMinutes: number;
  maxDayLoad: number;
  minDayLoad: number;
  /** Khung sớm nhất có thể của ngày đó (mọi thợ). */
  earliestOfDay: number;
}

export interface SmartSlot {
  date: string;
  time: string;
  endTime: string;
  stylistId: string;
  stylistName: string;
  score: number;
  reasons: string[];
}

export const FRAGMENT_MINUTES = 30;

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function scoreSmartSlot(c: SmartSlotCandidate): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  // 1. Sớm
  score -= c.dayOffset * 12 + ((c.start - c.earliestOfDay) / 60) * 3;
  if (c.dayOffset === 0 && c.start === c.earliestOfDay) reasons.push('Khung sớm nhất có thể');

  // 2. Vừa khít
  const before = c.start - c.freeStart;
  const after = c.freeEnd - (c.start + c.duration);
  if (before === 0 && after === 0) {
    score += 25;
    reasons.push('Lấp kín một khoảng trống của thợ');
  } else if (before === 0) {
    score += 15;
    reasons.push('Nối tiếp ngay sau lịch / đầu ca, không để trống');
  } else if (after === 0) {
    score += 15;
    reasons.push('Kết thúc vừa khít lịch kế tiếp / cuối ca');
  }
  for (const gap of [before, after]) {
    if (gap > 0 && gap < FRAGMENT_MINUTES) {
      score -= 15;
      reasons.push(`Để lại khoảng lẻ ${gap}′ khó xếp khách khác`);
    }
  }

  // 3. Cân bằng khối lượng giữa các thợ trong ngày
  if (c.maxDayLoad > 0) {
    score += 15 * (1 - c.dayLoadMinutes / c.maxDayLoad);
    if (c.dayLoadMinutes === c.minDayLoad && c.maxDayLoad > c.minDayLoad) {
      reasons.push(c.dayLoadMinutes === 0 ? 'Thợ chưa có lịch nào trong ngày' : 'Thợ đang ít lịch nhất trong ngày');
    }
  }
  return { score: Math.round(score * 10) / 10, reasons };
}

/** Chấm điểm, sắp xếp giảm dần và giữ đa dạng (tối đa `perStylistDay` gợi ý cho mỗi thợ mỗi ngày). */
export function rankSmartSlots(candidates: SmartSlotCandidate[], limit = 6, perStylistDay = 2): SmartSlot[] {
  const scored = candidates
    .map((c) => ({ c, ...scoreSmartSlot(c) }))
    .sort((a, b) => b.score - a.score || a.c.dayOffset - b.c.dayOffset || a.c.start - b.c.start
      || a.c.stylistName.localeCompare(b.c.stylistName, 'vi'));
  const used = new Map<string, number>();
  const out: SmartSlot[] = [];
  for (const s of scored) {
    if (out.length >= limit) break;
    const key = `${s.c.stylistId}|${s.c.date}`;
    if ((used.get(key) ?? 0) >= perStylistDay) continue;
    used.set(key, (used.get(key) ?? 0) + 1);
    out.push({
      date: s.c.date,
      time: hhmm(s.c.start),
      endTime: hhmm(s.c.start + s.c.duration),
      stylistId: s.c.stylistId,
      stylistName: s.c.stylistName,
      score: s.score,
      reasons: s.reasons.length ? s.reasons : ['Khung giờ hợp lệ'],
    });
  }
  return out;
}
