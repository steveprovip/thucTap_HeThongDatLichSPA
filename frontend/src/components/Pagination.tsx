import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, total, onChange }: {
  page: number; totalPages: number; total: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return <p className="px-1 py-2 text-xs text-ink-muted">Tổng {total} dòng</p>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
      <p className="text-xs text-ink-muted">Tổng {total} dòng · trang {page}/{totalPages}</p>
      <div className="flex items-center gap-1">
        <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={14} /> Trước
        </button>
        <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Sau <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
