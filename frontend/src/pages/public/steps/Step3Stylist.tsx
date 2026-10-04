import { useEffect, useState } from 'react';
import { Check, Shuffle, Star } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { Availability, PublicStylist } from '@/types';
import { ListSkeleton, StylistAvatar } from '@/components';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

/** Bước 3 — chọn đích danh thợ hoặc để hệ thống tự phân thợ bất kỳ (S2-06). */
export function Step3Stylist() {
  const { selected, date, time, stylistId, setStylistId } = useBooking();
  const [stylists, setStylists] = useState<PublicStylist[]>([]);
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ids = selected.map((s) => s.id);
    Promise.all([publicApi.stylists(ids), publicApi.availability(date, ids)])
      .then(([list, av]: [PublicStylist[], Availability]) => {
        if (!alive) return;
        setStylists(list);
        setAvailableIds(av.slots.find((s) => s.time === time)?.stylistIds ?? []);
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selected, date, time, toast]);

  if (loading) return <ListSkeleton count={4} avatar label="Đang tìm thợ rảnh ở khung giờ này…" />;

  const free = stylists.filter((s) => availableIds.includes(s.id));
  const busy = stylists.filter((s) => !availableIds.includes(s.id));

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setStylistId(null)}
        aria-pressed={stylistId === null}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors
          ${stylistId === null ? 'border-teal-600 bg-teal-50/30 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card'}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Shuffle size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Thợ bất kỳ (tiệm tự sắp)</span>
          <span className="block text-xs text-ink-muted">
            Hệ thống chọn thợ rảnh và đang ít lịch nhất trong ngày — luôn đặt được kể cả khi thợ quen đã kín chỗ.
          </span>
        </span>
        {stylistId === null && <Check size={20} className="shrink-0 text-teal-600" />}
      </button>

      {free.length > 0 && (
        <>
          <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Thợ còn rảnh lúc {time}</p>
          {free.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStylistId(s.id)}
              aria-pressed={stylistId === s.id}
              className={`press flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200
                ${stylistId === s.id ? 'border-teal-600 bg-teal-50/30 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card'}`}
            >
              <StylistAvatar id={s.id} name={s.fullName} url={s.avatarUrl} gender={s.gender} size="h-12 w-12" className="shadow-sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.fullName}</span>
                {s.avgRating != null && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><Star size={13} fill="currentColor" className="text-amber-400" /> {s.avgRating.toFixed(1)} / 5</span>}
                {s.bio && <span className="block line-clamp-2 text-xs text-ink-muted">{s.bio}</span>}
              </span>
              {stylistId === s.id && <Check size={20} className="shrink-0 text-teal-600" />}
            </button>
          ))}
        </>
      )}

      {busy.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">
            {busy.length} thợ khác làm được dịch vụ này nhưng đã kín lúc {time}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {busy.map((s) => <li key={s.id}>• {s.fullName}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
