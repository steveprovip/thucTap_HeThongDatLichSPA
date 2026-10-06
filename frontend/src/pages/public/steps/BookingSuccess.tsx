import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Copy, Mail, MailCheck, PartyPopper, Printer } from 'lucide-react';
import type { BookingResult } from '@/types';
import { getErrorMessage, publicApi } from '@/api';
import { Button, Card, Input } from '@/components';
import { emailError } from '@/utils/validators';
import { formatDuration, formatVnd } from '@/utils/format';
import { SALON } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

export function BookingSuccess({ result, onBookAgain, phone, email }: {
  result: BookingResult; onBookAgain: () => void; phone: string; email?: string;
}) {
  const toast = useToast();
  // Mentor S2 · mục 10: khách chưa nhập email vẫn nhận được xác nhận qua email ngay tại màn hình này
  const [mailTo, setMailTo] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(result.emailQueued ? email ?? null : null);
  const [sending, setSending] = useState(false);
  const mailError = mailTo ? emailError(mailTo, true) : null;
  const sendMail = async () => {
    if (!mailTo || mailError) return;
    setSending(true);
    try {
      const res = await publicApi.sendConfirmationEmail({ code: result.code, phone, email: mailTo.trim() });
      setSentTo(res.toEmail);
      toast.success(`Đã gửi email xác nhận tới ${res.toEmail}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      toast.success('Đã sao chép mã tra cứu');
    } catch {
      toast.warning('Trình duyệt không cho sao chép, bạn ghi lại mã giúp tiệm nhé');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="ticket-print overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-7 text-center text-white">
          <PartyPopper size={34} className="mx-auto" />
          <h2 className="mt-2 text-xl font-bold">Tiệm đã nhận lịch của bạn</h2>
          <p className="mt-1 text-sm text-white/85">
            {result.status === 'pending'
              ? 'Tiệm sẽ xác nhận trong thời gian sớm nhất.'
              : 'Lịch hẹn đã được xác nhận.'}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/50 px-4 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Mã tra cứu</p>
            <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-slate-900">{result.code}</p>
            <Button variant="ghost" size="sm" className="mt-1.5" onClick={copyCode} icon={<Copy size={14} />}>
              Sao chép mã
            </Button>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Thời gian</dt>
              <dd className="text-right font-semibold">{result.startAtText}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Dự kiến xong</dt>
              <dd className="font-semibold">{result.endTime}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Thợ phụ trách</dt>
              <dd className="font-semibold">{result.stylistName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Tổng thời lượng</dt>
              <dd className="font-semibold">{formatDuration(result.totalDurationMinutes)}</dd>
            </div>
          </dl>

          <ul className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            {result.services.map((s) => (
              <li key={s.name} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="shrink-0">{formatVnd(s.price)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-bold">
              <span>Tạm tính</span>
              <span className="text-slate-900">{formatVnd(result.estimatedTotal)}</span>
            </li>
          </ul>

          {sentTo ? (
            <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs text-blue-900" role="status">
              <MailCheck size={15} className="mt-px shrink-0" />
              <span>
                Đã gửi email xác nhận{sentTo ? <> tới <strong>{sentTo}</strong></> : ''} (mã tra cứu, đường đi, liên kết đổi/huỷ lịch,
                thêm vào Google Calendar). Tiệm cũng sẽ gửi email nhắc trước giờ hẹn 24 giờ.
              </span>
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 print:hidden">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink"><Mail size={14} /> Nhận xác nhận lịch hẹn qua email</p>
              <div className="flex gap-2">
                <Input type="email" placeholder="ban@example.com" value={mailTo} onChange={(e) => setMailTo(e.target.value)}
                       aria-label="Email nhận xác nhận" invalid={!!mailError} className="min-h-[40px]" autoComplete="email" />
                <Button size="sm" loading={sending} disabled={!mailTo || !!mailError} onClick={sendMail}>Gửi</Button>
              </div>
              {mailError && <p className="field-error">{mailError}</p>}
            </div>
          )}
          {result.nameConflict && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              Số điện thoại này đã có hồ sơ với tên khác. Tiệm giữ nguyên tên trên hồ sơ cũ và sẽ hỏi lại khi bạn tới.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Link to={`/tra-cuu?code=${result.code}`} className="btn-primary flex-1">
              <CalendarCheck size={17} /> Xem hoặc huỷ lịch
            </Link>
            <Button variant="outline" className="flex-1" onClick={onBookAgain}>Đặt thêm lịch khác</Button>
            <Button variant="secondary" className="flex-1" icon={<Printer size={16} />} onClick={() => window.print()}>In phiếu hẹn</Button>
          </div>

          <p className="text-center text-xs text-ink-muted">
            Cần đổi gấp? Gọi tiệm {SALON.hotline}
          </p>
        </div>
      </Card>
    </div>
  );
}
