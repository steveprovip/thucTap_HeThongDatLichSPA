/**
 * Phân kênh đồng bộ trực tiếp (RFC-2026-SPA-V3 · Pillar II.3): máy chủ gắn `scope` (đoạn đầu đường dẫn API vừa ghi) cho mỗi
 * sự kiện; mỗi màn hình chỉ tải lại khi phạm vi đó thuộc nhóm dữ liệu nó hiển thị — đổi bảng giá không làm danh sách lịch hẹn
 * nháy, chốt hoá đơn không làm bảng ca tải lại.
 */
export type RealtimeDomain = 'appointments' | 'shifts' | 'invoices' | 'services' | 'general';

export type LiveChangeKind = 'booking.created';

/** Chi tiết một thay đổi. Không có `scope` = chưa rõ phạm vi (nối lại sau khi lỡ sự kiện, tab hiện lại…) → mọi màn hình làm mới. */
export interface LiveChange {
  scope?: string;
  kind?: LiveChangeKind;
  /** Số thứ tự sự kiện của máy chủ (chống phát chuông hai lần khi mở nhiều tab). */
  seq?: number;
}

const SCOPE_DOMAINS: Record<string, RealtimeDomain[]> = {
  appointments: ['appointments'],
  public: ['appointments'],
  customers: ['appointments'],
  invoices: ['invoices', 'appointments'],
  vouchers: ['invoices'],
  shifts: ['shifts', 'appointments'],
  'shift-requests': ['shifts'],
  'time-off': ['shifts', 'appointments'],
  holidays: ['shifts', 'appointments'],
  'working-hours': ['shifts', 'appointments'],
  stylists: ['shifts', 'services', 'appointments'],
  services: ['services'],
  'service-categories': ['services'],
  users: ['general'],
  reviews: ['general'],
};

/** Nhóm dữ liệu bị ảnh hưởng bởi một phạm vi; phạm vi lạ → coi như ảnh hưởng mọi nhóm (an toàn hơn bỏ sót). */
export function domainsOf(scope: string | undefined): RealtimeDomain[] | null {
  if (!scope) return null;
  return SCOPE_DOMAINS[scope] ?? null;
}

/** Màn hình đang hiển thị `domains` có cần tải lại vì thay đổi này không. */
export function shouldSync(change: LiveChange | undefined, domains: readonly RealtimeDomain[]): boolean {
  const affected = domainsOf(change?.scope);
  if (!affected || domains.includes('general')) return true;
  return affected.some((d) => domains.includes(d));
}

/** Phạm vi của một thao tác ghi phía trình duyệt, tính từ đường dẫn API (khớp RealtimeInterceptor ở máy chủ). */
export function scopeOfUrl(url: string | undefined): string | undefined {
  const head = (url ?? '').split('?')[0].replace(/^\/+/, '').split('/');
  if (!head[0]) return undefined;
  if (head[0] === 'public') return 'appointments';
  if (head[0] === 'stylists' && head[2] === 'time-off') return 'time-off';
  return head[0];
}

/** Mốc dữ liệu đã nhận từ luồng trực tiếp: mã khởi động máy chủ + số thứ tự sự kiện cuối cùng. */
export interface StreamCursor { bootId: string; seq: number }

/**
 * Nối lại luồng: chỉ làm mới khi THỰC SỰ có thể đã lỡ sự kiện — máy chủ khởi động lại (bootId đổi) hoặc số thứ tự đã tăng
 * trong lúc mất kết nối. Nối lại theo lịch (20 phút) / sau khi tab hiện lại mà không có gì đổi → không tải lại, không nháy.
 */
export function missedSince(cursor: StreamCursor | null, hello: StreamCursor): boolean {
  return !cursor || cursor.bootId !== hello.bootId || cursor.seq !== hello.seq;
}
