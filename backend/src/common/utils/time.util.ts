import { DateTime, Interval } from 'luxon';

/** Toàn hệ thống dùng chung một múi giờ hiển thị. */
export const SALON_TZ = 'Asia/Ho_Chi_Minh';

/** 'yyyy-MM-dd' */
export type DateString = string;
/** 'HH:mm' hoặc 'HH:mm:ss' */
export type TimeString = string;

/** Chuyển một mốc tuyệt đối sang giờ địa phương của tiệm. */
export const toSalon = (d: Date | string): DateTime =>
  (typeof d === 'string' ? DateTime.fromISO(d) : DateTime.fromJSDate(d)).setZone(SALON_TZ);

/** Hôm nay theo giờ tiệm, dạng 'yyyy-MM-dd'. */
export const todaySalon = (now: Date = new Date()): DateString =>
  toSalon(now).toFormat('yyyy-MM-dd');

/** 'HH:mm' -> số phút kể từ 00:00. */
export const timeToMinutes = (t: TimeString): number => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};

/** Số phút kể từ 00:00 -> 'HH:mm'. */
export const minutesToTime = (mins: number): TimeString => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Ghép ngày ('yyyy-MM-dd') + giờ ('HH:mm') theo giờ tiệm thành mốc tuyệt đối. */
export const combine = (date: DateString, time: TimeString): Date => {
  const [h, m] = time.split(':').map(Number);
  return DateTime.fromISO(date, { zone: SALON_TZ })
    .set({ hour: h, minute: m, second: 0, millisecond: 0 })
    .toJSDate();
};

/** Ghép ngày + số phút kể từ 00:00 thành mốc tuyệt đối. */
export const combineMinutes = (date: DateString, minutes: number): Date =>
  combine(date, minutesToTime(minutes));

/** 0 = Chủ nhật … 6 = Thứ bảy (đồng bộ với cột day_of_week). */
export const dayOfWeek = (date: DateString): number => {
  const wd = DateTime.fromISO(date, { zone: SALON_TZ }).weekday; // 1 = T2 … 7 = CN
  return wd === 7 ? 0 : wd;
};

export const DOW_LABELS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const addMinutes = (d: Date, minutes: number): Date =>
  new Date(d.getTime() + minutes * 60_000);

export const diffMinutes = (a: Date, b: Date): number =>
  Math.round((a.getTime() - b.getTime()) / 60_000);

/** Ranh giới ngày theo giờ tiệm, trả về mốc tuyệt đối để truy vấn timestamptz. */
export const startOfDay = (date: DateString): Date =>
  DateTime.fromISO(date, { zone: SALON_TZ }).startOf('day').toJSDate();

export const endOfDay = (date: DateString): Date =>
  DateTime.fromISO(date, { zone: SALON_TZ }).endOf('day').toJSDate();

export const addDays = (date: DateString, days: number): DateString =>
  DateTime.fromISO(date, { zone: SALON_TZ }).plus({ days }).toFormat('yyyy-MM-dd');

export const daysBetween = (from: DateString, to: DateString): number =>
  Math.round(
    Interval.fromDateTimes(
      DateTime.fromISO(from, { zone: SALON_TZ }).startOf('day'),
      DateTime.fromISO(to, { zone: SALON_TZ }).startOf('day'),
    ).length('days'),
  );

/** 'HH:mm' của một mốc tuyệt đối, theo giờ tiệm. */
export const toTimeString = (d: Date): TimeString => toSalon(d).toFormat('HH:mm');
/** 'yyyy-MM-dd' của một mốc tuyệt đối, theo giờ tiệm. */
export const toDateString = (d: Date): DateString => toSalon(d).toFormat('yyyy-MM-dd');

// ------------------------- Định dạng hiển thị tiếng Việt -------------------
/** 14:30 */
export const formatTimeVN = (d: Date): string => toSalon(d).toFormat('HH:mm');
/** 22/09/2026 */
export const formatDateVN = (d: Date): string => toSalon(d).toFormat('dd/MM/yyyy');
/** 14:30, Thứ ba 22/09/2026 */
export const formatDateTimeVN = (d: Date): string => {
  const dt = toSalon(d);
  return `${dt.toFormat('HH:mm')}, ${DOW_LABELS[dt.weekday === 7 ? 0 : dt.weekday]} ${dt.toFormat('dd/MM/yyyy')}`;
};

/** Kiểm tra chuỗi ngày hợp lệ 'yyyy-MM-dd'. */
export const isValidDateString = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: SALON_TZ }).isValid;

/** Kiểm tra chuỗi giờ hợp lệ 'HH:mm' hoặc 'HH:mm:ss'. */
export const isValidTimeString = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);

/** Cắt 'HH:mm:ss' của PostgreSQL về 'HH:mm'. */
export const trimSeconds = (t: string): TimeString => t.slice(0, 5);
