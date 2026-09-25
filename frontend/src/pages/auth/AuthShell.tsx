import { ReactNode, forwardRef, useState, InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Check, Eye, EyeOff, Minus, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { Input } from '@/components';
import { DEMO_ACCOUNTS, PASSWORD_RULES, SALON } from '@/utils/constants';

/** Khung chung cho các trang xác thực: cột thương hiệu (màn rộng) + nội dung. */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface-page lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-10 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-200/40 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-600 text-sm font-bold text-white shadow-sm">HS</span>
          <span>
            <span className="block font-bold">{SALON.name}</span>
            <span className="block text-xs text-ink-muted">{SALON.address}</span>
          </span>
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-slate-900">
            Vận hành tiệm gọn gàng,<br /><span className="text-teal-700">khách hài lòng mỗi ngày.</span>
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink-soft">
            <li className="flex items-center gap-2.5"><CalendarCheck size={17} className="text-teal-600" /> Lịch ngày theo từng thợ, check-in một chạm</li>
            <li className="flex items-center gap-2.5"><Sparkles size={17} className="text-teal-600" /> Khách vãng lai và chuyển lịch khẩn cấp</li>
            <li className="flex items-center gap-2.5"><ShieldCheck size={17} className="text-teal-600" /> Phân quyền 5 vai trò, nhật ký chỉ đọc</li>
          </ul>
        </div>
        <p className="relative text-xs text-ink-muted">Hotline {SALON.hotline} · Giờ hiển thị theo múi giờ Việt Nam</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-600 text-sm font-bold text-white shadow-sm">HS</span>
            <span className="font-bold">{SALON.name}</span>
          </Link>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}

/** Ô mật khẩu có nút hiện/ẩn. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function PasswordInput({ className = '', ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} className={`pr-11 ${className}`} {...rest} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-muted hover:bg-slate-100 hover:text-ink">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    );
  },
);

/** Thước đo độ mạnh + danh sách quy tắc mật khẩu. */
export function PasswordStrength({ value, extra = [] }: {
  value: string; extra?: { id: string; label: string; ok: boolean }[];
}) {
  const rules = [...PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(value) })), ...extra];
  let score = rules.filter((r) => r.ok).length;
  if (value.length >= 12) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const max = rules.length + 2;
  const pct = value ? Math.round((score / max) * 100) : 0;
  const level = pct >= 85 ? { label: 'Mạnh', cls: 'bg-emerald-500', text: 'text-emerald-700' }
    : pct >= 60 ? { label: 'Khá', cls: 'bg-teal-500', text: 'text-teal-700' }
      : { label: 'Yếu', cls: 'bg-red-500', text: 'text-red-600' };
  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full transition-all ${level.cls}`} style={{ width: `${pct}%` }} />
        </div>
        {value && <span className={`text-xs font-semibold ${level.text}`}>{level.label}</span>}
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-700' : 'text-ink-muted'}`}>
            {r.ok ? <Check size={13} /> : <Minus size={13} />} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nút đăng nhập nhanh theo vai trò — chỉ hiện ở chế độ demo. */
export function DemoRoleButtons({ onPick, busyRole, onCustomer }: {
  onPick: (email: string, role: string) => void; busyRole?: string | null; onCustomer?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-teal-700">
        <UsersRound size={16} /> Đăng nhập nhanh (bản demo)
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">Dữ liệu mẫu lưu trong trình duyệt, mật khẩu bất kỳ.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((acc) => (
          <button key={acc.role} type="button" disabled={!!busyRole} onClick={() => onPick(acc.email, acc.role)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-teal-600 disabled:opacity-50">
            <span className="block text-sm font-semibold">{busyRole === acc.role ? 'Đang vào…' : acc.label}</span>
            <span className="block truncate text-[11px] text-ink-muted">{acc.hint}</span>
          </button>
        ))}
      </div>
      {onCustomer && (
        <button type="button" onClick={onCustomer}
                className="mt-2 w-full rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-ink-soft hover:border-teal-600 hover:text-teal-700">
          Xem với vai trò Khách → trang đặt lịch
        </button>
      )}
    </div>
  );
}
