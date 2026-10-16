/**
 * Thêm lịch hẹn vào lịch cá nhân ngay sau khi đặt (RFC-2026-SPA-V3 · Pillar I.4 — bước 4):
 *  - Google Calendar: liên kết mẫu sự kiện (mở tab mới, khách bấm Lưu).
 *  - Tệp .ics (RFC 5545): Apple Calendar trên iPhone / Mac, Outlook, Samsung Calendar… mở trực tiếp.
 * (Thẻ Apple Wallet .pkpass cần chứng chỉ Pass Type ID của Apple ký ở máy chủ — chưa có nên dùng .ics, cùng tiện dụng.)
 * Giờ tiệm cố định UTC+7 (Việt Nam không có giờ mùa hè) → quy đổi thẳng sang UTC, không cần khối VTIMEZONE.
 */
export interface CalendarEvent {
  uid: string;
  title: string;
  /** yyyy-MM-dd theo giờ tiệm */
  date: string;
  /** HH:mm theo giờ tiệm */
  start: string;
  end: string;
  location: string;
  details: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "2026-10-17" + "09:30" (giờ Việt Nam) → "20261017T023000Z". */
export function toUtcStamp(date: string, time: string): string {
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(time.slice(0, 2)) - 7, Number(time.slice(3, 5)));
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toUtcStamp(e.date, e.start)}/${toUtcStamp(e.date, e.end)}`,
    details: e.details,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const escapeText = (v: string): string => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Gập dòng dài hơn 75 BYTE (UTF-8) theo RFC 5545 §3.1 — không cắt giữa một ký tự tiếng Việt nhiều byte. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // dòng tiếp nối bắt đầu bằng một khoảng trắng
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function icsContent(e: CalendarEvent, now: Date = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Huong Sen Salon & Spa//Dat lich//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtcStamp(e.date, e.start)}`,
    `DTEND:${toUtcStamp(e.date, e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(e.details)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** Tải tệp .ics (iPhone mở thẳng hộp "Thêm vào Lịch"). */
export function downloadIcs(e: CalendarEvent, filename: string): void {
  const url = URL.createObjectURL(new Blob([icsContent(e)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
