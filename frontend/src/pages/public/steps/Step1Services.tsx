import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Search } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { PublicCatalogGroup } from '@/types';
import { EmptyState, Input, Spinner } from '@/components';
import { formatDuration } from '@/utils/format';
import { MAX_SERVICES_PER_BOOKING } from '@/utils/constants';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

/** Bước 1 — chọn tối đa 5 dịch vụ (S2-04). */
export function Step1Services() {
  const { selected, toggleService } = useBooking();
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
        .then((d) => { if (alive) setGroups(d); })
        .catch((e) => toast.error(getErrorMessage(e)))
        .finally(() => { if (alive) setLoading(false); });
    }, search ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search, toast]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const atLimit = selected.length >= MAX_SERVICES_PER_BOOKING;

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

      {loading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState title="Không có dịch vụ phù hợp" description="Thử từ khoá khác nhé." />
      ) : (
        groups.map((group) => (
          <section key={group.categoryId} className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-700">{group.categoryName}</h3>
            <ul className="space-y-2">
              {group.services.map((s) => {
                const isOn = selectedIds.has(s.id);
                const disabled = !isOn && atLimit;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isOn}
                      onClick={() => {
                        const r = toggleService(s);
                        if (!r.ok && r.reason) toast.warning(r.reason);
                      }}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors
                        ${isOn ? 'border-brand-600 bg-brand-50' : 'border-brand-100 bg-white hover:border-brand-300'}
                        ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2
                        ${isOn ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-300'}`}>
                        {isOn && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{s.name}</span>
                        {s.description && (
                          <span className="mt-0.5 block line-clamp-2 text-xs text-ink-muted">{s.description}</span>
                        )}
                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft">
                          <Clock size={13} /> {formatDuration(s.durationMinutes)}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-brand-800">{s.priceText}</span>
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
