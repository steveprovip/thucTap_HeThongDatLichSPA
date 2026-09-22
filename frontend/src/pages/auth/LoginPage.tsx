import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '@/api';
import { Button, Card, Field, Input } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { SALON } from '@/utils/constants';

const LANDING: Record<string, string> = {
  admin: '/quan-ly/tai-khoan',
  owner: '/quan-ly/tong-quan',
  receptionist: '/quan-ly',
  stylist: '/quan-ly/lich-cua-toi',
  customer: '/',
};

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate(user.mustChangePassword ? '/quan-ly/doi-mat-khau' : LANDING[user.role], { replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Xin chào ${u.fullName}`);
      navigate(u.mustChangePassword ? '/quan-ly/doi-mat-khau' : LANDING[u.role], { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Email hoặc mật khẩu không đúng'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-base font-bold text-white">
            HS
          </span>
          <h1 className="mt-3 text-xl font-bold">{SALON.name}</h1>
          <p className="text-sm text-ink-muted">Khu vực dành cho nhân sự của tiệm</p>
        </div>

        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" required htmlFor="lg-email">
              <Input
                id="lg-email" type="email" autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@salon.vn" invalid={!!error}
              />
            </Field>

            <Field label="Mật khẩu" required htmlFor="lg-pass">
              <div className="relative">
                <Input
                  id="lg-pass" type={show ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="pr-11" invalid={!!error}
                />
                <button type="button" onClick={() => setShow((s) => !s)}
                        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-muted hover:bg-brand-50">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">{error}</p>
            )}

            <Button type="submit" block loading={busy} icon={<LogIn size={17} />}>Đăng nhập</Button>

            <div className="flex items-center justify-between text-sm">
              <Link to="/quen-mat-khau" className="text-brand-700 hover:underline">Quên mật khẩu?</Link>
              <Link to="/" className="text-ink-muted hover:underline">Về trang khách</Link>
            </div>
          </form>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <ShieldCheck size={14} /> Sai mật khẩu 5 lần liên tiếp, tài khoản sẽ bị khoá 15 phút.
        </p>
      </div>
    </div>
  );
}
