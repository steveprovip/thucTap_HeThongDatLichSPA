import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Clock, Plus, Search } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { PublicCatalogGroup } from '@/types';
import { EmptyState, Input, ListSkeleton, SegmentedTabs, SmartImage } from '@/components';
import { assignServiceImages, initials, serviceMediaKind } from '@/utils/images';
import { formatDuration } from '@/utils/format';
import { MAX_SERVICES_PER_BOOKING } from '@/utils/constants';
import { playCue } from '@/utils/sound';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

/**
 * Bước 1 — chọn tối đa 5 dịch vụ (S2-04). Thẻ chọn một chạm: ảnh, chip thời lượng + giá, vòng chọn bật dấu tick theo lò xo;
 * lọc nhanh theo nhóm bằng thanh trượt; combo nằm cùng lưới và được chọn y như dịch vụ lẻ.
 */
export function Step1Services() {
  const { selected, toggleService, syncServices } = useBooking();
  const [groups, setGroups] = useState<PublicCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** TASK v4 · NV4: lọc nhanh theo nhóm dịch vụ, giống thanh danh mục ở Trang chủ. */
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
  // Nhóm đang lọc không còn trong kết quả tìm kiếm → về "Tất cả"
  useEffect(() => {
    if (category !== 'all' && groups.length && !groups.some((g) => g.categoryId === category)) setCategory('all');
  }, [groups, category]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const atLimit = selected.length >= MAX_SERVICES_PER_BOOKING;
  const photos = useMemo(
    () => assignServiceImages(groups.flatMap((g) => g.services.map((s) => ({ id: s.id, name: s.name, categoryId: g.categoryId, imageUrl: s.imageUrl })))),
    [groups],
  );
  const shownGroups = groups.filter((g) => category === 'all' || g.categoryId === category);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm dịch vụ (gõ không dấu cũng được)"
               className="rounded-full pl-11" aria-label="Tìm dịch vụ" />
      </div>

      {groups.length > 1 && (
        <SegmentedTabs size="sm" label="Lọc nhóm dịch vụ" value={category} onChange={setCategory}
                       tabs={[{ id: 'all', label: 'Tất cả', count: groups.reduce((a, g) => a + g.services.length, 0) },
                         ...groups.map((g) => ({ id: g.categoryId, label: g.categoryName, count: g.services.length }))]} />
      )}

      {atLimit && (
        <p className="animate-fade-in rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          Bạn đã chọn tối đa {MAX_SERVICES_PER_BOOKING} dịch vụ. Bỏ bớt một dịch vụ nếu muốn đổi.
        </p>
      )}

      {loading && groups.length === 0 ? (
        <ListSkeleton count={5} label="Đang tải dịch vụ…" />
      ) : shownGroups.length === 0 ? (
        <EmptyState title="Không có dịch vụ phù hợp" description="Thử từ khoá khác hoặc chọn nhóm “Tất cả” nhé." />
      ) : (
        shownGroups.map((group) => (
          <section key={group.categoryId} className="space-y-2.5" aria-label={group.categoryName}>
            <h3 className="eyebrow pt-2">{group.categoryName}</h3>
            <ul className="stagger grid gap-2.5 md:grid-cols-2">
              {group.services.map((s, index) => {
                const isOn = selectedIds.has(s.id);
                const disabled = !isOn && atLimit;
                return (
                  <li key={s.id} style={{ '--i': index } as CSSProperties}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isOn}
                      onClick={() => {
                        const r = toggleService(s);
                        if (!r.ok && r.reason) toast.warning(r.reason);
                        else playCue('tap');
                      }}
                      className={`group flex h-full w-full items-center gap-3 rounded-2xl border p-2.5 pr-3 text-left
                        transition-[background-color,border-color,box-shadow,transform] duration-spring ease-spring active:scale-[0.985]
                        ${isOn ? 'border-gold/60 bg-gold/[0.07] shadow-glow' : 'border-slate-200/80 bg-white/50 hover:border-gold/35 hover:bg-white'}
                        ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                      <SmartImage src={photos[s.id]} alt="" loading="lazy" sizes="80px" className="h-[72px] w-[72px] shrink-0 rounded-xl"
                                  seed={s.id} monogram={initials(s.name)}
                                  kind={serviceMediaKind({ name: s.name, categoryId: group.categoryId, categoryName: group.categoryName })} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-snug text-slate-900">{s.name}</span>
                        {s.description && <span className="mt-0.5 block line-clamp-1 text-xs text-slate-500">{s.description}</span>}
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="tnum inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            <Clock size={11} /> {formatDuration(s.durationMinutes)}
                          </span>
                          <span className="tnum rounded-full border border-gold/25 px-2 py-0.5 text-[11px] font-semibold text-slate-900">{s.priceText}</span>
                        </span>
                      </span>
                      <span aria-hidden
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color] duration-200
                              ${isOn ? 'border-transparent bg-teal-700 text-white' : 'border-slate-300 text-slate-400 group-hover:border-gold/60 group-hover:text-gold'}`}>
                        {isOn ? <Check size={15} strokeWidth={3} className="animate-spring-pop" /> : <Plus size={15} />}
                      </span>
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
