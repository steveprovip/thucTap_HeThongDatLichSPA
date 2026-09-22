import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Button, Card, Field, Input } from '@/components';
import { useToast } from '@/contexts/ToastContext';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!STRONG.test(pw)) return setError('Mật khẩu phải có tối thiểu 8 ký tự, gồm cả chữ và số');
    if (pw !== confirm) return setError('Hai lần nhập mật khẩu không khớp');
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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md p-6 text-center">
          <p className="font-semibold">Liên kết đặt lại mật khẩu không hợp lệ</p>
          <Link to="/quen-mat-khau" className="btn btn-outline mt-4">Yêu cầu liên kết mới</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-8">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h1 className="text-lg font-bold">Đặt lại mật khẩu</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Sau khi đổi, mọi phiên đăng nhập cũ của tài khoản sẽ bị huỷ.
            </p>
          </div>
          <Field label="Mật khẩu mới" required htmlFor="rs-pw"
                 hint="Tối thiểu 8 ký tự, gồm cả chữ và số">
            <Input id="rs-pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Nhập lại mật khẩu mới" required htmlFor="rs-cf">
            <Input id="rs-cf" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <Button type="submit" block loading={busy} icon={<KeyRound size={16} />}>Đổi mật khẩu</Button>
        </form>
      </Card>
    </div>
  );
}
