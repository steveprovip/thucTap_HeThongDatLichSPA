import { ImgHTMLAttributes, ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { Droplets, Flower2, Gem, HandHeart, Leaf, Palette, Scissors, Sparkles, UserRound } from 'lucide-react';
import { initials, KIND_ALTERNATES, stylistPhoto, type MediaKind } from '@/utils/images';
import type { StylistGender } from '@/types';

/**
 * Ảnh đã nằm sẵn trong cache có thể bắn onLoad TRƯỚC khi useEffect chạy; nếu effect sau đó đặt lại
 * trạng thái "loading" thì ảnh kẹt ở opacity-0 mãi mãi. Vì vậy chỉ reset khi src thật sự đổi
 * (so sánh ngay khi render) và đọc img.complete lúc gắn phần tử.
 */
const readyState = (img: HTMLImageElement | null): 'ready' | 'error' | null =>
  img?.complete ? (img.naturalWidth > 0 ? 'ready' : 'error') : null;

/** Quá thời gian này mà ảnh CDN vẫn chưa về (mạng chập chờn / offline) thì hiện nền dự phòng. */
const LOAD_TIMEOUT_MS = 8000;

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * QA-22: nền dự phòng ĐỘC BẢN cho từng dịch vụ / thợ — sắc độ suy ra ổn định từ mã (id), nên hai dịch vụ
 * cùng chủ đề vẫn khác màu và cùng một dịch vụ luôn ra cùng một màu, không cần mạng.
 */
const seedHue = (seed: string): number => [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

/** Nền SVG gradient vẽ tại chỗ (không tải tệp nào) — màu riêng theo `seed`, co giãn theo khung chứa. */
function SeedGradient({ seed }: { seed: string }) {
  const gid = `sg${useId().replace(/:/g, '')}`;
  const h = seedHue(seed);
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 80% 94%)`} />
          <stop offset="1" stopColor={`hsl(${(h + 40) % 360} 70% 86%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      <circle cx="88" cy="10" r="26" fill="#ffffff" fillOpacity="0.45" />
      <circle cx="8" cy="96" r="22" fill="#ffffff" fillOpacity="0.35" />
    </svg>
  );
}

/** Nền dự phòng theo chủ đề dịch vụ: gradient pastel + biểu tượng, không cần mạng. */
const FALLBACK: Record<MediaKind, { gradient: string; tint: string; icon: ReactNode }> = {
  hair: { gradient: 'from-rose-100 via-orange-50 to-amber-100', tint: 'text-rose-500', icon: <Scissors aria-hidden /> },
  wash: { gradient: 'from-sky-100 via-cyan-50 to-teal-100', tint: 'text-sky-600', icon: <Droplets aria-hidden /> },
  skin: { gradient: 'from-teal-100 via-emerald-50 to-amber-50', tint: 'text-teal-600', icon: <Sparkles aria-hidden /> },
  massage: { gradient: 'from-amber-100 via-orange-50 to-rose-100', tint: 'text-amber-600', icon: <HandHeart aria-hidden /> },
  combo: { gradient: 'from-violet-100 via-fuchsia-50 to-amber-50', tint: 'text-violet-600', icon: <Gem aria-hidden /> },
  nail: { gradient: 'from-pink-100 via-rose-50 to-violet-100', tint: 'text-pink-600', icon: <Flower2 aria-hidden /> },
  makeup: { gradient: 'from-rose-100 via-pink-50 to-amber-50', tint: 'text-rose-500', icon: <Palette aria-hidden /> },
  spa: { gradient: 'from-teal-100 via-teal-50 to-amber-50', tint: 'text-teal-600', icon: <Leaf aria-hidden /> },
  person: { gradient: 'from-slate-100 via-teal-50 to-slate-100', tint: 'text-teal-700', icon: <UserRound aria-hidden /> },
};

/** Nền thay thế ảnh: luôn hiển thị được kể cả khi mất mạng, không bao giờ lộ biểu tượng ảnh vỡ. */
export function MediaFallback({ kind = 'spa', label, className = '', seed, monogram }: {
  kind?: MediaKind; label?: string; className?: string; seed?: string; monogram?: string;
}) {
  const v = FALLBACK[kind] ?? FALLBACK.spa;
  return (
    <div className={`animate-fade absolute inset-0 overflow-hidden bg-gradient-to-br ${v.gradient} ${className}`} role="img"
         aria-label={label ?? monogram}>
      {seed && <SeedGradient seed={seed} />}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/50 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/40 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:14px_14px]" />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-2">
        <span className={`flex aspect-square h-[46%] max-h-14 min-h-[22px] items-center justify-center rounded-full bg-white/75 shadow-sm ring-1 ring-white backdrop-blur-sm ${v.tint} [&>svg]:h-1/2 [&>svg]:w-1/2`}>
          {v.icon}
        </span>
        {label ? (
          <span className="max-w-[85%] truncate rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 backdrop-blur-sm">
            {label}
          </span>
        ) : monogram && (
          <span aria-hidden className="absolute bottom-1 right-1.5 text-[10px] font-bold tracking-wider text-slate-600/80">{monogram}</span>
        )}
      </div>
    </div>
  );
}

/** Số ảnh dự phòng cùng chủ đề được thử khi ảnh chính bị gỡ / lỗi, trước khi dùng nền gradient. */
const MAX_ALTERNATES = 2;

/**
 * Ảnh có khung shimmer khi đang tải, hiện dần khi xong. Khi ảnh chính lỗi (ảnh bị gỡ khỏi CDN)
 * thì thử lần lượt ảnh dự phòng cùng chủ đề; mất mạng / tải quá lâu / hết ảnh dự phòng thì chuyển
 * mượt sang nền gradient theo chủ đề dịch vụ (kéo, giọt nước, lấp lánh…). Không bao giờ lộ ảnh vỡ.
 */
export function SmartImage({ src, alt, className = '', imgClassName = '', kind = 'spa', fallbackLabel, seed, monogram, ...rest }:
  ImgHTMLAttributes<HTMLImageElement> & {
    imgClassName?: string; kind?: MediaKind; fallbackLabel?: string;
    /** Mã dịch vụ / thợ để nền dự phòng mang màu riêng (QA-22). */
    seed?: string;
    /** Chữ viết tắt hiện trên nền dự phòng khi không có fallbackLabel. */
    monogram?: string;
  }) {
  const initial = (): 'loading' | 'error' => (src && !isOffline() ? 'loading' : 'error');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(initial);
  const [trackedSrc, setTrackedSrc] = useState(src);
  const [attempt, setAttempt] = useState(0);
  if (src !== trackedSrc) { setTrackedSrc(src); setState(initial()); setAttempt(0); }
  const candidates = [src, ...(KIND_ALTERNATES[kind] ?? []).filter((u) => u !== src).slice(0, MAX_ALTERNATES)].filter(Boolean);
  const currentSrc = candidates[attempt];
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    const s = readyState(img); if (s === 'ready') setState('ready');
  }, []);
  /** Ảnh hiện tại lỗi → thử ảnh dự phòng kế tiếp; hết thì dùng nền gradient. */
  const handleError = () => {
    if (isOffline() || attempt + 1 >= candidates.length) { setState('error'); return; }
    setAttempt((n) => n + 1); setState('loading');
  };

  // Mạng treo (không lỗi mà cũng không về) → không để khung shimmer chạy mãi
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = window.setTimeout(() => setState((s) => (s === 'loading' ? 'error' : s)), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state, trackedSrc, attempt]);

  return (
    <div className={`relative overflow-hidden ${state === 'loading' ? 'skeleton-shimmer' : 'bg-slate-100'} ${className}`}>
      {state === 'error' ? (
        <MediaFallback kind={kind} label={fallbackLabel} seed={seed} monogram={monogram} />
      ) : (
        <img
          key={currentSrc}
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          onLoad={() => setState('ready')}
          onError={handleError}
          className={`h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out
            ${state === 'ready' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
          {...rest}
        />
      )}
    </div>
  );
}

/** Ảnh đại diện thợ, có chữ viết tắt khi không tải được ảnh. */
export function StylistAvatar({ id, name, url, gender, size = 'h-10 w-10', className = '' }: {
  id: string; name: string; url?: string | null; gender?: StylistGender | null; size?: string; className?: string;
}) {
  const src = stylistPhoto(id, url, gender);
  const [broken, setBroken] = useState(isOffline);
  const [loaded, setLoaded] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (src !== trackedSrc) { setTrackedSrc(src); setBroken(isOffline()); setLoaded(false); }
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    const s = readyState(img); if (s === 'ready') setLoaded(true); else if (s === 'error') setBroken(true);
  }, []);
  useEffect(() => {
    if (loaded || broken || !src) return;
    const timer = window.setTimeout(() => setBroken(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, broken, trackedSrc, src]);
  if (broken || !src) {
    return (
      <span className={`${size} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-teal-100 to-teal-50 text-xs font-semibold text-teal-800 ring-2 ring-white ${className}`}
            role="img" aria-label={name}>
        <SeedGradient seed={id} />
        <span className="relative">{initials(name ?? '')}</span>
      </span>
    );
  }
  return (
    <span className={`${size} relative inline-block shrink-0 overflow-hidden rounded-full ring-2 ring-white ${loaded ? 'bg-slate-100' : 'skeleton-shimmer'} ${className}`}>
      <img ref={imgRef} src={src} alt={name} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setBroken(true)}
           className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
    </span>
  );
}
