import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarPlus, Copy, Download, Mail, MailCheck, Printer, ShieldCheck } from 'lucide-react';
import type { BookingResult } from '@/types';
import { getErrorMessage, publicApi } from '@/api';
import { Button, Card, Input, LotusMark, VietQrCode } from '@/components';
import { DEPOSIT_THRESHOLD, depositAmount, depositTransferNote } from '@/utils/opsHelpers';
import { emailError } from '@/utils/validators';
import { formatDuration, formatVnd } from '@/utils/format';
import { SALON } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';
import { useSalonInfo } from '@/utils/salonInfo';
import { downloadIcs, googleCalendarUrl, type CalendarEvent } from '@/utils/calendarExport';

export function BookingSuccess({ result, onBookAgain, phone, email }: {
  result: BookingResult; onBookAgain: () => void; phone: string; email?: string;
}) {
  const toast = useToast();
  // Mentor S2 · mục 10: khách chưa nhập email vẫn nhận được xác nhận qua email ngay tại màn hình này
  const [mailTo, setMailTo] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(result.emailQueued ? email ?? null : null);
  const [sending, setSending] = useState(false);
  const mailError = mailTo ? emailError(mailTo, true) : null;
  // Chính sách cọc chống bùng lịch: lịch > 500.000 đ cọc 30% qua VietQR, nội dung "COC <SĐT> <MÃ LỊCH>"
  const deposit = depositAmount(result.estimatedTotal);
  const depositNote = depositTransferNote(phone, result.code);
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

  // Thêm vào lịch cá nhân: Google Calendar (liên kết) hoặc tệp .ics (Apple Calendar / Outlook / Samsung)
  const info = useSalonInfo().info;
  const salonName = info?.name ?? SALON.name;
  const calendarEvent: CalendarEvent = {
    uid: `${result.code}@huongsen-salon`,
    title: `${salonName} — ${result.services.map((x) => x.name).join(', ')}`,
    date: result.date,
    start: result.startTime,
    end: result.endTime,
    location: info?.address ?? SALON.address,
    details: `Mã tra cứu: ${result.code}\nChuyên viên: ${result.stylistName}\nTạm tính: ${formatVnd(result.estimatedTotal)}\n`
      + `Đổi / huỷ lịch: ${window.location.origin}/tra-cuu?code=${result.code}\nHotline: ${info?.hotline ?? SALON.hotline}`,
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
      <Card className="ticket-print animate-spring-in overflow-hidden">
        <div className="ticket-head relative overflow-hidden px-5 pb-8 pt-9 text-center">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(420px_220px_at_50%_0%,rgb(var(--gold)/0.18),transparent_70%)]" />
          <span className="animate-spring-pop relative mx-auto flex h-16 w-16 items-center justify-center rounded-full text-gold ring-1 ring-gold/40">
            <LotusMark className="h-9 w-9" />
            <span aria-hidden className="absolute inset-1.5 rounded-full ring-1 ring-gold/15" />
          </span>
          <p className="eyebrow relative mt-5">{result.status === 'pending' ? 'Đã nhận lịch' : 'Đã xác nhận'}</p>
          <h2 className="relative mt-2 font-display text-[2.2rem] font-medium leading-tight text-slate-900">
            Hẹn gặp bạn tại <em className="italic text-gold">Hương Sen</em>
          </h2>
          <p className="relative mt-2 text-sm text-slate-500">
            {result.status === 'pending'
              ? 'Tiệm sẽ xác nhận trong thời gian sớm nhất.'
              : 'Lịch hẹn đã được xác nhận.'}
          </p>
          <div aria-hidden className="gold-rule absolute inset-x-10 bottom-0" />
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-dashed border-gold/40 bg-gold/[0.05] px-4 py-5 text-center">
            <p className="eyebrow">Mã tra cứu</p>
            <p className="tnum mt-2 font-mono text-[2rem] font-semibold tracking-[0.28em] text-slate-900">{result.code}</p>
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

          {deposit > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><ShieldCheck size={16} /> Đặt cọc giữ lịch: {formatVnd(deposit)}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                Lịch trên {formatVnd(DEPOSIT_THRESHOLD)} cần cọc 30% để tiệm giữ thợ và khung giờ. Chuyển khoản trong 2 giờ với nội dung
                {' '}<strong className="font-mono">{depositNote}</strong>; tiền cọc được trừ thẳng vào hoá đơn. Huỷ trước giờ hẹn 24 giờ được hoàn cọc.
              </p>
              <VietQrCode amount={deposit} addInfo={depositNote} className="mt-3" />
            </div>
          )}

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

          <div className="grid gap-2 print:hidden sm:grid-cols-2">
            <a href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noreferrer" className="btn-outline rounded-full">
              <CalendarPlus size={16} className="text-gold" /> Thêm vào Google Calendar
            </a>
            <Button variant="outline" className="rounded-full" icon={<Download size={16} className="text-gold" />}
                    onClick={() => downloadIcs(calendarEvent, `lich-hen-${result.code}.ics`)}>
              Apple / Outlook (.ics)
            </Button>
          </div>

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
