import React, { useState } from 'react';
import type { AppointmentStatus } from '@/types';

interface StatusMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
  nextStatus?: AppointmentStatus;
  nextActionLabel?: string;
  nextBtnClass?: string;
}

export const STATUS_CONFIG: Record<string, StatusMeta> = {
  pending: {
    label: 'Chờ xác nhận',
    badgeClass: 'bg-[#FAF3E3] text-[#8C621E] border-[#E6D3A7]',
    dotClass: 'bg-[#C59B27]',
    nextStatus: 'confirmed',
    nextActionLabel: 'Xác nhận',
    nextBtnClass: 'bg-[#1C1917] text-[#FAF8F5] hover:bg-[#332E2A]',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-[#F3EFE6] text-[#574B3A] border-[#DCD3C2]',
    dotClass: 'bg-[#8A7556]',
    nextStatus: 'arrived',
    nextActionLabel: 'Check-in khách',
    nextBtnClass: 'bg-[#B48A3E] text-white hover:bg-[#9A732E]',
  },
  arrived: {
    label: 'Đã check-in',
    badgeClass: 'bg-[#EBF3EE] text-[#1E5631] border-[#C5DEC9]',
    dotClass: 'bg-[#2E7D47]',
    nextStatus: 'in_progress',
    nextActionLabel: 'Bắt đầu làm',
    nextBtnClass: 'bg-[#1E5631] text-white hover:bg-[#164225]',
  },
  in_progress: {
    label: 'Đang làm',
    badgeClass: 'bg-[#FDF4E7] text-[#9A5B13] border-[#F0D4B0]',
    dotClass: 'bg-[#D97706] animate-pulse',
    nextStatus: 'completed',
    nextActionLabel: 'Hoàn thành',
    nextBtnClass: 'bg-[#1C1917] text-[#E6C786] hover:bg-[#2E2925]',
  },
  completed: {
    label: 'Hoàn thành',
    badgeClass: 'bg-[#EAECE9] text-[#2F4F3E] border-[#CBD5CE]',
    dotClass: 'bg-[#2F4F3E]',
  },
  cancelled: {
    label: 'Đã huỷ',
    badgeClass: 'bg-[#F9EBEB] text-[#8B2626] border-[#E8C5C5]',
    dotClass: 'bg-[#A83232]',
  },
  no_show: {
    label: 'Không đến',
    badgeClass: 'bg-[#F4EFEF] text-[#6E5A5A] border-[#DDD2D2]',
    dotClass: 'bg-[#78716C]',
  },
};

interface AppointmentStatusControlProps {
  appointmentId: string;
  status: AppointmentStatus;
  onStatusChange: (id: string, nextStatus: AppointmentStatus) => Promise<void>;
  compact?: boolean;
}

export const AppointmentStatusControl: React.FC<AppointmentStatusControlProps> = ({
  appointmentId,
  status,
  onStatusChange,
  compact = false,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const normalizedKey = String(status).toLowerCase();
  const meta = STATUS_CONFIG[normalizedKey] || STATUS_CONFIG.pending;

  const handleAdvance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!meta.nextStatus || isUpdating) return;
    setIsUpdating(true);
    try {
      await onStatusChange(appointmentId, meta.nextStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.badgeClass}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
        <span className="truncate max-w-[110px]">{meta.label}</span>
      </span>

      {meta.nextStatus && (
        <button
          type="button"
          disabled={isUpdating}
          onClick={handleAdvance}
          className={`spa-interactive-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-xs disabled:opacity-50 cursor-pointer ${meta.nextBtnClass}`}
          title={`Chuyển nhanh sang: ${STATUS_CONFIG[meta.nextStatus]?.label ?? meta.nextStatus}`}
        >
          {isUpdating ? (
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{compact ? 'Tiếp →' : `${meta.nextActionLabel} →`}</span>
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
    return <span className="text-xs text-[#78716C] italic">Chưa chọn dịch vụ</span>;
  }

  const visible = services.slice(0, maxVisible);
  const hiddenCount = services.length - visible.length;
  const fullListTitle = services.map((s) => s.name).join(' • ');

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0" title={fullListTitle}>
      {visible.map((srv, idx) => (
        <span
          key={srv.id ?? idx}
          className="inline-block max-w-[165px] truncate px-2 py-0.5 text-xs rounded bg-[#F5F1EA] text-[#332E2A] border border-[#E7E0D6]"
        >
          {srv.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-semibold rounded bg-[#EFE7D6] text-[#8C621E] border border-[#DFCFAF] shrink-0">
          +{hiddenCount} dịch vụ
        </span>
      )}
    </div>
  );
};
