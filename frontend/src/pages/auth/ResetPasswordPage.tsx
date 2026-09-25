import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, LinkIcon } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Button, Card, Field, Notice } from '@/components';
import { useToast } from '@/contexts/ToastContext';
import { PASSWORD_RULES } from '@/utils/constants';
import { AuthShell, PasswordInput, PasswordStrength } from './AuthShell';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    pw: !PASSWORD_RULES.every((r) => r.test(pw)) ? 'Mật khẩu chưa đạt đủ yêu cầu' : undefined,
    confirm: confirm !== pw || !confirm ? 'Hai lần nhập mật khẩu không khớp' : undefined,
  };
  const shown: Partial<typeof errors> = touched ? errors : {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (errors.pw || errors.confirm) return;
    setBusy(true);
    try {
      await authApi.resetPassword(token, pw);
      toast.success('Đặt lại mật khẩu thành công, mời bạn đăng nhập lại');
      navigate('/dang-nhap', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {!token ? (
        <Card className="p-6 text-center">
          <LinkIcon size={32} className="mx-auto text-teal-600" />
          <p className="mt-2 font-semibold">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn</p>
          <Link to="/quen-mat-khau" className="btn btn-outline mt-4">Yêu cầu liên kết mới</Link>
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <h1 className="text-xl font-bold">Đặt lại mật khẩu</h1>
              <p className="mt-1 text-sm text-ink-muted">Sau khi đổi, mọi phiên đăng nhập cũ của tài khoản sẽ bị huỷ.</p>
            </div>
            <div>
              <Field label="Mật khẩu mới" required htmlFor="rs-pw" error={shown.pw}>
                <PasswordInput id="rs-pw" autoComplete="new-password" value={pw} invalid={!!shown.pw}
                               onChange={(e) => setPw(e.target.value)} />
              </Field>
              <PasswordStrength value={pw} />
            </div>
            <Field label="Nhập lại mật khẩu mới" required htmlFor="rs-cf" error={shown.confirm}>
              <PasswordInput id="rs-cf" autoComplete="new-password" value={confirm} invalid={!!shown.confirm}
                             onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" block loading={busy} icon={<KeyRound size={16} />}>Đổi mật khẩu</Button>
            <Link to="/dang-nhap" className="block text-center text-sm text-ink-muted hover:underline">Quay lại đăng nhập</Link>
          </form>
        </Card>
      )}
    </AuthShell>
  );
}
