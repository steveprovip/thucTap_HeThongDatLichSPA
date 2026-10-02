/** Định dạng hiển thị theo quy ước Việt Nam, múi giờ Asia/Ho_Chi_Minh. */

export const SALON_TZ = 'Asia/Ho_Chi_Minh';

/** 250000 -> "250.000 đ" */
export const formatVnd = (value: number | string | null | undefined): string => {
  const n = Math.round(Number(value ?? 0));
  if (!Number.isFinite(n)) return '0 đ';
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;
};

export const formatVND = (amount: number): string => formatVnd(amount);

/** "250.000" khi nhập liệu (không kèm đơn vị) */
export const formatNumber = (value: number | string | null | undefined): string => {
  const n = Math.round(Number(value ?? 0));
  if (!Number.isFinite(n)) return '0';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const parseNumber = (input: string): number => {
  const n = Number(String(input).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const pad = (n: number) => String(n).padStart(2, '0');

const zoned = (value: string | Date): Date => {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d;
};

const parts = (value: string | Date) => {
  const d = zoned(value);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALON_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  return map;
};

/** "14:30" */
export const formatTime = (value: string | Date): string => {
  const p = parts(value);
  return `${p.hour}:${p.minute}`;
};

/** "22/09/2026" */
export const formatDate = (value: string | Date): string => {
  const p = parts(value);
  return `${p.day}/${p.month}/${p.year}`;
};

/** "14:30 · Thứ ba 22/09/2026" */
export const formatDateTime = (value: string | Date): string =>
  `${formatTime(value)} · ${formatWeekdayDate(value)}`;

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const weekdayLabel = (value: string | Date): string => {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: SALON_TZ, weekday: 'short' }).format(zoned(value));
  const order: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return WEEKDAYS[order[short] ?? 0];
};

/** "Thứ ba 22/09/2026" */
export const formatWeekdayDate = (value: string | Date): string =>
  `${weekdayLabel(value)} ${formatDate(value)}`;

/** Chuỗi 'yyyy-MM-dd' của hôm nay theo giờ tiệm. */
export const todayISO = (): string => {
  const p = parts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
};

/** 'yyyy-MM-dd' của một Date theo giờ tiệm. */
export const toISODate = (value: string | Date): string => {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
};

export const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Ngày đầu tuần (Thứ hai) của một ngày. */
export const startOfWeekISO = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = CN
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
};

/** "1 giờ 30 phút" */
export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
};

/** 'HH:mm' -> số phút */
export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (mins: number): string =>
  `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Bỏ dấu để tìm kiếm phía client. */
export const removeTones = (s: string): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export const matchSearch = (haystack: string, needle: string): boolean =>
  removeTones(haystack).toLowerCase().includes(removeTones(needle).toLowerCase().trim());

/** Che số điện thoại: 0981234567 -> 098***4567 */
export const maskPhone = (phone: string): string =>
  phone && phone.length >= 7 ? `${phone.slice(0, 3)}***${phone.slice(-4)}` : phone;

export const VN_PHONE_REGEX = /^0\d{9}$/;

/** Nhãn tiền rút gọn cho trục biểu đồ: 6.500.000 -> "6,5 tr", 450.000 -> "450 k". */
export const formatVndShort = (value: number): string => {
  const n = Math.round(Number(value) || 0);
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `${(Math.round(m * 10) / 10).toString().replace('.', ',')} tr`;
  }
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
};
