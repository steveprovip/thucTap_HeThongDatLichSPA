import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, LogIn, Mail } from 'lucide-react';
import { Modal } from './Modal';
import { Button, Notice } from './ui';

/** Sao chép vào clipboard; trình duyệt cũ / không phải HTTPS thì dùng textarea tạm. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* thử cách dự phòng */ }
  try {
    const el = document.createElement('textarea');
    el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch { return false; }
}

export interface TempCredential {
  fullName: string;
  email: string;
  /** null khi máy chủ không trả mật khẩu (chỉ gửi qua email). */
  password: string | null;
  kind?: 'created' | 'reset';
}

/**
 * Lỗi 4: sau khi tạo / cấp lại tài khoản, hiển thị NGAY email + mật khẩu tạm để quản trị viên
 * sao chép, gửi cho nhân sự và đăng nhập thử — không phải mò trong hộp thư.
 */
export function TempPasswordDialog({ credential, onClose }: { credential: TempCredential | null; onClose: () => void }) {
  const [copied, setCopied] = useState<'password' | 'both' | null>(null);
  useEffect(() => { setCopied(null); }, [credential]);
  if (!credential) return null;
  const { fullName, email, password, kind = 'created' } = credential;

  const copy = async (what: 'password' | 'both') => {
    const ok = await copyText(what === 'password' ? password ?? '' : `Email: ${email}\nMật khẩu tạm: ${password ?? ''}`);
    if (ok) { setCopied(what); window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000); }
  };

  return (
    <Modal
      open
      size="sm"
      title={kind === 'created' ? 'Tạo tài khoản thành công' : 'Đã cấp lại mật khẩu tạm'}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {password && (
            <Button variant="outline" icon={copied === 'both' ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy('both')}>
              {copied === 'both' ? 'Đã sao chép' : 'Sao chép email + mật khẩu'}
            </Button>
          )}
          <Button onClick={onClose}>Xong</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-center">
          <span className="animate-fade-in-scale mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
            <CheckCircle2 size={30} />
          </span>
          <p className="mt-3 text-lg font-bold text-slate-900">
            {kind === 'created' ? 'Nhân sự mới đã được tạo thành công!' : 'Mật khẩu tạm mới đã được tạo!'}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{fullName}</p>
        </div>

        <dl className="stagger space-y-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted"><Mail size={13} /> Email đăng nhập</dt>
            <dd className="mt-0.5 break-all font-mono text-sm font-semibold text-slate-900">{email}</dd>
          </div>
          {password ? (
            <div className="rounded-xl border-2 border-teal-200 bg-teal-50/60 px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-700"><KeyRound size={13} /> Mật khẩu tạm</dt>
              <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="select-all font-mono text-xl font-bold tracking-wider text-slate-900" data-testid="temp-password">{password}</span>
                <Button size="sm" icon={copied === 'password' ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy('password')}
                        className={copied === 'password' ? '!bg-emerald-600' : ''}>
                  {copied === 'password' ? 'Đã sao chép' : 'Sao chép mật khẩu'}
                </Button>
              </dd>
            </div>
          ) : (
            <Notice tone="info">Mật khẩu tạm đã được gửi tới email trên (môi trường dev: xem tại Maildev http://localhost:1080).</Notice>
          )}
        </dl>

        <Notice tone="warning" icon={<LogIn size={15} />}>
          Mật khẩu chỉ hiển thị <strong>một lần</strong>. Ở lần đăng nhập đầu tiên, nhân sự sẽ bắt buộc đổi sang mật khẩu riêng.
        </Notice>
      </div>
    </Modal>
  );
}
