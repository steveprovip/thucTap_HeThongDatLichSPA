import { Link } from 'react-router-dom';
import { CalendarCheck, Copy, PartyPopper } from 'lucide-react';
import type { BookingResult } from '@/types';
import { Button, Card } from '@/components';
import { formatDuration, formatVnd } from '@/utils/format';
import { SALON } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

export function BookingSuccess({ result, onBookAgain }: { result: BookingResult; onBookAgain: () => void }) {
  const toast = useToast();

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
      <Card className="overflow-hidden">
        <div className="bg-green-600 px-5 py-6 text-center text-white">
          <PartyPopper size={34} className="mx-auto" />
          <h2 className="mt-2 text-xl font-bold">Tiệm đã nhận lịch của bạn</h2>
          <p className="mt-1 text-sm text-white/85">
            {result.status === 'pending'
              ? 'Tiệm sẽ xác nhận trong thời gian sớm nhất.'
              : 'Lịch hẹn đã được xác nhận.'}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Mã tra cứu</p>
            <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-brand-900">{result.code}</p>
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

          <ul className="space-y-1 border-t border-brand-100 pt-3 text-sm">
            {result.services.map((s) => (
              <li key={s.name} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="shrink-0">{formatVnd(s.price)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-brand-100 pt-2 font-bold">
              <span>Tạm tính</span>
              <span className="text-brand-800">{formatVnd(result.estimatedTotal)}</span>
            </li>
          </ul>

          {result.emailQueued && (
            <p className="rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs text-blue-900">
              Email xác nhận đang được gửi tới hộp thư của bạn. Tiệm cũng sẽ gửi email nhắc trước giờ hẹn 24 giờ.
            </p>
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
          </div>

          <p className="text-center text-xs text-ink-muted">
            Cần đổi gấp? Gọi tiệm {SALON.hotline}
          </p>
        </div>
      </Card>
    </div>
  );
}
