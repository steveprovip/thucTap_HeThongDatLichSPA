import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** Mã bản dựng, do vite.config.ts gắn lúc build ('dev' khi chạy npm run dev). */
const BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev';
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * Báo "có phiên bản mới" cho thiết bị đang mở sẵn trang: sau khi cập nhật hệ thống (git push → tự build, hoặc update_project.bat)
 * máy bàn, laptop và điện thoại không phải tự nghĩ ra việc tải lại trang. Hỏi tệp /version.json (không cache) mỗi 5 phút
 * và mỗi khi tab hiện lại. KHÔNG tự tải lại để khỏi làm mất phiếu/biểu mẫu nhân viên đang nhập dở.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (BUILD_ID === 'dev') return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data: { id?: string } = await res.json();
        if (!cancelled && data.id && data.id !== BUILD_ID) setAvailable(true);
      } catch { /* mất mạng hoặc chưa có tệp: bỏ qua, lần sau hỏi lại */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!available || dismissed) return null;
  return (
    <div role="alert" className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brand-200 bg-white p-3 shadow-lg sm:left-auto sm:right-4">
      <RefreshCw size={18} className="shrink-0 text-brand-700" aria-hidden />
      <p className="flex-1 text-sm text-slate-700">Hệ thống vừa có phiên bản mới.</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Tải lại</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)}>Để sau</button>
    </div>
  );
}
