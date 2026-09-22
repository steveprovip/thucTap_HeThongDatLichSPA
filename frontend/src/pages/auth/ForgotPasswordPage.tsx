import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, Send } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Button, Card, Field, Input } from '@/components';
import { useToast } from '@/contexts/ToastContext';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSent(true);
      toast.success(res.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="p-5 sm:p-6">
          {sent ? (
            <div className="text-center">
              <MailCheck size={34} className="mx-auto text-green-600" />
              <h1 className="mt-2 text-lg font-bold">Kiểm tra hộp thư của bạn</h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.
                Liên kết hết hạn sau 30 phút và chỉ dùng được một lần.
              </p>
              <Link to="/dang-nhap" className="btn btn-outline mt-5">Quay lại đăng nhập</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-lg font-bold">Quên mật khẩu</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Nhập email tài khoản, tiệm sẽ gửi liên kết đặt lại mật khẩu.
                </p>
              </div>
              <Field label="Email" required htmlFor="fp-email">
                <Input id="fp-email" type="email" required value={email}
                       onChange={(e) => setEmail(e.target.value)} placeholder="ten@salon.vn" />
              </Field>
              <Button type="submit" block loading={busy} icon={<Send size={16} />}>Gửi liên kết đặt lại</Button>
              <Link to="/dang-nhap" className="block text-center text-sm text-ink-muted hover:underline">
                Quay lại đăng nhập
              </Link>
            </form>
          )}
        </Card>
        <p className="mt-3 text-center text-xs text-ink-muted">
          Tối đa 3 lần gửi lại trong một giờ cho cùng một email.
        </p>
      </div>
    </div>
  );
}
