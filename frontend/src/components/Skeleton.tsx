import type { CSSProperties } from 'react';

/** Khối xám có hiệu ứng shimmer. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} style={style} aria-hidden />;
}

function Busy({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Khung chờ chung: vài dòng nội dung trong một thẻ. */
export function ContentSkeleton({ label = 'Đang tải…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <Busy label={label} className="card space-y-3 p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
      ))}
    </Busy>
  );
}

/** Lưới thẻ dịch vụ (ảnh + chữ). */
export function ServiceGridSkeleton({ count = 6, label = 'Đang tải dịch vụ…' }: { count?: number; label?: string }) {
  return (
    <Busy label={label} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <Skeleton className="h-44 rounded-none" />
          <div className="space-y-3 p-5">
            <div className="flex justify-between gap-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-5 w-20 rounded-full" /></div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex justify-between border-t border-slate-100 pt-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-24" /></div>
          </div>
        </div>
      ))}
    </Busy>
  );
}

/** Danh sách hàng chọn (dịch vụ, thợ) trong trình đặt lịch. */
export function ListSkeleton({ count = 4, avatar = false, label = 'Đang tải…' }: { count?: number; avatar?: boolean; label?: string }) {
  return (
    <Busy label={label} className="space-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
          {avatar ? <Skeleton className="h-12 w-12 shrink-0 rounded-full" /> : <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />}
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </Busy>
  );
}

/** Hàng thẻ số liệu. */
export function StatGridSkeleton({ count = 4, label = 'Đang tải số liệu…' }: { count?: number; label?: string }) {
  return (
    <Busy label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-9 rounded-xl" /></div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </Busy>
  );
}

/** Bảng dữ liệu. */
export function TableSkeleton({ rows = 6, cols = 5, label = 'Đang tải dữ liệu…' }: { rows?: number; cols?: number; label?: string }) {
  return (
    <Busy label={label} className="table-wrap">
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3.5">
        {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" style={{ maxWidth: c === 0 ? '28%' : `${60 + ((r + c) * 13) % 40}%` }} />
          ))}
        </div>
      ))}
    </Busy>
  );
}

/** Lưới lịch ngày: cột giờ + các cột thợ. */
export function TimelineSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <Busy label="Đang dựng lịch ngày…" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex">
        <div className="w-16 shrink-0 space-y-[46px] border-r border-slate-100 px-3 pt-20">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-2.5 w-9" />)}
        </div>
        {Array.from({ length: columns }, (_, c) => (
          <div key={c} className="flex-1 border-r border-slate-100 last:border-0">
            <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-3">
              <Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3.5 w-24" />
            </div>
            <div className="relative h-[420px]">
              <Skeleton className="absolute inset-x-2 rounded-md" style={{ top: 30 + c * 55, height: 70 + (c % 2) * 50 }} />
              <Skeleton className="absolute inset-x-2 rounded-md" style={{ top: 230 + (c % 3) * 30, height: 60 }} />
            </div>
          </div>
        ))}
      </div>
    </Busy>
  );
}
