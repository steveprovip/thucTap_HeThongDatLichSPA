import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Số chạy mượt khi giá trị đổi (tổng tiền ở thanh tóm tắt): ghi thẳng textContent trong rAF — không re-render React mỗi khung
 * hình. Ease-out bậc ba 420 ms; giảm chuyển động → nhảy thẳng tới giá trị mới. Trình đọc màn hình chỉ nghe giá trị cuối.
 */
export function AnimatedNumber({ value, format, className = '', durationMs = 420 }: {
  value: number; format: (n: number) => string; className?: string; durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  // Phần tử hiển thị KHÔNG có con do React quản lý (ta ghi textContent trực tiếp) → ghi giá trị đầu trước lần vẽ đầu
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = formatRef.current(shown.current);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (from === value || reduce) {
      shown.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      shown.current = Math.round(from + (value - from) * eased);
      el.textContent = formatRef.current(shown.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className={`tnum ${className}`}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
