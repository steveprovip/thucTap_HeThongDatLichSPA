import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ContentSkeleton } from './Skeleton';
import type { AppointmentStatus } from '@/types';
import { STATUS_STYLES, STATUS_LABELS } from '@/utils/constants';
export { formatVND } from '@/utils/format';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary', size = 'md', loading, icon, block, className = '', children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      className={`${VARIANT_CLASS[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, error, hint, required, children, htmlFor }: FieldProps) {
  return (
    <div>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="field-error">{error}</p>
        : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className = '', invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={`field-input ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500/25' : ''} ${className}`}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className = '', invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`field-input py-2.5 min-h-[88px] resize-y ${invalid ? 'border-red-400' : ''} ${className}`}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className = '', invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={`field-input pr-8 ${invalid ? 'border-red-400' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>;
}

/** Trạng thái đang tải: khung skeleton có shimmer (thay cho vòng xoay). */
export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return <ContentSkeleton label={label} />;
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Badge({ className = '', children, status }: { className?: string; children?: ReactNode; status?: AppointmentStatus }) {
  return <span className={`chip border ${status ? STATUS_STYLES[status] : ''} ${className}`}>{children ?? (status ? STATUS_LABELS[status] : null)}</span>;
}

export function SectionTitle({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

/** Hộp thông báo nội tuyến theo tông sáng (pastel). */
export function Notice({ tone = 'info', icon, title, children, className = '' }: {
  tone?: NoticeTone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'}
         className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${NOTICE_TONES[tone]} ${className}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  );
}

/** Công tắc bật/tắt dạng switch, dùng cho trạng thái hoạt động. */
export function Toggle({ checked, onChange, disabled, label, size = 'md' }: {
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label?: string; size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`hit-44 relative inline-flex shrink-0 items-center rounded-full border transition-colors ${track}
        ${checked ? 'border-teal-600 bg-teal-600' : 'border-slate-300 bg-slate-200'}
        disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`inline-block transform rounded-full bg-white shadow transition-transform ${knob}
        ${checked ? shift : 'translate-x-0.5'}`} />
    </button>
  );
}
