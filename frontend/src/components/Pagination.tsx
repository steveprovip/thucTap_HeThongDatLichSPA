import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageItems, rangeText } from '@/utils/opsHelpers';

export const PAGE_SIZES = [10, 20, 50] as const;

/**
 * TASK v3 · NV2 — thanh phân trang đầy đủ: "Hiển thị X – Y trên tổng số Z bản ghi", chọn số dòng / trang
 * (10 · 20 · 50) và [Trước] 1 2 3 … [Sau]. `limit` + `onLimitChange` là tuỳ chọn để các màn hình cũ vẫn dùng như trước.
 */
export function Pagination({ page, totalPages, total, onChange, limit, onLimitChange }: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
  limit?: number;
  onLimitChange?: (n: number) => void;
}) {
  const size = limit ?? (totalPages > 0 ? Math.ceil(total / Math.max(1, totalPages)) : total);
  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium transition disabled:opacity-40';
  return (
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>{limit ? rangeText(page, size, total) : `Tổng số ${total.toLocaleString('vi-VN')} bản ghi`}</span>
        {onLimitChange && limit && (
          <label className="inline-flex items-center gap-1.5">
            Số dòng / trang
            <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} aria-label="Số dòng mỗi trang"
                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-ink">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={`${btn} border-slate-200 bg-white text-ink-soft hover:border-teal-400`}
                  disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
            <ChevronLeft size={14} /> Trước
          </button>
          {pageItems(page, totalPages).map((p, i) => (p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-ink-muted">…</span>
          ) : (
            <button key={p} type="button" onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
                    className={`${btn} ${p === page ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-ink-soft hover:border-teal-400'}`}>
              {p}
            </button>
          )))}
          <button type="button" className={`${btn} border-slate-200 bg-white text-ink-soft hover:border-teal-400`}
                  disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Trang sau">
            Sau <ChevronRight size={14} />
          </button>
        </div>
      )}
    </nav>
  );
}
