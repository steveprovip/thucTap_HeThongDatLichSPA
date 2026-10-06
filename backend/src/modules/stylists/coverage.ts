/**
 * ===========================================================================
 *  ĐỘ PHỦ CA LÀM (Mentor Sprint 2 · mục 9) — hàm THUẦN, đơn vị phút kể từ 00:00
 * ===========================================================================
 *  "Nên sắp xếp thợ đủ các khung giờ, đảm bảo khung giờ nào cũng có thợ."
 *  Với mỗi ngày mở cửa: đếm số thợ thực sự có mặt ở từng ô 15 phút (trong ca, ngoài giờ nghỉ giữa ca,
 *  không xin nghỉ), gom các ô có ít hơn `minStaff` thợ thành KHOẢNG TRỐNG để cảnh báo, rồi gợi ý thợ
 *  rảnh nên xếp vào — ưu tiên người có ít giờ làm nhất trong tuần để CÂN BẰNG phân bổ ca.
 * ===========================================================================
 */

export interface CoverageShift {
  stylistId: string;
  start: number;
  end: number;
  breakStart?: number | null;
  breakEnd?: number | null;
}

export interface CoverageTimeOff {
  stylistId: string;
  /** null = nghỉ cả ngày */
  start: number | null;
  end: number | null;
}

export interface CoverageGap {
  start: number;
  end: number;
  /** Số thợ ít nhất có mặt trong khoảng (0 = không ai trực). */
  minCount: number;
}

export interface DayCoverage {
  openMinutes: number;
  coveredMinutes: number;
  /** Tỉ lệ thời gian mở cửa có đủ `minStaff` thợ (0..100). */
  coveragePercent: number;
  gaps: CoverageGap[];
  /** Số thợ có mặt theo từng giờ tròn trong giờ mở cửa: [{ hour: 9, count: 3 }, …] (lấy ô ít người nhất trong giờ). */
  hourly: { hour: number; count: number }[];
  peakCount: number;
}

const present = (minute: number, shifts: CoverageShift[], offs: CoverageTimeOff[]): number => {
  const ids = new Set<string>();
  for (const s of shifts) {
    if (minute < s.start || minute >= s.end) continue;
    if (s.breakStart != null && s.breakEnd != null && minute >= s.breakStart && minute < s.breakEnd) continue;
    const off = offs.some((o) => o.stylistId === s.stylistId
      && (o.start === null || o.end === null || (minute >= o.start && minute < o.end)));
    if (!off) ids.add(s.stylistId);
  }
  return ids.size;
};

export function computeDayCoverage(params: {
  open: number;
  close: number;
  shifts: CoverageShift[];
  timeOff?: CoverageTimeOff[];
  minStaff?: number;
  step?: number;
}): DayCoverage {
  const { open, close, shifts } = params;
  const offs = params.timeOff ?? [];
  const minStaff = Math.max(1, params.minStaff ?? 1);
  const step = params.step ?? 15;
  const gaps: CoverageGap[] = [];
  let covered = 0;
  let peak = 0;
  const hourMin = new Map<number, number>();
  for (let m = open; m < close; m += step) {
    const n = present(m, shifts, offs);
    peak = Math.max(peak, n);
    const h = Math.floor(m / 60);
    hourMin.set(h, Math.min(hourMin.get(h) ?? Number.POSITIVE_INFINITY, n));
    const slotEnd = Math.min(m + step, close);
    if (n >= minStaff) {
      covered += slotEnd - m;
      continue;
    }
    const last = gaps[gaps.length - 1];
    if (last && last.end === m) {
      last.end = slotEnd;
      last.minCount = Math.min(last.minCount, n);
    } else {
      gaps.push({ start: m, end: slotEnd, minCount: n });
    }
  }
  const openMinutes = Math.max(0, close - open);
  return {
    openMinutes,
    coveredMinutes: covered,
    coveragePercent: openMinutes ? Math.round((covered / openMinutes) * 100) : 100,
    gaps,
    hourly: Array.from(hourMin.entries()).sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
    peakCount: peak,
  };
}

/**
 * Thợ có thể xếp thêm vào khoảng trống: không có ca chồng lên khoảng đó, không xin nghỉ trùng giờ.
 * Sắp xếp theo tổng phút làm trong tuần TĂNG DẦN (ai ít ca hơn được gợi ý trước), rồi theo tên.
 */
export function rankGapCandidates(params: {
  gap: { start: number; end: number };
  stylists: { id: string; fullName: string }[];
  shiftsToday: CoverageShift[];
  timeOffToday: CoverageTimeOff[];
  weekMinutes: Map<string, number>;
  limit?: number;
}): { stylistId: string; fullName: string; weekMinutes: number }[] {
  const { gap } = params;
  return params.stylists
    .filter((s) => !params.shiftsToday.some((sh) => sh.stylistId === s.id && sh.start < gap.end && gap.start < sh.end))
    .filter((s) => !params.timeOffToday.some((o) => o.stylistId === s.id
      && (o.start === null || o.end === null || (o.start < gap.end && gap.start < o.end))))
    .map((s) => ({ stylistId: s.id, fullName: s.fullName, weekMinutes: params.weekMinutes.get(s.id) ?? 0 }))
    .sort((a, b) => a.weekMinutes - b.weekMinutes || a.fullName.localeCompare(b.fullName, 'vi'))
    .slice(0, params.limit ?? 3);
}
