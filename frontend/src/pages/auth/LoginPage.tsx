import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api';
import { DEMO_MODE } from '@/api/mockBackend';
import { Button, Card, Field, Input, Notice } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ROLE_LABELS, ROLE_LANDING } from '@/utils/constants';
import { emailError, passwordCharsetError } from '@/utils/validators';
import { AuthShell, DemoRoleButtons, PasswordInput } from './AuthShell';

/** 'mm:ss' còn lại tới lúc mở khoá. */
const countdown = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function LoginPage() {
  const { login, logout, user, setDemoRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** QA-01: tài khoản đang tạm khoá -> chuyển giao diện sang trạng thái "khoá" có đếm ngược. */
  const [lock, setLock] = useState<{ email: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const justLoggedIn = useRef(false);

  const locked = !!lock && lock.email === email.trim().toLowerCase() && lock.until > now;
  useEffect(() => {
    if (!lock) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lock.until) setLock(null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [lock]);

  /** Trang người dùng định vào trước khi bị chuyển sang đăng nhập. */
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const goLanding = (role: string, mustChange: boolean) => {
    const target = mustChange ? '/quan-ly/doi-mat-khau'
      : from && from.startsWith('/quan-ly') ? from : ROLE_LANDING[role] ?? '/';
    navigate(target, { replace: true });
  };

  useEffect(() => {
    if (user && justLoggedIn.current) goLanding(user.role, user.mustChangePassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // QA-02: chặn chữ có dấu / ký tự nguy hiểm ngay tại ô nhập, trước khi gửi lên máy chủ
  const fieldErrors = {
    email: emailError(email),
    password: !password ? 'Vui lòng nhập mật khẩu' : passwordCharsetError(password),
  };
  const shown: Partial<typeof fieldErrors> = touched ? fieldErrors : {};

  const doLogin = async (mail: string, pw: string) => {
    setError(null);
    try {
      justLoggedIn.current = true;
      const u = await login(mail, pw);
      toast.success(`Xin chào ${u.fullName}`);
      goLanding(u.role, u.mustChangePassword);
    } catch (err) {
      justLoggedIn.current = false;
      if (getErrorCode(err) === 'ACCOUNT_LOCKED') {
        const { lockedUntil, retryAfterSeconds } = getErrorDetails(err);
        const until = lockedUntil ? Date.parse(lockedUntil) : Date.now() + (retryAfterSeconds ?? 900) * 1000;
        setNow(Date.now());
        setLock({ email: mail.trim().toLowerCase(), until });
        setError(null);
        return;
      }
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (fieldErrors.email || fieldErrors.password || locked) return;
    setBusy(true);
    await doLogin(email.trim(), password);
    setBusy(false);
  };

  /** Đăng nhập 1 chạm: điền ĐÚNG email + mật khẩu mẫu của vai trò (DEMO_ACCOUNTS) rồi gửi luôn. */
  const quickLogin = async (mail: string, pw: string, role: string) => {
    setEmail(mail); setPassword(pw); setBusyRole(role); setTouched(false);
    await doLogin(mail, pw);
    setBusyRole(null);
  };

  // Đang có phiên → hỏi tiếp tục hay đổi tài khoản thay vì tự chuyển trang
  if (user && !justLoggedIn.current) {
    return (
      <AuthShell>
        <Card className="p-6 text-center">
          <p className="text-sm text-ink-muted">Bạn đang đăng nhập với</p>
          <p className="mt-1 text-lg font-bold">{user.fullName}</p>
          <p className="text-sm text-teal-700">{ROLE_LABELS[user.role]} · {user.email}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button icon={<ArrowRight size={16} />} onClick={() => goLanding(user.role, user.mustChangePassword)}>Vào trang quản lý</Button>
            <Button variant="outline" icon={<LogOut size={16} />} onClick={() => void logout()}>Đổi tài khoản</Button>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <ShieldCheck size={14} /> Sai mật khẩu 5 lần liên tiếp, tài khoản bị khoá 15 phút.
        </p>
      }
    >
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Đăng nhập</h1>
        <p className="mt-1 text-sm text-ink-muted">Khu vực dành cho nhân sự của tiệm.</p>
      </div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" required htmlFor="lg-email" error={shown.email}>
            <Input id="lg-email" type="email" autoComplete="username" autoFocus value={email}
                   onChange={(e) => setEmail(e.target.value)} placeholder="ten@salon.vn" invalid={!!shown.email || !!error} />
          </Field>

          <Field label="Mật khẩu" required htmlFor="lg-pass" error={shown.password}>
            <PasswordInput id="lg-pass" autoComplete="current-password" value={password}
                           onChange={(e) => setPassword(e.target.value)} invalid={!!shown.password || !!error} />
          </Field>

          {locked && lock ? (
            <Notice tone="warning" icon={<Lock size={16} />} title="Tài khoản đang tạm khoá">
              <p>
                Bạn đã nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau{' '}
                <strong className="font-mono tabular-nums">{countdown(lock.until - now)}</strong>{' '}
                (mở khoá lúc {new Date(lock.until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}).
              </p>
              <p className="mt-1">
                Cần vào ngay? <Link to="/quen-mat-khau" className="font-semibold underline">Đặt lại mật khẩu</Link> hoặc
                liên hệ quản trị viên để mở khoá.
              </p>
            </Notice>
          ) : error && <Notice tone="danger">{error}</Notice>}

          <Button type="submit" block loading={busy} disabled={locked} icon={locked ? <Lock size={17} /> : <LogIn size={17} />}>
            {locked ? `Tạm khoá · ${countdown((lock?.until ?? now) - now)}` : 'Đăng nhập'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <Link to="/quen-mat-khau" className="text-teal-700 hover:underline">Quên mật khẩu?</Link>
            <Link to="/" className="text-ink-muted hover:underline">Về trang khách</Link>
          </div>
        </form>
      </Card>

      {(DEMO_MODE || import.meta.env.DEV) && (
        <div className="mt-4">
          <DemoRoleButtons
            demo={DEMO_MODE}
            busyRole={busyRole}
            onPick={quickLogin}
            onCustomer={DEMO_MODE ? () => { setDemoRole('customer'); navigate('/dat-lich'); } : undefined}
          />
        </div>
      )}
    </AuthShell>
  );
}
