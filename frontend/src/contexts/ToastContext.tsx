import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} className="shrink-0" />,
  error: <XCircle size={18} className="shrink-0" />,
  warning: <AlertTriangle size={18} className="shrink-0" />,
  info: <Info size={18} className="shrink-0" />,
};

const STYLES: Record<ToastKind, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-slate-900 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const recent = useRef(new Map<string, number>());

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      // Bỏ thông báo trùng lặp bắn liên tiếp (StrictMode chạy effect 2 lần, nhiều API cùng lỗi một lúc)
      const key = `${kind}|${message}`;
      const now = Date.now();
      if ((recent.current.get(key) ?? 0) > now - 2500) return;
      recent.current.set(key, now);
      const id = ++seq.current;
      setToasts((list) => [...list, { id, kind, message }]);
      window.setTimeout(() => remove(id), kind === 'error' ? 7000 : 4000);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, 'success'),
      error: (m: string) => toast(m, 'error'),
      warning: (m: string) => toast(m, 'warning'),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-3 bottom-3 z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-pop ${STYLES[t.kind]}`}
          >
            {ICONS[t.kind]}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Đóng thông báo"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong ToastProvider');
  return ctx;
}
