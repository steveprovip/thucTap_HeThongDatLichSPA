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
