/**
 * ===========================================================================
 *  ÂM LỊCH VIỆT NAM (múi giờ +7) — hàm THUẦN, không phụ thuộc CSDL / thư viện ngoài
 * ===========================================================================
 *  Cài đặt thuật toán thiên văn của Hồ Ngọc Đức ("Âm lịch Việt Nam", dựa trên Jean Meeus,
 *  Astronomical Algorithms): tính ngày Sóc (trăng mới) và Trung khí theo kinh độ Mặt Trời,
 *  từ đó suy ra tháng 11 âm (chứa Đông chí) và tháng nhuận.
 *  Dùng để sinh tự động các ngày lễ theo âm lịch (Tết Nguyên Đán, Giỗ Tổ Hùng Vương).
 *  Khác Trung Quốc ở múi giờ (+7 thay vì +8) nên một số năm Tết lệch nhau 1 tháng (vd. 1985).
 * ===========================================================================
 */

const PI = Math.PI;
export const VN_TIMEZONE_OFFSET = 7;

/** Số ngày Julius của một ngày dương lịch. */
export const jdFromDate = (dd: number, mm: number, yy: number): number => {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jd;
};

/** Số ngày Julius -> [ngày, tháng, năm] dương lịch. */
export const jdToDate = (jd: number): [number, number, number] => {
  let a: number;
  let b: number;
  let c: number;
  if (jd > 2299160) {
    a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = b * 100 + d - 4800 + Math.floor(m / 10);
  return [day, month, year];
};

/** Ngày Julius (theo giờ địa phương) của lần Sóc thứ k kể từ 1/1/1900. */
export const getNewMoonDay = (k: number, timeZone = VN_TIMEZONE_OFFSET): number => {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  const JdNew = Jd1 + C1 - deltat;
  return Math.floor(JdNew + 0.5 + timeZone / 24);
};

/** Cung hoàng đạo (0..11) của Mặt Trời lúc 00:00 giờ địa phương ngày jdn — dùng để tìm Trung khí. */
export const getSunLongitude = (jdn: number, timeZone = VN_TIMEZONE_OFFSET): number => {
  const T = (jdn - 2451545.5 - timeZone / 24) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * Math.floor(L / (PI * 2));
  return Math.floor((L / PI) * 6);
};

/** Ngày bắt đầu tháng 11 âm lịch (tháng chứa Đông chí) của năm dương lịch yy. */
export const getLunarMonth11 = (yy: number, timeZone = VN_TIMEZONE_OFFSET): number => {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  if (getSunLongitude(nm, timeZone) >= 9) nm = getNewMoonDay(k - 1, timeZone);
  return nm;
};

/** Vị trí tháng nhuận tính từ tháng 11 âm năm trước (a11). */
export const getLeapMonthOffset = (a11: number, timeZone = VN_TIMEZONE_OFFSET): number => {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
};

/** Âm lịch -> dương lịch. Trả null nếu ngày âm không tồn tại (vd. tháng nhuận không có trong năm đó). */
export const lunarToSolar = (
  lunarDay: number, lunarMonth: number, lunarYear: number, lunarLeap = false, timeZone = VN_TIMEZONE_OFFSET,
): { day: number; month: number; year: number } | null => {
  let a11: number;
  let b11: number;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone);
    b11 = getLunarMonth11(lunarYear, timeZone);
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone);
    b11 = getLunarMonth11(lunarYear + 1, timeZone);
  }
  const k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) return null;
    if (lunarLeap || off >= leapOff) off += 1;
  } else if (lunarLeap) {
    return null;
  }
  const monthStart = getNewMoonDay(k + off, timeZone);
  const [day, month, year] = jdToDate(monthStart + lunarDay - 1);
  return { day, month, year };
};

/** 'yyyy-MM-dd' của một ngày âm lịch (tháng thường, không nhuận). */
export const lunarToSolarIso = (lunarDay: number, lunarMonth: number, lunarYear: number): string => {
  const r = lunarToSolar(lunarDay, lunarMonth, lunarYear);
  if (!r) throw new Error(`Ngày âm lịch không tồn tại: ${lunarDay}/${lunarMonth}/${lunarYear}`);
  return `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
};
