/**
 * ===========================================================================
 *  BỘ TÍNH KHUNG GIỜ TRỐNG  (S2-05)
 * ===========================================================================
 *  Hàm THUẦN, không phụ thuộc cơ sở dữ liệu hay múi giờ, để viết kiểm thử đơn
 *  vị dễ dàng (rủi ro #3 trong kế hoạch sprint). Mọi mốc thời gian trong tệp
 *  này là SỐ PHÚT kể từ 00:00 của ngày đang xét, theo giờ tiệm.
 *
 *  Quy tắc nghiệp vụ được cài đặt ở đây:
 *   1. Khung giờ đề xuất cách nhau 15 phút, canh theo lưới đồng hồ (…09:00,
 *      09:15, 09:30…), không canh theo giờ bắt đầu ca.
 *   2. Chỉ nhận khung giờ mà thợ rảnh LIÊN TỤC đúng bằng tổng thời lượng các
 *      dịch vụ đã chọn.
 *   3. Khung giờ phải nằm TRỌN trong ca làm và trong giờ mở cửa hôm đó,
 *      không đè lên giờ nghỉ giữa ca.
 *   4. Loại bỏ khung giờ trùng lịch hẹn đã có, trùng ngày nghỉ của tiệm hoặc
 *      ngày nghỉ riêng của thợ.
 *   5. Không nhận khung giờ trong quá khứ và khung giờ cách hiện tại < 60 phút
 *      (tham số earliestStartMinutes do tầng gọi truyền vào).
 * ===========================================================================
 */

/** Khoảng thời gian nửa mở [start, end) tính bằng phút kể từ 00:00. */
export interface Interval {
  start: number;
  end: number;
}

export interface ShiftInput {
  /** 'HH:mm' */
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}

export interface TimeOffInput {
  /** null cả hai => nghỉ CẢ NGÀY */
  startTime?: string | null;
  endTime?: string | null;
}

export interface SlotCalcInput {
  /** Giờ mở / đóng cửa của tiệm hôm đó, 'HH:mm'. */
  salonOpen: string;
  salonClose: string;
  /** Tiệm đóng cửa (ngày nghỉ hoặc thứ không hoạt động). */
  salonClosed?: boolean;
  /** Các ca làm của thợ trong ngày. */
  shifts: ShiftInput[];
  /** Ngày nghỉ riêng của thợ trong ngày đó. */
  timeOff?: TimeOffInput[];
  /** Các lịch hẹn đang giữ chỗ của thợ, theo phút. */
  busy: Interval[];
  /** Tổng thời lượng cần liên tục (phút). */
  totalDuration: number;
  /** Bước nhảy giữa hai khung giờ đề xuất (mặc định 15). */
  stepMinutes?: number;
  /** Không đề xuất khung giờ bắt đầu trước mốc này (phút kể từ 00:00). */
  earliestStartMinutes?: number;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/** 'HH:mm' | 'HH:mm:ss' -> số phút kể từ 00:00. Ném lỗi nếu sai định dạng. */
export const toMinutes = (time: string): number => {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Giờ không hợp lệ: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Số phút kể từ 00:00 -> 'HH:mm'. */
export const toHHmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Giao hai khoảng, trả về null nếu không giao nhau. */
export const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
};

/** Gộp các khoảng chồng lấn / liền kề và sắp xếp tăng dần. */
export const mergeIntervals = (intervals: Interval[]): Interval[] => {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
};

/** Trừ tập khoảng `blocks` ra khỏi tập khoảng `base`. */
export const subtractIntervals = (base: Interval[], blocks: Interval[]): Interval[] => {
  const merged = mergeIntervals(blocks);
  let result = base.filter((i) => i.end > i.start).map((i) => ({ ...i }));

  for (const block of merged) {
    const next: Interval[] = [];
    for (const cur of result) {
      if (block.end <= cur.start || block.start >= cur.end) {
        next.push(cur);
        continue;
      }
      if (block.start > cur.start) next.push({ start: cur.start, end: block.start });
      if (block.end < cur.end) next.push({ start: block.end, end: cur.end });
    }
    result = next;
  }
  return mergeIntervals(result);
};

/**
 * Tính các khoảng RẢNH LIÊN TỤC của một thợ trong một ngày.
 * Đây là bước 1 của bộ tính khung giờ; tách riêng để kiểm thử độc lập.
 */
export const computeFreeIntervals = (input: SlotCalcInput): Interval[] => {
  if (input.salonClosed) return [];
  if (!input.shifts || input.shifts.length === 0) return [];

  const salon: Interval = { start: toMinutes(input.salonOpen), end: toMinutes(input.salonClose) };
  if (salon.end <= salon.start) return [];

  // Nghỉ cả ngày => không còn khoảng rảnh nào
  const timeOff = input.timeOff ?? [];
  if (timeOff.some((t) => !t.startTime || !t.endTime)) return [];

  // 1. Ca làm, cắt theo giờ mở cửa
  let work: Interval[] = [];
  for (const shift of input.shifts) {
    const clipped = intersect(
      { start: toMinutes(shift.startTime), end: toMinutes(shift.endTime) },
      salon,
    );
    if (clipped) work.push(clipped);
  }
  work = mergeIntervals(work);
  if (work.length === 0) return [];

  // 2. Trừ nghỉ giữa ca
  const breaks: Interval[] = input.shifts
    .filter((s) => s.breakStart && s.breakEnd)
    .map((s) => ({ start: toMinutes(s.breakStart as string), end: toMinutes(s.breakEnd as string) }));

  // 3. Trừ nghỉ riêng theo khoảng giờ
  const offs: Interval[] = timeOff
    .filter((t) => t.startTime && t.endTime)
    .map((t) => ({ start: toMinutes(t.startTime as string), end: toMinutes(t.endTime as string) }));

  // 4. Trừ các lịch hẹn đang giữ chỗ
  const busy = (input.busy ?? []).filter((b) => b.end > b.start);

  return subtractIntervals(work, [...breaks, ...offs, ...busy]);
};

/**
 * Tính danh sách khung giờ bắt đầu khả dụng cho tổng thời lượng yêu cầu.
 * @returns mảng 'HH:mm' đã sắp xếp tăng dần, không trùng lặp.
 */
export const computeAvailableSlots = (input: SlotCalcInput): string[] => {
  const duration = input.totalDuration;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const step = input.stepMinutes && input.stepMinutes > 0 ? input.stepMinutes : 15;
  const earliest = input.earliestStartMinutes ?? Number.NEGATIVE_INFINITY;
  const free = computeFreeIntervals(input);

  const slots: number[] = [];
  for (const interval of free) {
    if (interval.end - interval.start < duration) continue;
    // Canh theo lưới đồng hồ: 09:00, 09:15, 09:30…
    let start = Math.ceil(interval.start / step) * step;
    if (start < interval.start) start += step;
    for (; start + duration <= interval.end; start += step) {
      if (start < earliest) continue;
      slots.push(start);
    }
  }

  return Array.from(new Set(slots)).sort((a, b) => a - b).map(toHHmm);
};

/** Khoảng [start, start+duration) có nằm trọn trong các khoảng rảnh không. */
export const isSlotAvailable = (input: SlotCalcInput, startTime: string): boolean => {
  const start = toMinutes(startTime);
  const end = start + input.totalDuration;
  if (input.earliestStartMinutes !== undefined && start < input.earliestStartMinutes) return false;
  return computeFreeIntervals(input).some((i) => i.start <= start && end <= i.end);
};

/** Tổng thời lượng của danh sách dịch vụ (S2-04). */
export const sumDuration = (services: { durationMinutes: number }[]): number =>
  services.reduce((sum, s) => sum + s.durationMinutes, 0);

/** Độ dài ca dài nhất trong tập ca — dùng để cảnh báo nên tách thành 2 lần hẹn (S2-04). */
export const longestShiftLength = (shifts: ShiftInput[]): number => {
  let max = 0;
  for (const s of shifts) {
    const total = toMinutes(s.endTime) - toMinutes(s.startTime);
    const brk = s.breakStart && s.breakEnd ? toMinutes(s.breakEnd) - toMinutes(s.breakStart) : 0;
    max = Math.max(max, total - brk);
  }
  return max;
};
