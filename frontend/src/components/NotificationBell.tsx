import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsApi } from '@/api';
import type { AppNotification } from '@/types';
import { formatDateTime } from '@/utils/format';

/** Chuông thông báo trong ứng dụng cho nhân sự (S4-06). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadCount = useCallback(async () => {
    try { setCount(await notificationsApi.unreadCount()); } catch { /* bỏ qua */ }
  }, []);

  useEffect(() => {
    void loadCount();
    const id = window.setInterval(loadCount, 60_000);
    return () => window.clearInterval(id);
  }, [loadCount]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await notificationsApi.list(1, 15);
        setItems(res.items);
        await notificationsApi.markAllRead();
        setCount(0);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={toggle}
        className="tap-44 relative inline-flex items-center justify-center rounded-xl p-2 text-ink-soft hover:bg-brand-50"
        aria-label={`Thông báo${count > 0 ? `, ${count} chưa đọc` : ''}`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center
                           rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-fade-in-scale fixed inset-x-3 top-16 z-40 origin-top-right sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold">Thông báo</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && <p className="px-4 py-6 text-center text-sm text-ink-muted">Đang tải…</p>}
            {!loading && items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">Chưa có thông báo nào</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (n.appointmentId) navigate(`/quan-ly/lich-hen/${n.appointmentId}`);
                }}
                className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-brand-50/60"
              >
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-soft">{n.body}</p>
                <p className="mt-1 text-[11px] text-ink-muted">{formatDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
