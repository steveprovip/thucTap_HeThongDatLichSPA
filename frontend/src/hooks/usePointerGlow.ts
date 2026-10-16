import { useEffect, useRef, type RefObject } from 'react';

const canHover = (): boolean =>
  typeof window !== 'undefined'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Ánh sáng champagne bám theo con trỏ (lớp `.ambient`): ghi --mx / --my lên phần tử, tối đa một lần mỗi khung hình (rAF),
 * không re-render React. Đọc toạ độ trong sự kiện, ghi trong rAF → không xen kẽ đọc/ghi layout (không layout thrashing).
 * Màn cảm ứng / giảm chuyển động: không gắn sự kiện, ánh sáng đứng yên.
 */
export function usePointerGlow<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canHover()) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty('--mx', `${x.toFixed(0)}px`);
          el.style.setProperty('--my', `${y.toFixed(0)}px`);
        });
      }
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

/**
 * Nút "từ tính" (lớp `.magnetic`): nút nhích về phía con trỏ tối đa `max` px, rời chuột thì lò xo (--ease-spring) kéo về.
 * Chỉ ghi --tx / --ty qua rAF; transform chạy trên GPU.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.22, max = 6): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canHover()) return;
    let raf = 0;
    const write = (tx: number, ty: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--tx', `${tx.toFixed(1)}px`);
        el.style.setProperty('--ty', `${ty.toFixed(1)}px`);
      });
    };
    const clamp = (v: number) => Math.max(-max, Math.min(max, v));
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      write(clamp((e.clientX - (r.left + r.width / 2)) * strength), clamp((e.clientY - (r.top + r.height / 2)) * strength));
    };
    const onLeave = () => write(0, 0);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [strength, max]);
  return ref;
}
