import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck, RotateCw, Send } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { DEMO_MODE } from '@/api/mockBackend';
import { Button, Card, Field, Input, Notice } from '@/components';
import { useToast } from '@/contexts/ToastContext';
import { emailError as validateEmail } from '@/utils/validators';
import { AuthShell } from './AuthShell';

const RESEND_COOLDOWN_S = 60;
const MAX_SENDS_PER_HOUR = 3;

export function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sends, setSends] = useState<number[]>([]);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const emailError = validateEmail(email); // QA-02: chặn chữ có dấu / ký tự đặc biệt nguy hiểm
  const recentSends = sends.filter((t) => Date.now() - t < 3600_000);
  const limitReached = recentSends.length >= MAX_SENDS_PER_HOUR;

  const send = async (target: string) => {
    if (limitReached) return toast.warning(`Đã gửi ${MAX_SENDS_PER_HOUR} lần trong một giờ, vui lòng thử lại sau`);
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(target);
      setSentTo(target);
      setSends((l) => [...l, Date.now()]);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(res.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    void send(email.trim());
  };

  return (
    <AuthShell
      footer={
        <p className="mt-3 text-center text-xs text-ink-muted">
          Tối đa {MAX_SENDS_PER_HOUR} lần gửi trong một giờ cho cùng một email.
        </p>
      }
    >
      <Card className="p-5 sm:p-6">
        {sentTo ? (
          <div className="text-center">
            <MailCheck size={38} className="mx-auto text-emerald-600" />
            <h1 className="mt-2 text-lg font-bold">Kiểm tra hộp thư của bạn</h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              Nếu <strong className="text-ink">{sentTo}</strong> có trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.
              Liên kết hết hạn sau 30 phút và chỉ dùng được một lần.
            </p>

            {DEMO_MODE && (
              <Notice tone="info" className="mt-4 text-left" title="Bản demo không gửi email thật">
                <Link to="/dat-lai-mat-khau?token=demo-token" className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline">
                  <KeyRound size={14} /> Mở trang đặt lại mật khẩu
                </Link>
              </Notice>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" icon={<RotateCw size={15} />} disabled={cooldown > 0 || limitReached}
                      loading={busy} onClick={() => send(sentTo)}>
                {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : limitReached ? 'Đã hết lượt gửi' : 'Gửi lại'}
              </Button>
              <Button variant="ghost" onClick={() => { setSentTo(null); setTouched(false); }}>Dùng email khác</Button>
            </div>
            <Link to="/dang-nhap" className="mt-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:underline">
              <ArrowLeft size={14} /> Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <h1 className="text-xl font-bold">Quên mật khẩu</h1>
              <p className="mt-1 text-sm text-ink-muted">Nhập email tài khoản nhân sự, tiệm sẽ gửi liên kết đặt lại mật khẩu.</p>
            </div>
            <Field label="Email" required htmlFor="fp-email" error={touched ? emailError : undefined}>
              <Input id="fp-email" type="email" autoFocus autoComplete="email" value={email} placeholder="ten@salon.vn"
                     invalid={touched && !!emailError} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" block loading={busy} icon={<Send size={16} />}>Gửi liên kết đặt lại</Button>
            <Link to="/dang-nhap" className="flex items-center justify-center gap-1 text-sm text-ink-muted hover:underline">
              <ArrowLeft size={14} /> Quay lại đăng nhập
            </Link>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
