import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { copyText } from './TempPasswordDialog';

/**
 * Hiển thị email THỐNG NHẤT trên toàn giao diện (phản hồi QA 11/10): chữ đơn cách cỡ nhỏ, biểu tượng thư,
 * nút sao chép một chạm. Không có email thì hiện `empty` (mặc định "—") thay vì để trống khó hiểu.
 */
export function EmailText({ email, empty = '—', className = '' }: {
  email: string | null | undefined;
  empty?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const value = email?.trim();
  if (!value) return <span className={`text-xs text-slate-400 ${className}`}>{empty}</span>;

  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-xs text-slate-600 ${className}`}>
      <Mail size={12} aria-hidden className="shrink-0 text-slate-400" />
      <a href={`mailto:${value}`} className="truncate hover:text-teal-700 hover:underline" title={value}>{value}</a>
      <button type="button" onClick={() => void copy()} title={copied ? 'Đã sao chép' : 'Sao chép email'}
              aria-label={copied ? `Đã sao chép ${value}` : `Sao chép email ${value}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-teal-700">
        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      </button>
    </span>
  );
}
