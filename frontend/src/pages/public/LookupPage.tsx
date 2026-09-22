import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarX2, Phone, Search, Star, Ticket } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { PublicAppointment } from '@/types';
import { Button, Card, ConfirmDialog, Field, Input, Spinner, StatusBadge } from '@/components';
import { formatDuration, VN_PHONE_REGEX } from '@/utils/format';
import { SALON } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/** S2-09 tra cứu + S3-05 khách tự huỷ. */
export function LookupPage() {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<'code' | 'phone'>('code');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState<PublicAppointment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PublicAppointment | null>(null);
  const toast = useToast();

  const search = useCallback(async (payload: { code?: string; phone?: string }) => {
    setLoading(true);
    try {
      setItems(await publicApi.lookup(payload));
    } catch (e) {
      setItems([]);
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const initial = params.get('code');
    if (initial) void search({ code: initial });
    // chỉ chạy một lần khi mở trang với tham số code
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'code') {
      if (!code.trim()) return toast.warning('Vui lòng nhập mã tra cứu');
      setParams({ code: code.trim().toUpperCase() });
      void search({ code: code.trim().toUpperCase() });
    } else {
      if (!VN_PHONE_REGEX.test(phone)) return toast.warning('Số điện thoại phải gồm đúng 10 chữ số');
      void search({ phone });
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    try {
      const updated = await publicApi.cancel(cancelTarget.code);
      toast.success('Đã huỷ lịch hẹn. Khung giờ được trả lại cho khách khác.');
      setItems((list) => (list ?? []).map((a) => (a.code === updated.code ? updated : a)));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const canCancel = (a: PublicAppointment) =>
    ['pending', 'confirmed'].includes(a.status);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Tra cứu lịch hẹn</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Nhập mã tra cứu 8 ký tự trong email xác nhận, hoặc số điện thoại đã dùng khi đặt.
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-1">
          {(['code', 'phone'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors
                ${mode === m ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-muted'}`}
            >
              {m === 'code' ? 'Theo mã' : 'Theo số điện thoại'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            {mode === 'code' ? (
              <Field label="Mã tra cứu" htmlFor="lk-code">
                <Input
                  id="lk-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="VD: K7M2QP4X"
                  className="tracking-[0.2em] uppercase"
                />
              </Field>
            ) : (
              <Field label="Số điện thoại" htmlFor="lk-phone">
                <Input
                  id="lk-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="0901234567"
                  inputMode="numeric"
                />
              </Field>
            )}
          </div>
          <Button type="submit" loading={loading} icon={<Search size={16} />}>Tra cứu</Button>
        </form>
      </Card>

      {loading && <Spinner />}

      {!loading && items !== null && items.length === 0 && (
        <Card className="p-8 text-center">
          <CalendarX2 size={30} className="mx-auto text-brand-400" />
          <p className="mt-2 font-semibold">Không tìm thấy lịch hẹn</p>
          <p className="mt-1 text-sm text-ink-muted">
            Kiểm tra lại mã hoặc số điện thoại. Cần hỗ trợ, gọi tiệm {SALON.hotline}.
          </p>
        </Card>
      )}

      {!loading && items?.map((a) => (
        <Card key={a.code} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Ticket size={13} /> Mã <strong className="tracking-widest text-ink">{a.code}</strong>
              </p>
              <p className="mt-1 text-base font-bold">{a.startAtText}</p>
              <p className="text-sm text-ink-soft">
                Dự kiến xong {a.expectedEndText} · {formatDuration(a.totalDurationMinutes)} · Thợ {a.stylistName}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </div>

          <ul className="mt-3 space-y-1 border-t border-brand-100 pt-2.5 text-sm">
            {a.services.map((s) => (
              <li key={s.name} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="shrink-0 text-ink-soft">{s.priceText}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-brand-100 pt-2 font-semibold">
              <span>Tạm tính</span><span className="text-brand-800">{a.estimatedTotalText}</span>
            </li>
          </ul>

          {a.status === 'cancelled' && (
            <p className="mt-3 rounded-xl bg-gray-100 px-3.5 py-2.5 text-xs text-gray-700">
              Đã huỷ{a.cancelledByLabel ? ` bởi ${a.cancelledByLabel}` : ''}
              {a.cancelReason ? ` — ${a.cancelReason}` : ''}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {canCancel(a) && (
              <Button variant="outline" size="sm" onClick={() => setCancelTarget(a)}>Huỷ lịch này</Button>
            )}
            {a.status === 'completed' && (
              <a className="btn btn-secondary btn-sm" href={`/danh-gia?code=${a.code}`}>
                <Star size={14} /> Chấm điểm buổi dịch vụ
              </a>
            )}
            <a className="btn btn-ghost btn-sm" href={`tel:${SALON.hotline.replace(/\s/g, '')}`}>
              <Phone size={14} /> Gọi tiệm
            </a>
          </div>
        </Card>
      ))}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Xác nhận huỷ lịch hẹn"
        danger
        confirmLabel="Huỷ lịch"
        message={
          <>
            Bạn chắc chắn huỷ lịch <strong>{cancelTarget?.code}</strong> lúc {cancelTarget?.startAtText}?
            <br />
            Khung giờ sẽ được trả lại ngay để tiệm nhận khách khác. Lưu ý chỉ huỷ được khi còn cách giờ hẹn
            tối thiểu 120 phút.
          </>
        }
        onConfirm={doCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
