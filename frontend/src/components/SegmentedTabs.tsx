import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SegmentedTab { id: string; label: string; count?: number; icon?: ReactNode }

/**
 * Thanh lọc danh mục dạng viên thuốc với chỉ báo vàng TRƯỢT giữa các mục (một phần tử nền duy nhất, di chuyển bằng
 * translateX theo đường cong lò xo — kỹ thuật FLIP: đo vị trí đích, để trình duyệt nội suy transform). Cuộn ngang trên
 * điện thoại, tự cuộn mục đang chọn vào tầm nhìn. Bàn phím: ←/→ chuyển mục (role tablist chuẩn WAI-ARIA).
 */
export function SegmentedTabs({ tabs, value, onChange, label, size = 'md' }: {
  tabs: SegmentedTab[]; value: string; onChange: (id: string) => void; label: string; size?: 'sm' | 'md';
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const tabKey = tabs.map((t) => t.id).join('|');

  useLayoutEffect(() => {
    const track = trackRef.current;
    const btn = track?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(value)}"]`);
    if (!track || !btn) { setIndicator(null); return; }
    const measure = () => setIndicator({ x: btn.offsetLeft, w: btn.offsetWidth });
    measure();
    // Chỉ cuộn NGANG thanh tab để mục đang chọn lọt vào tầm nhìn — scrollIntoView sẽ cuộn cả trang xuống khi vừa tải
    const scroller = track.parentElement;
    if (scroller) {
      const left = btn.offsetLeft - 16;
      const right = btn.offsetLeft + btn.offsetWidth + 16 - scroller.clientWidth;
      if (left < scroller.scrollLeft) scroller.scrollTo({ left, behavior: 'smooth' });
      else if (right > scroller.scrollLeft) scroller.scrollTo({ left: right, behavior: 'smooth' });
    }
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [value, tabKey]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    trackRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const pad = size === 'sm' ? 'min-h-[38px] px-3.5 text-xs' : 'min-h-[42px] px-4 text-[13px]';
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 thin-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div ref={trackRef} role="tablist" aria-label={label} onKeyDown={onKeyDown}
           className="relative inline-flex min-w-max items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 p-1">
        {indicator && (
          <span aria-hidden
                className="absolute bottom-1 left-0 top-1 rounded-full bg-teal-700 shadow-glow transition-[transform,width] duration-spring ease-spring"
                style={{ transform: `translate3d(${indicator.x}px, 0, 0)`, width: indicator.w }} />
        )}
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button key={t.id} type="button" role="tab" data-tab-id={t.id} aria-selected={active} tabIndex={active ? 0 : -1}
                    onClick={() => onChange(t.id)}
                    className={`relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full font-medium transition-colors duration-200 ${pad}
                      ${active ? 'text-white' : 'text-slate-600 hover:text-slate-900'}`}>
              {t.icon && <span className={active ? 'text-white/80' : 'text-gold'}>{t.icon}</span>}
              {t.label}
              {t.count !== undefined && (
                <span className={`tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
