import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, Search } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { PublicCatalogGroup, Quote } from '@/types';
import { EmptyState, Input, ListSkeleton, SmartImage } from '@/components';
import { assignServiceImages, initials, serviceMediaKind } from '@/utils/images';
import { formatDuration } from '@/utils/format';
import { MAX_SERVICES_PER_BOOKING } from '@/utils/constants';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

/** Bước 1 — chọn tối đa 5 dịch vụ (S2-04). */
export function Step1Services() {
  const { selected, toggleService, syncServices } = useBooking();
  const [groups, setGroups] = useState<PublicCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      publicApi
        .catalog(search.trim() || undefined)
        .then((d) => {
          if (!alive) return;
          setGroups(d);
          // Chỉ danh mục đầy đủ (không lọc từ khoá) mới đủ căn cứ để loại dịch vụ cũ khỏi giỏ
          if (!search.trim()) syncServices(d.flatMap((g) => g.services));
        })
        .catch((e) => toast.error(getErrorMessage(e)))
        .finally(() => { if (alive) setLoading(false); });
    }, search ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search, toast, syncServices]);

  // QA-13: hỏi máy chủ tổng thời lượng so với ca dài nhất trong tuần ngay khi giỏ thay đổi
  const [quote, setQuote] = useState<Quote | null>(null);
  const cartKey = selected.map((s) => s.id).join(',');
  useEffect(() => {
    if (!cartKey) { setQuote(null); return; }
    let alive = true;
    publicApi.quote(cartKey.split(','))
      .then((q) => { if (alive) setQuote(q); })
      .catch(() => { if (alive) setQuote(null); }); // cảnh báo là phụ, lỗi mạng không chặn khách chọn dịch vụ
    return () => { alive = false; };
  }, [cartKey]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const atLimit = selected.length >= MAX_SERVICES_PER_BOOKING;
  const photos = useMemo(
    () => assignServiceImages(groups.flatMap((g) => g.services.map((s) => ({ id: s.id, name: s.name, categoryId: g.categoryId })))),
    [groups],
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm dịch vụ (gõ không dấu cũng được)"
          className="pl-11"
          aria-label="Tìm dịch vụ"
        />
      </div>

      {atLimit && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Bạn đã chọn tối đa {MAX_SERVICES_PER_BOOKING} dịch vụ. Bỏ bớt một dịch vụ nếu muốn đổi.
        </p>
      )}

      {quote?.exceedsLongestShift && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Tổng thời lượng {formatDuration(quote.totalDurationMinutes)} vượt quá ca làm dài nhất trong tuần
            ({formatDuration(quote.longestShiftMinutes ?? 0)}). Bạn nên tách thành hai lần hẹn để tiệm phục vụ trọn vẹn.
          </span>
        </p>
      )}

      {loading && groups.length === 0 ? (
        <ListSkeleton count={5} label="Đang tải dịch vụ…" />
      ) : groups.length === 0 ? (
        <EmptyState title="Không có dịch vụ phù hợp" description="Thử từ khoá khác nhé." />
      ) : (
        groups.map((group) => (
          <section key={group.categoryId} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group.categoryName}</h3>
            <ul className="stagger space-y-2">
              {group.services.map((s, index) => {
                const isOn = selectedIds.has(s.id);
                const disabled = !isOn && atLimit;
                return (
                  <li key={s.id} style={{ '--i': index } as React.CSSProperties}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isOn}
                      onClick={() => {
                        const r = toggleService(s);
                        if (!r.ok && r.reason) toast.warning(r.reason);
                      }}
                      className={`press flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-all duration-200
                        ${isOn ? 'border-teal-600 bg-teal-50/30 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card'}
                        ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2
                        ${isOn ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white'}`}>
                        {isOn && <Check size={14} strokeWidth={3} className="animate-fade-in-scale" />}
                      </span>
                      <SmartImage src={photos[s.id]} alt="" loading="lazy" className="hidden h-16 w-16 shrink-0 rounded-xl xs:block"
                                  seed={s.id} monogram={initials(s.name)}
                                  kind={serviceMediaKind({ name: s.name, categoryId: group.categoryId, categoryName: group.categoryName })} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-900">{s.name}</span>
                        <span className="block text-sm font-bold text-teal-700 sm:hidden">{s.priceText}</span>
                        {s.description && (
                          <span className="mt-0.5 block line-clamp-2 text-xs text-ink-muted">{s.description}</span>
                        )}
                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft">
                          <Clock size={13} /> {formatDuration(s.durationMinutes)}
                        </span>
                      </span>
                      <span className="hidden shrink-0 font-bold text-teal-700 sm:block">{s.priceText}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
