import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { AppointmentStatus } from '@/types';

interface StatusMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
  nextStatus?: AppointmentStatus;
  nextActionLabel?: string;
}

/**
 * Chuỗi chuyển trạng thái 1 chạm: Chờ xác nhận → Đã xác nhận → Đã check-in → Đang làm → Hoàn thành.
 * Màu lấy từ token (đúng ở cả giao diện sáng lẫn Lotus Noir), cùng hệ màu với Lịch ngày / StatusBadge.
 */
export const STATUS_CONFIG: Record<string, StatusMeta> = {
  pending: {
    label: 'Chờ xác nhận', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200', dotClass: 'bg-amber-500',
    nextStatus: 'confirmed', nextActionLabel: 'Xác nhận',
  },
  confirmed: {
    label: 'Đã xác nhận', badgeClass: 'bg-blue-50 text-blue-800 border-blue-200', dotClass: 'bg-blue-500',
    nextStatus: 'arrived', nextActionLabel: 'Check-in',
  },
  arrived: {
    label: 'Đã check-in', badgeClass: 'bg-violet-50 text-violet-800 border-violet-200', dotClass: 'bg-violet-500',
    nextStatus: 'in_progress', nextActionLabel: 'Bắt đầu làm',
  },
  in_progress: {
    label: 'Đang làm', badgeClass: 'bg-cyan-50 text-cyan-900 border-cyan-200', dotClass: 'bg-cyan-500 animate-pulse',
    nextStatus: 'completed', nextActionLabel: 'Hoàn thành',
  },
  completed: { label: 'Hoàn thành', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200', dotClass: 'bg-emerald-500' },
  cancelled: { label: 'Đã huỷ', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200', dotClass: 'bg-slate-400' },
  no_show: { label: 'Không đến', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200', dotClass: 'bg-rose-500' },
};

interface AppointmentStatusControlProps {
  appointmentId: string;
  status: AppointmentStatus;
  /** Màn hình cha tự cập nhật lạc quan + gọi API; trong lúc chờ truyền `busy`. */
  onAdvance: (id: string, nextStatus: AppointmentStatus) => void;
  busy?: boolean;
  compact?: boolean;
}

/**
 * Huy hiệu trạng thái + nút bước kế. Trạng thái hiển thị đã là trạng thái MỚI ngay khi bấm (lạc quan, < 16 ms);
 * trong lúc máy chủ xác nhận, nút hiện vòng xoay nhỏ và khoá để không bấm hai lần. Lỗi → màn hình cha trả lại dòng đó.
 */
export const AppointmentStatusControl: React.FC<AppointmentStatusControlProps> = ({
  appointmentId, status, onAdvance, busy = false, compact = false,
}) => {
  const meta = STATUS_CONFIG[String(status).toLowerCase()] || STATUS_CONFIG.pending;
  const next = meta.nextStatus;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span key={status} className={`animate-spring-pop inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.badgeClass}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClass}`} />
        <span className="max-w-[110px] truncate">{meta.label}</span>
      </span>

      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); if (!busy) onAdvance(appointmentId, next); }}
          className="spa-interactive-btn inline-flex min-h-[30px] items-center gap-1 rounded-full bg-teal-700 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
          title={`Chuyển nhanh sang: ${STATUS_CONFIG[next]?.label ?? next}`}
          aria-label={`${meta.nextActionLabel ?? 'Bước kế'} — chuyển sang ${STATUS_CONFIG[next]?.label ?? next}`}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : (
            <>{compact ? 'Tiếp' : meta.nextActionLabel} <ArrowRight size={12} /></>
          )}
        </button>
      )}
    </div>
  );
};

export const ServicePills: React.FC<{
  services: Array<{ id?: string; name: string }>;
  maxVisible?: number;
}> = ({ services = [], maxVisible = 2 }) => {
  if (!services.length) {
    return <span className="text-xs italic text-slate-500">Chưa chọn dịch vụ</span>;
  }

  const visible = services.slice(0, maxVisible);
  const hiddenCount = services.length - visible.length;
  const fullListTitle = services.map((s) => s.name).join(' • ');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" title={fullListTitle}>
      {visible.map((srv, idx) => (
        <span key={srv.id ?? idx} className="inline-block max-w-[165px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
          {srv.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
          +{hiddenCount} dịch vụ
        </span>
      )}
    </div>
  );
};
