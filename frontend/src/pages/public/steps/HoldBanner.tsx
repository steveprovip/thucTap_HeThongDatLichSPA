import { Lock, TimerReset } from 'lucide-react';
import { Button } from '@/components';
import { formatCountdown } from '@/utils/format';
import type { SlotHold } from '@/types';
import type { HoldState } from '../useSlotHold';

/** Mentor Sprint 2 · mục 11 — dải đếm ngược "đang giữ chỗ cho bạn" ở bước Xác nhận. */
export function HoldBanner({ hold, state, remainingMs, onExtend }: {
  hold: SlotHold | null; state: HoldState; remainingMs: number; onExtend: () => void;
}) {
  if (state === 'holding') {
    return <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-ink-muted" role="status">Đang giữ chỗ khung giờ cho bạn…</p>;
  }
  if (state === 'expired') {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <span>Hết thời gian giữ chỗ. Khung giờ có thể đã được khách khác chọn.</span>
        <Button size="sm" variant="outline" icon={<TimerReset size={14} />} onClick={onExtend}>Giữ lại khung giờ này</Button>
      </div>
    );
  }
  if (state !== 'held' || !hold) return null;
  const total = hold.holdMinutes * 60_000;
  const low = remainingMs < 2 * 60_000;
  return (
    <div role="status" aria-live="polite"
         className={`overflow-hidden rounded-xl border ${low ? 'border-amber-300 bg-amber-50' : 'border-teal-200 bg-teal-50/70'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
        <span className={`flex items-center gap-2 ${low ? 'text-amber-900' : 'text-teal-900'}`}>
          <Lock size={15} />
          <span>
            Đã giữ chỗ <strong>{hold.time}–{hold.endTime}</strong>{hold.stylistName ? <> với <strong>{hold.stylistName}</strong></> : null} cho bạn
            · còn <strong className="tabular-nums">{formatCountdown(remainingMs)}</strong>
          </span>
        </span>
        {low && <Button size="sm" variant="outline" icon={<TimerReset size={14} />} onClick={onExtend}>Giữ thêm {hold.holdMinutes} phút</Button>}
      </div>
      <div className="h-1 bg-white/60">
        <div className={`h-1 transition-[width] duration-1000 ease-linear ${low ? 'bg-amber-500' : 'bg-teal-500'}`}
             style={{ width: `${Math.max(0, Math.min(100, (remainingMs / total) * 100))}%` }} />
      </div>
    </div>
  );
}
