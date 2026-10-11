/**
 * Hàm thuần dùng cho màn hình vận hành (lễ tân / chủ tiệm). Không import component để kiểm thử độc lập
 * (`frontend/test/ops-helpers.test.mjs`).
 */

const STATUS_VI: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  arrived: 'Đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  no_show: 'Không đến',
};

const FIELD_VI: Record<string, string> = {
  status: 'Trạng thái',
  start_at: 'Giờ hẹn',
  stylist: 'Thợ phụ trách',
  services: 'Dịch vụ',
  note: 'Ghi chú',
};

export interface ChangeLike {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * QA Sprint 3 · mục 7 — lịch sử thay đổi chỉ một ngôn ngữ, dễ đọc:
 * "status pending → confirmed" thành { label: 'Trạng thái', from: 'Chờ xác nhận', to: 'Đã xác nhận' }.
 */
export function describeAppointmentChange(c: ChangeLike): { label: string; from: string; to: string } {
  const label = FIELD_VI[c.field] ?? 'Cập nhật';
  const value = (v: string | null): string => {
    if (v === null || v === '') return '—';
    return c.field === 'status' ? STATUS_VI[v] ?? v : v;
  };
  return { label, from: value(c.oldValue), to: value(c.newValue) };
}

export type PendingSort = 'start_asc' | 'start_desc' | 'name_asc';

export interface PendingLike {
  startAt: string;
  pendingOverdue?: boolean;
  customer: { fullName: string };
}

/**
 * Phản hồi QA 11/10 — sắp xếp danh sách Chờ xác nhận: lịch quá hạn xử lý 12 giờ LUÔN nằm đầu bảng,
 * trong mỗi nhóm sắp theo lựa chọn (giờ hẹn cũ nhất / mới nhất, tên khách A–Z theo tiếng Việt).
 */
export function sortPending<T extends PendingLike>(items: readonly T[], mode: PendingSort): T[] {
  const collator = new Intl.Collator('vi', { sensitivity: 'base' });
  const cmp = (a: T, b: T): number => {
    if (mode === 'name_asc') {
      return collator.compare(a.customer.fullName, b.customer.fullName) || a.startAt.localeCompare(b.startAt);
    }
    const d = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    return mode === 'start_desc' ? -d : d;
  };
  return [...items].sort((a, b) => Number(!!b.pendingOverdue) - Number(!!a.pendingOverdue) || cmp(a, b));
}

/**
 * TASK v3 · NV2 — dãy nút số trang: luôn có trang đầu, trang cuối, trang hiện tại ± 1; khoảng bị lược hiện "…".
 * pageItems(5, 10) → [1, '…', 4, 5, 6, '…', 10].
 */
export function pageItems(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => keep.add(p));
  const pages = [...keep].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(p - pages[i - 1] === 2 ? p - 1 : '…');
    out.push(p);
  });
  return out;
}

export interface PageOf<T> { items: T[]; total: number; page: number; limit: number; totalPages: number }

/**
 * TASK v4 · NV3 — chuẩn hoá MỌI phản hồi danh sách về một trang an toàn: máy chủ mới trả { items, total, page, limit,
 * totalPages }, máy chủ cũ / chưa khởi động lại trả MẢNG (→ tự cắt trang ở trình duyệt), phản hồi rỗng / sai dạng → trang
 * trống. Màn hình không bao giờ "trắng trang" vì đọc `.items` của một mảng hay của undefined.
 */
export function normalizePage<T>(raw: unknown, page = 1, limit = 20): PageOf<T> {
  const size = Math.max(1, Math.floor(limit) || 20);
  if (Array.isArray(raw)) {
    const total = raw.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
    return { items: raw.slice((p - 1) * size, p * size) as T[], total, page: p, limit: size, totalPages };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : Array.isArray(o.data) ? o.data : []) as T[];
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const total = num(o.total, items.length);
  const lim = num(o.limit, size) || size;
  return { items, total, page: Math.max(1, num(o.page, page)), limit: lim, totalPages: Math.max(1, num(o.totalPages, Math.ceil(total / lim))) };
}

/** Cắt một trang từ danh sách đã có sẵn ở trình duyệt (vd. khách vãng lai) — cùng định dạng với normalizePage. */
export const paginate = <T>(items: readonly T[], page: number, limit: number): PageOf<T> => normalizePage<T>([...items], page, limit);

/** "Hiển thị 21 – 40 trên tổng số 135 bản ghi" (0 bản ghi → "Không có bản ghi nào"). */
export function rangeText(page: number, limit: number, total: number): string {
  if (!total) return 'Không có bản ghi nào';
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return `Hiển thị ${from.toLocaleString('vi-VN')} – ${to.toLocaleString('vi-VN')} trên tổng số ${total.toLocaleString('vi-VN')} bản ghi`;
}

// ------------------------------------------------------------- TASK v3 · NV3: bảng ca kiểu Fresha / 7shifts
export type ShiftKind = 'morning' | 'afternoon' | 'full';

const mins = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Loại ca theo giờ: bắt đầu trước 12:00 và kết thúc từ 17:00 = cả ngày; bắt đầu trước 12:00 = sáng; còn lại = chiều. */
export function shiftKind(startTime: string, endTime: string): ShiftKind {
  const s = mins(startTime);
  const e = mins(endTime);
  if (s < 12 * 60 && e >= 17 * 60) return 'full';
  return s < 12 * 60 ? 'morning' : 'afternoon';
}

export const SHIFT_PRESETS: Record<ShiftKind, { label: string; start: string; end: string; breakStart?: string; breakEnd?: string }> = {
  morning: { label: 'Ca sáng', start: '08:00', end: '14:00' },
  afternoon: { label: 'Ca chiều', start: '14:00', end: '20:00' },
  full: { label: 'Cả ngày', start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
};

/**
 * Ca mẫu "một chạm" cắt theo giờ mở cửa của ngày đó (máy chủ từ chối ca vượt giờ mở cửa). Trả null khi tiệm đóng
 * cửa hoặc phần còn lại ngắn hơn 60 phút. Nghỉ giữa ca bị bỏ nếu không còn nằm trọn trong ca.
 */
export function presetShift(kind: ShiftKind, open: string | null, close: string | null):
  { startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null } | null {
  if (!open || !close) return null;
  const p = SHIFT_PRESETS[kind];
  const s = Math.max(mins(p.start), mins(open));
  const e = Math.min(mins(p.end), mins(close));
  if (e - s < 60) return null;
  const hasBreak = !!p.breakStart && !!p.breakEnd && mins(p.breakStart) >= s && mins(p.breakEnd) <= e;
  return { startTime: hhmm(s), endTime: hhmm(e), breakStart: hasBreak ? p.breakStart! : null, breakEnd: hasBreak ? p.breakEnd! : null };
}

/** Độ phủ cả tuần = tổng phút có đủ thợ / tổng phút mở cửa (bỏ ngày tiệm nghỉ). */
export function weekCoveragePercent(days: { closedReason: string | null; openMinutes: number; coveredMinutes: number }[]): number {
  const open = days.filter((d) => !d.closedReason);
  const total = open.reduce((a, d) => a + d.openMinutes, 0);
  return total ? Math.round((open.reduce((a, d) => a + d.coveredMinutes, 0) / total) * 100) : 100;
}
