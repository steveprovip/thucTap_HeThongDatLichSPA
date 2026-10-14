import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Search } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { PublicCatalogGroup } from '@/types';
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
  /** TASK v4 · NV4: lọc nhanh theo nhóm dịch vụ (chip), giống thanh danh mục ở Trang chủ. */
  const [category, setCategory] = useState('all');
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

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const atLimit = selected.length >= MAX_SERVICES_PER_BOOKING;
  const photos = useMemo(
    () => assignServiceImages(groups.flatMap((g) => g.services.map((s) => ({ id: s.id, name: s.name, categoryId: g.categoryId, imageUrl: s.imageUrl })))),
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

      {groups.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 thin-scroll" role="tablist" aria-label="Lọc nhóm dịch vụ">
          {[{ id: 'all', name: 'Tất cả', n: groups.reduce((a, g) => a + g.services.length, 0) },
            ...groups.map((g) => ({ id: g.categoryId, name: g.categoryName, n: g.services.length }))].map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={category === t.id} onClick={() => setCategory(t.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-[color,background-color,border-color] duration-150 ease-out
                      ${category === t.id ? 'border-teal-800 bg-teal-800 text-white' : 'border-ivory-line bg-white text-slate-700 hover:border-teal-300'}`}>
              {t.name}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold ${category === t.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{t.n}</span>
            </button>
          ))}
        </div>
      )}

      {loading && groups.length === 0 ? (
        <ListSkeleton count={5} label="Đang tải dịch vụ…" />
      ) : !groups.some((g) => category === 'all' || g.categoryId === category) ? (
        <EmptyState title="Không có dịch vụ phù hợp" description="Thử từ khoá khác hoặc chọn nhóm “Tất cả” nhé." />
      ) : (
        groups.filter((g) => category === 'all' || g.categoryId === category).map((group) => (
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
                      className={`press flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out
                        ${isOn ? 'border-teal-700 bg-teal-800/[0.04] ring-1 ring-teal-700' : 'border-ivory-line bg-white hover:border-teal-200 hover:shadow-card'}
                        ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2
                        ${isOn ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}>
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
