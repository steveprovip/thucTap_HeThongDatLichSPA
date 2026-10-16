/** Giờ hiện tại theo giờ tiệm (Asia/Ho_Chi_Minh), không phụ thuộc múi giờ máy khách. */
export function salonNow(now: Date = new Date()): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dow, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

export interface OpeningDay { dayOfWeek: number; dayLabel: string; isClosed: boolean; openTime: string; closeTime: string }
export type OpenState =
  | { kind: 'open'; closeTime: string }
  | { kind: 'later-today'; openTime: string }
  | { kind: 'closed'; next: { dayLabel: string; openTime: string } | null };

const mins = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Tiệm đang mở hay không, theo GIỜ MỞ CỬA THẬT (API salon-info) — thay cho huy hiệu "Đang nhận lịch" luôn sáng.
 * Đã đóng cửa hôm nay → ngày mở cửa kế tiếp. Không tính ngày nghỉ lễ (trang đặt lịch vẫn chặn đúng ngày nghỉ).
 */
export function openState(hours: OpeningDay[], now: { dow: number; minutes: number }): OpenState {
  const today = hours.find((h) => h.dayOfWeek === now.dow);
  if (today && !today.isClosed) {
    if (now.minutes < mins(today.openTime)) return { kind: 'later-today', openTime: today.openTime.slice(0, 5) };
    if (now.minutes < mins(today.closeTime)) return { kind: 'open', closeTime: today.closeTime.slice(0, 5) };
  }
  for (let i = 1; i <= 7; i += 1) {
    const d = hours.find((h) => h.dayOfWeek === (now.dow + i) % 7);
    if (d && !d.isClosed) return { kind: 'closed', next: { dayLabel: i === 1 ? 'ngày mai' : d.dayLabel, openTime: d.openTime.slice(0, 5) } };
  }
  return { kind: 'closed', next: null };
}
