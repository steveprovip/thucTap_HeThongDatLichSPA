import type { AppointmentStatus } from '@/types';
import { STATUS_DOT, STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';

export function StatusBadge({ status, className = '' }: { status: AppointmentStatus; className?: string }) {
  return (
    <span className={`chip border ${STATUS_STYLES[status]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
