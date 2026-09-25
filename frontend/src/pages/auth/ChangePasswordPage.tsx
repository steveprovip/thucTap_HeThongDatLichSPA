import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Button, Card, Field, Notice, SectionTitle } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PASSWORD_RULES, ROLE_LABELS, ROLE_LANDING } from '@/utils/constants';
import { PasswordInput, PasswordStrength } from './AuthShell';

/** S1-04 + S1-02: đổi mật khẩu, bắt buộc ở lần đăng nhập đầu tiên với mật khẩu tạm. */
export function ChangePasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const differs = !!next && next !== current;
  const errors = {
    current: !current ? 'Vui lòng nhập mật khẩu hiện tại' : undefined,
    next: !PASSWORD_RULES.every((r) => r.test(next)) ? 'Mật khẩu mới chưa đạt đủ yêu cầu'
      : !differs ? 'Mật khẩu mới phải khác mật khẩu hiện tại' : undefined,
    confirm: !confirm ? 'Vui lòng nhập lại mật khẩu mới' : confirm !== next ? 'Hai lần nhập không khớp' : undefined,
  };
  const shown: Partial<typeof errors> = touched ? errors : {};
  const landing = user ? ROLE_LANDING[user.role] ?? '/quan-ly' : '/quan-ly';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      await refreshUser();
      toast.success('Đã đổi mật khẩu');
      setDone(true);
      setCurrent(''); setNext(''); setConfirm(''); setTouched(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <SectionTitle
        title="Đổi mật khẩu"
        description={user ? `${user.fullName} · ${ROLE_LABELS[user.role]} · ${user.email}` : undefined}
      />

      {user?.mustChangePassword && (
        <Notice tone="warning" icon={<ShieldAlert size={16} />} title="Bắt buộc đổi mật khẩu">
          Bạn đang dùng mật khẩu tạm. Hãy đổi mật khẩu trước khi dùng các chức năng khác.
        </Notice>
      )}

      {done ? (
        <Card className="p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
          <p className="mt-2 text-lg font-bold">Đổi mật khẩu thành công</p>
          <p className="mt-1 text-sm text-ink-muted">Các phiên đăng nhập trên thiết bị khác sẽ phải đăng nhập lại.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => navigate(landing, { replace: true })}>Về trang làm việc</Button>
            <Button variant="ghost" onClick={() => setDone(false)}>Đổi lần nữa</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Mật khẩu hiện tại" required htmlFor="cp-cur" error={shown.current}>
              <PasswordInput id="cp-cur" autoComplete="current-password" value={current} invalid={!!shown.current}
                             onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <div>
              <Field label="Mật khẩu mới" required htmlFor="cp-new" error={shown.next}>
                <PasswordInput id="cp-new" autoComplete="new-password" value={next} invalid={!!shown.next}
                               onChange={(e) => setNext(e.target.value)} />
              </Field>
              <PasswordStrength value={next} extra={[{ id: 'diff', label: 'Khác mật khẩu hiện tại', ok: differs }]} />
            </div>
            <Field label="Nhập lại mật khẩu mới" required htmlFor="cp-cf" error={shown.confirm}
                   hint={confirm && confirm === next ? '✓ Khớp' : undefined}>
              <PasswordInput id="cp-cf" autoComplete="new-password" value={confirm} invalid={!!shown.confirm}
                             onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} icon={<KeyRound size={16} />}>Đổi mật khẩu</Button>
              {!user?.mustChangePassword && (
                <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Huỷ</Button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
