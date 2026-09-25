import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '@/api';
import { DEMO_MODE } from '@/api/mockBackend';
import { Button, Card, Field, Input, Notice } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ROLE_LABELS, ROLE_LANDING } from '@/utils/constants';
import { AuthShell, DemoRoleButtons, PasswordInput } from './AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const justLoggedIn = useRef(false);

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

  const fieldErrors = {
    email: !email.trim() ? 'Vui lòng nhập email' : !EMAIL_RE.test(email.trim()) ? 'Email không hợp lệ' : undefined,
    password: !password ? 'Vui lòng nhập mật khẩu' : undefined,
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
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (fieldErrors.email || fieldErrors.password) return;
    setBusy(true);
    await doLogin(email.trim(), password);
    setBusy(false);
  };

  const quickLogin = async (mail: string, role: string) => {
    setEmail(mail); setPassword('demo1234'); setBusyRole(role);
    await doLogin(mail, 'demo1234');
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

          {error && <Notice tone="danger">{error}</Notice>}

          <Button type="submit" block loading={busy} icon={<LogIn size={17} />}>Đăng nhập</Button>

          <div className="flex items-center justify-between text-sm">
            <Link to="/quen-mat-khau" className="text-teal-700 hover:underline">Quên mật khẩu?</Link>
            <Link to="/" className="text-ink-muted hover:underline">Về trang khách</Link>
          </div>
        </form>
      </Card>

      {DEMO_MODE && (
        <div className="mt-4">
          <DemoRoleButtons
            busyRole={busyRole}
            onPick={quickLogin}
            onCustomer={() => { setDemoRole('customer'); navigate('/dat-lich'); }}
          />
        </div>
      )}
    </AuthShell>
  );
}
