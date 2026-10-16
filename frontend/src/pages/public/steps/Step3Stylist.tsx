import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Shuffle, Star } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { Availability, PublicStylist } from '@/types';
import { ListSkeleton, StylistAvatar } from '@/components';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';
import { playCue } from '@/utils/sound';

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

  // Thợ đã chọn từ trước (bản nháp, hoặc đổi ngày/giờ ở bước 2) mà không còn rảnh lúc này thì bỏ chọn, quay về "Thợ bất kỳ"
  useEffect(() => {
    if (!loading && stylistId && !availableIds.includes(stylistId)) setStylistId(null);
  }, [loading, stylistId, availableIds, setStylistId]);

  if (loading) return <ListSkeleton count={4} avatar label="Đang tìm thợ rảnh ở khung giờ này…" />;

  const free = stylists.filter((s) => availableIds.includes(s.id));
  const busy = stylists.filter((s) => !availableIds.includes(s.id));

  const card = (on: boolean) =>
    `group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-spring ease-spring active:scale-[0.985]
     ${on ? 'border-gold/60 bg-gold/[0.07] shadow-glow' : 'border-slate-200/80 bg-white/50 hover:border-gold/35 hover:bg-white'}`;
  const tick = (on: boolean) => (
    <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200
      ${on ? 'border-transparent bg-teal-700 text-white' : 'border-slate-300 text-transparent group-hover:border-gold/60'}`}>
      {on && <Check size={14} strokeWidth={3} className="animate-spring-pop" />}
    </span>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setStylistId(null); playCue('tap'); }} aria-pressed={stylistId === null} className={card(stylistId === null)}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
          <Shuffle size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-slate-900">Thợ bất kỳ <span className="text-slate-500">· tiệm tự sắp</span></span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
            Hệ thống chọn thợ rảnh và đang ít lịch nhất trong ngày — luôn đặt được kể cả khi thợ quen đã kín chỗ.
          </span>
        </span>
        {tick(stylistId === null)}
      </button>

      {free.length > 0 && (
        <section aria-label={`Thợ còn rảnh lúc ${time}`}>
          <p className="eyebrow mb-2.5 pt-1">Rảnh lúc <span className="tnum">{time}</span> · {free.length} chuyên viên</p>
          <ul className="stagger grid gap-2.5 sm:grid-cols-2">
            {free.map((s, i) => (
              <li key={s.id} style={{ '--i': i } as CSSProperties}>
                <button type="button" onClick={() => { setStylistId(s.id); playCue('tap'); }} aria-pressed={stylistId === s.id} className={card(stylistId === s.id)}>
                  <StylistAvatar id={s.id} name={s.fullName} url={s.avatarUrl} gender={s.gender} size="h-12 w-12" className="ring-gold/25" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{s.fullName}</span>
                    {s.avgRating != null && (
                      <span className="tnum mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <Star size={12} className="fill-current text-gold" /> {s.avgRating.toFixed(1)}
                        <span className="font-normal text-slate-500">/ 5 · đánh giá thật của khách</span>
                      </span>
                    )}
                    {s.bio && <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">{s.bio}</span>}
                  </span>
                  {tick(stylistId === s.id)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {busy.length > 0 && (
        <details className="group rounded-2xl border border-slate-200/70 p-3.5">
          <summary className="cursor-pointer list-none text-sm text-slate-600 marker:hidden">
            <span className="tnum">{busy.length}</span> chuyên viên khác làm được dịch vụ này nhưng đã kín lúc <span className="tnum">{time}</span>
            <span className="ml-1 text-gold group-open:hidden">· xem</span>
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
            {busy.map((s) => <li key={s.id} className="rounded-full border border-slate-200 px-2.5 py-1">{s.fullName}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
