import { useRealtimeStatus, type RealtimeStatus } from '@/utils/realtime';

const VIEW: Record<Exclude<RealtimeStatus, 'idle'>, { dot: string; ping: boolean; tone: string; label: string; title: string }> = {
  connecting: { dot: 'bg-slate-400', ping: false, tone: 'text-slate-500', label: 'Đang kết nối', title: 'Đang kết nối luồng đồng bộ trực tiếp giữa các thiết bị' },
  live: { dot: 'bg-emerald-500', ping: true, tone: 'text-emerald-700', label: 'Trực tiếp', title: 'Thay đổi từ thiết bị khác hiện ngay trên màn hình này' },
  polling: { dot: 'bg-amber-500', ping: false, tone: 'text-amber-700', label: 'Cập nhật định kỳ', title: 'Không có kết nối trực tiếp, dữ liệu tự làm mới mỗi 15 giây' },
  offline: { dot: 'bg-rose-500', ping: false, tone: 'text-rose-700', label: 'Mất kết nối', title: 'Thiết bị đang ngoại tuyến, sẽ tự đồng bộ lại khi có mạng' },
};

/**
 * Chấm trạng thái đồng bộ giữa các thiết bị, đặt trên thanh đầu trang của khu quản trị.
 * TASK v4 · NV4: kiểu tinh tế — không viền, chỉ chấm sáng nhẹ (nhịp "ping" khi trực tiếp) + chữ nhỏ trên màn hình rộng.
 */
export function LiveStatus() {
  const status = useRealtimeStatus();
  if (status === 'idle') return null;
  const v = VIEW[status];
  return (
    <span
      role="status"
      aria-label={`Đồng bộ: ${v.label}`}
      title={v.title}
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium ${v.tone}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {v.ping && <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping-soft ${v.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${v.dot}`} />
      </span>
      <span className="hidden lg:inline">{v.label}</span>
    </span>
  );
}
