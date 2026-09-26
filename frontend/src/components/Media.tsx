import { ImgHTMLAttributes, useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { initials, stylistPhoto } from '@/utils/images';

/**
 * Ảnh đã nằm sẵn trong cache có thể bắn onLoad TRƯỚC khi useEffect chạy; nếu effect sau đó đặt lại
 * trạng thái "loading" thì ảnh kẹt ở opacity-0 mãi mãi. Vì vậy chỉ reset khi src thật sự đổi
 * (so sánh ngay khi render) và đọc img.complete lúc gắn phần tử.
 */
const readyState = (img: HTMLImageElement | null): 'ready' | 'error' | null =>
  img?.complete ? (img.naturalWidth > 0 ? 'ready' : 'error') : null;

/** Ảnh có khung shimmer khi đang tải, hiện dần khi xong, và nền dự phòng (không cần mạng) khi CDN lỗi/offline. */
export function SmartImage({ src, alt, className = '', imgClassName = '', ...rest }: ImgHTMLAttributes<HTMLImageElement> & {
  imgClassName?: string;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(src ? 'loading' : 'error');
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (src !== trackedSrc) { setTrackedSrc(src); setState(src ? 'loading' : 'error'); }
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    const s = readyState(img); if (s) setState(s);
  }, []);
  return (
    <div className={`relative overflow-hidden ${state === 'loading' ? 'skeleton-shimmer' : 'bg-slate-100'} ${className}`}>
      {state === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-100 via-teal-50 to-amber-50 text-teal-500/70">
          <Sparkles size={24} aria-hidden />
          <span className="sr-only">{alt}</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
          className={`h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out
            ${state === 'ready' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
          {...rest}
        />
      )}
    </div>
  );
}

/** Ảnh đại diện thợ, có chữ viết tắt khi không tải được ảnh. */
export function StylistAvatar({ id, name, url, size = 'h-10 w-10', className = '' }: {
  id: string; name: string; url?: string | null; size?: string; className?: string;
}) {
  const src = stylistPhoto(id, url);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (src !== trackedSrc) { setTrackedSrc(src); setBroken(false); setLoaded(false); }
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    const s = readyState(img); if (s === 'ready') setLoaded(true); else if (s === 'error') setBroken(true);
  }, []);
  if (broken) {
    return (
      <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-50 text-xs font-semibold text-teal-800 ring-2 ring-white ${className}`}
            aria-label={name}>
        {initials(name)}
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
