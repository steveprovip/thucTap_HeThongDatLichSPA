import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-scrim/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
         role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className={`relative z-10 flex max-h-[92vh] max-h-[92dvh] w-full ${SIZES[size]} flex-col overflow-hidden
                       animate-fade-in-scale rounded-t-2xl border border-slate-200 bg-white shadow-pop sm:rounded-2xl`}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Đóng"
                  className="tap-44 -mr-2 inline-flex items-center justify-center rounded-lg p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-slate-100 bg-slate-50/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
