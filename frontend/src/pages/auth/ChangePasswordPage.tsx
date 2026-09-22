import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Button, Card, Field, Input, SectionTitle } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** S1-04 + S1-02: đổi mật khẩu, bắt buộc ở lần đăng nhập đầu tiên. */
export function ChangePasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!STRONG.test(next)) return setError('Mật khẩu mới phải có tối thiểu 8 ký tự, gồm cả chữ và số');
    if (next !== confirm) return setError('Hai lần nhập mật khẩu mới không khớp');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      await refreshUser();
      toast.success('Đã đổi mật khẩu');
      navigate('/quan-ly', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <SectionTitle title="Đổi mật khẩu" description="Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số." />

      {user?.mustChangePassword && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          Đây là lần đăng nhập đầu tiên với mật khẩu tạm. Bạn cần đổi mật khẩu trước khi dùng các chức năng khác.
        </p>
      )}

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mật khẩu hiện tại" required htmlFor="cp-cur">
            <Input id="cp-cur" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Mật khẩu mới" required htmlFor="cp-new">
            <Input id="cp-new" type="password" required value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Nhập lại mật khẩu mới" required htmlFor="cp-cf">
            <Input id="cp-cf" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <Button type="submit" loading={busy} icon={<KeyRound size={16} />}>Đổi mật khẩu</Button>
        </form>
      </Card>
    </div>
  );
}
