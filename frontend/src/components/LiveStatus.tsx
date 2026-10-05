import { useRealtimeStatus, type RealtimeStatus } from '@/utils/realtime';

const VIEW: Record<Exclude<RealtimeStatus, 'idle'>, { dot: string; label: string; title: string }> = {
  connecting: { dot: 'bg-slate-400', label: 'Đang kết nối', title: 'Đang kết nối luồng đồng bộ trực tiếp giữa các thiết bị' },
  live: { dot: 'bg-emerald-500 animate-pulse', label: 'Trực tiếp', title: 'Thay đổi từ thiết bị khác hiện ngay trên màn hình này' },
  polling: { dot: 'bg-amber-500', label: 'Cập nhật định kỳ', title: 'Không có kết nối trực tiếp, dữ liệu tự làm mới mỗi 15 giây' },
  offline: { dot: 'bg-rose-500', label: 'Mất kết nối', title: 'Thiết bị đang ngoại tuyến, sẽ tự đồng bộ lại khi có mạng' },
};

/** Chấm trạng thái đồng bộ giữa các thiết bị, đặt trên thanh đầu trang của khu quản trị. */
export function LiveStatus() {
  const status = useRealtimeStatus();
  if (status === 'idle') return null;
  const v = VIEW[status];
  return (
    <span
      role="status"
      aria-label={`Đồng bộ: ${v.label}`}
      title={v.title}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600"
    >
      <span className={`h-2 w-2 rounded-full ${v.dot}`} aria-hidden />
      <span className="hidden md:inline">{v.label}</span>
    </span>
  );
}
