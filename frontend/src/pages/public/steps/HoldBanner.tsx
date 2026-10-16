import { Lock, TimerReset } from 'lucide-react';
import { Button } from '@/components';
import { formatCountdown } from '@/utils/format';
import type { SlotHold } from '@/types';
import type { HoldState } from '../useSlotHold';

const R = 19;
const C = 2 * Math.PI * R;

/**
 * Mentor Sprint 2 · mục 11 — "đang giữ chỗ cho bạn" ở bước Xác nhận (RFC-2026-SPA-V3: vòng đếm ngược).
 * Vòng tròn rút dần theo thời gian giữ chỗ (stroke-dashoffset, chuyển tiếp tuyến tính 1 giây — khớp nhịp đếm); còn dưới
 * 2 phút: vòng chuyển hổ phách và có sóng lan nhẹ (pulse-ring) kèm nút giữ thêm.
 */
export function HoldBanner({ hold, state, remainingMs, onExtend }: {
  hold: SlotHold | null; state: HoldState; remainingMs: number; onExtend: () => void;
}) {
  if (state === 'holding') {
    return (
      <p className="flex items-center gap-2.5 rounded-2xl border border-slate-200/70 px-4 py-3 text-xs text-slate-500" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Đang giữ chỗ khung giờ cho bạn…
      </p>
    );
  }
  if (state === 'expired') {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span>Hết thời gian giữ chỗ. Khung giờ có thể đã được khách khác chọn.</span>
        <Button size="sm" variant="outline" icon={<TimerReset size={14} />} onClick={onExtend}>Giữ lại khung giờ này</Button>
      </div>
    );
  }
  if (state !== 'held' || !hold) return null;
  const total = hold.holdMinutes * 60_000;
  const left = Math.max(0, Math.min(1, remainingMs / total));
  const low = remainingMs < 2 * 60_000;
  return (
    <div role="status" aria-live="polite"
         className={`flex flex-wrap items-center gap-3.5 rounded-2xl border px-4 py-3 transition-colors duration-500 ${low ? 'border-amber-300 bg-amber-50' : 'border-champagne/40 bg-white/90 shadow-card backdrop-blur-[20px]'}`}>
      <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${low ? 'pulse-ring text-amber-600' : 'text-teal-700'}`}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-12 w-12 -rotate-90" aria-hidden>
          <circle cx="24" cy="24" r={R} fill="none" strokeWidth="3" className="stroke-slate-200" />
          <circle cx="24" cy="24" r={R} fill="none" strokeWidth="3" strokeLinecap="round" stroke="currentColor"
                  strokeDasharray={C} strokeDashoffset={C * (1 - left)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <Lock size={15} />
      </span>
      <span className={`min-w-0 flex-1 text-sm ${low ? 'text-amber-900' : 'text-slate-700'}`}>
        Đã giữ chỗ <strong className="tnum text-slate-900">{hold.time}–{hold.endTime}</strong>
        {hold.stylistName ? <> với <strong className="text-slate-900">{hold.stylistName}</strong></> : null} cho bạn
        <span className="mt-0.5 block text-xs">
          Còn <strong className="tnum text-base font-semibold">{formatCountdown(remainingMs)}</strong> để hoàn tất thông tin
        </span>
      </span>
      {low && <Button size="sm" variant="outline" icon={<TimerReset size={14} />} onClick={onExtend}>Giữ thêm {hold.holdMinutes} phút</Button>}
    </div>
  );
}
