import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, Landmark, Lock, Plus, Printer, Receipt, Trash2 } from 'lucide-react';
import { appointmentsApi, getErrorMessage, invoicesApi } from '@/api';
import type { Appointment, Invoice, PaymentMethod } from '@/types';
import { Button, Card, ConfirmDialog, Field, Input, SectionTitle, Spinner, StatusBadge, VietQrCode } from '@/components';
import { formatNumber, formatVnd, parseNumber } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { SALON } from '@/utils/constants';

interface Line {
  serviceId?: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

/** S4-01 + S4-02: lập phiếu tính tiền, thêm dịch vụ phát sinh, áp mã giảm giá, đóng phiếu. */
export function InvoicePage() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [transferNote, setTransferNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  /** S4-01: phiếu đã đóng chỉ sửa bằng PHIẾU ĐIỀU CHỈNH có lý do (Chủ tiệm). */
  const [adjusting, setAdjusting] = useState(false);
  const [adjustReason, setAdjustReason] = useState('');
  const { user } = useAuth();

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  /** QR phải mang đúng số tiền ĐÃ LƯU trên máy chủ; còn sửa dở thì giá tạm tính có thể lệch (voucher %). */
  const unsaved = !!invoice && (invoice.subtotal !== subtotal || invoice.discountAmount !== discount
    || (invoice.voucherCode ?? '') !== voucherCode.trim());
  const locked = invoice?.status === 'closed' || invoice?.status === 'adjusted';
  const editLocked = locked && !adjusting;
  /** Nội dung CK = mã phiếu (ASCII, không gạch nối) → khớp 1-1 với ghi chú đối soát. */
  const transferRef = invoice ? invoice.code.replace(/[^0-9A-Za-z]/g, '').toUpperCase() : '';

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    try {
      const appt = await appointmentsApi.detail(appointmentId);
      setAppointment(appt);
      let inv = await invoicesApi.byAppointment(appointmentId);
      if (!inv && appt.status === 'completed') inv = await invoicesApi.create(appointmentId);
      if (inv) {
        setInvoice(inv);
        setLines(inv.items.map((i) => ({
          serviceId: i.serviceId ?? undefined, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity,
        })));
        setVoucherCode(inv.voucherCode ?? '');
        setDiscount(inv.discountAmount);
        if (inv.paymentMethod) setPaymentMethod(inv.paymentMethod);
        setTransferNote(inv.transferNote ?? '');
      } else {
        setLines(appt.services.map((s) => ({
          serviceId: s.serviceId, name: s.name, unitPrice: s.price, quantity: 1,
        })));
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [appointmentId, toast]);

  useEffect(() => { void load(); }, [load]);

  const applyVoucher = async () => {
    if (!voucherCode.trim()) { setDiscount(0); return; }
    try {
      const res = await invoicesApi.voucherPreview(voucherCode.trim(), subtotal);
      setDiscount(res.discountAmount);
      toast.success(`Áp mã ${res.code}: giảm ${res.discountAmountText}`);
    } catch (e) {
      setDiscount(0);
      toast.error(getErrorMessage(e));
    }
  };

  const saveLines = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      const updated = await invoicesApi.update(invoice.id, lines, voucherCode.trim() || null);
      setInvoice(updated);
      setDiscount(updated.discountAmount);
      toast.success('Đã cập nhật phiếu');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!invoice) return;
    if (paymentMethod === 'transfer' && !transferNote.trim()) {
      return toast.warning('Thanh toán chuyển khoản cần nhập ghi chú đối soát');
    }
    setBusy(true);
    try {
      await invoicesApi.update(invoice.id, lines, voucherCode.trim() || null);
      const paid = await invoicesApi.pay(invoice.id, paymentMethod, transferNote.trim() || undefined);
      setInvoice(paid);
      toast.success('Đã ghi nhận thanh toán');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!invoice) return;
    try {
      const closed = await invoicesApi.close(invoice.id);
      setInvoice(closed);
      toast.success('Đã đóng phiếu. Hệ thống gửi liên kết đánh giá cho khách.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const submitAdjust = async () => {
    if (!invoice) return;
    if (!adjustReason.trim()) return toast.warning('Nhập lý do điều chỉnh (bắt buộc, được lưu vào nhật ký)');
    setBusy(true);
    try {
      const adjusted = await invoicesApi.adjust(invoice.id, adjustReason.trim(), lines, voucherCode.trim() || null);
      toast.success(`Đã lập phiếu điều chỉnh ${adjusted.code} — doanh thu tính theo phiếu mới`);
      setAdjusting(false);
      setAdjustReason('');
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (!appointment) return <p className="text-sm text-ink-muted">Không tìm thấy lịch hẹn.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionTitle
        title={`Phiếu tính tiền ${invoice?.code ?? ''}`}
        description={`Lịch hẹn ${appointment.code} · ${appointment.startAtText}`}
        action={<div className="flex gap-2"><Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={() => window.print()} disabled={!invoice}>In hoá đơn</Button><Button variant="ghost" size="sm" onClick={() => navigate('/quan-ly')}>Về lịch ngày</Button></div>}
      />

      {appointment.status !== 'completed' && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          Chỉ lập được phiếu khi thợ đã bấm hoàn tất lượt dịch vụ. Trạng thái hiện tại:{' '}
          <strong>{appointment.statusLabel}</strong>.
        </p>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{appointment.customer.fullName}</p>
            <p className="text-sm text-ink-muted">{appointment.customer.phone} · thợ {appointment.stylist.fullName}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={appointment.status} />
            {invoice && (
              <span className="chip border border-teal-200 bg-teal-50 text-teal-800">{invoice.statusLabel}</span>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">Dòng dịch vụ</h3>
          {!editLocked && (
            <Button size="sm" variant="outline" icon={<Plus size={14} />}
                    onClick={() => setLines((l) => [...l, { name: '', unitPrice: 0, quantity: 1 }])}>
              Thêm dòng phát sinh
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-6">
                <Input
                  value={l.name} disabled={editLocked} placeholder="Tên dịch vụ"
                  onChange={(e) => setLines((list) => list.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <Input
                  value={formatNumber(l.unitPrice)} disabled={editLocked} inputMode="numeric"
                  onChange={(e) => setLines((list) => list.map((x, i) =>
                    i === idx ? { ...x, unitPrice: parseNumber(e.target.value) } : x))}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number" min={1} max={20} value={l.quantity} disabled={editLocked}
                  onChange={(e) => setLines((list) => list.map((x, i) =>
                    i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                />
              </div>
              <div className="col-span-3 sm:col-span-1 flex justify-end">
                {!editLocked && (
                  <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Xoá dòng"
                          onClick={() => setLines((list) => list.filter((_, i) => i !== idx))}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Mã giảm giá" hint="Mỗi phiếu chỉ áp được một mã">
            <div className="flex gap-2">
              <Input value={voucherCode} disabled={editLocked}
                     onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                     placeholder="VD: NGAYTHUONG10" />
              <Button variant="outline" onClick={applyVoucher} disabled={editLocked}>Áp dụng</Button>
            </div>
          </Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
            <div className="flex justify-between"><span className="text-ink-muted">Tạm tính</span>
              <span>{formatVnd(subtotal)}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-ink-muted">Giảm giá</span>
              <span className="text-red-600">− {formatVnd(discount)}</span></div>
            <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold">
              <span>Thực thu</span><span className="text-slate-900">{formatVnd(total)}</span></div>
          </div>
        </div>
      </Card>

      {!locked && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">Thanh toán</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hình thức">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hình thức thanh toán">
                {([['cash', 'Tiền mặt'], ['transfer', 'VietQR Banking']] as const).map(([value, label]) =>
                  <button key={value} type="button" aria-pressed={paymentMethod === value} onClick={() => {
                    setPaymentMethod(value as PaymentMethod);
                    if (value === 'transfer' && !transferNote.trim() && transferRef) setTransferNote(transferRef);
                  }}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${paymentMethod === value
                      ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>{label}</button>)}
              </div>
            </Field>
            {paymentMethod === 'transfer' && (
              <Field label="Ghi chú đối soát" required>
                <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)}
                       placeholder="VD: VCB 20260922 NGUYEN VAN A" />
              </Field>
            )}
          </div>
          {paymentMethod === 'transfer' && invoice && (unsaved ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              Phiếu có thay đổi chưa lưu. Bấm <strong>Lưu phiếu</strong> để tạo mã QR đúng số tiền thực thu.
            </p>
          ) : invoice.total > 0 && (
            <VietQrCode amount={invoice.total} addInfo={transferRef} className="mt-4" />
          ))}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" loading={busy} onClick={saveLines} disabled={!invoice}>Lưu phiếu</Button>
            <Button loading={busy} onClick={pay} disabled={!invoice}
                    icon={paymentMethod === 'cash' ? <Banknote size={16} /> : <Landmark size={16} />}>
              Ghi nhận thanh toán
            </Button>
            <Button variant="secondary" onClick={() => setConfirmClose(true)}
                    disabled={!invoice || invoice.status !== 'paid'} icon={<Lock size={16} />}>
              Đóng phiếu &amp; kết thúc lịch hẹn
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Nút đóng chỉ bật khi thợ đã hoàn tất và phiếu đã thanh toán. Phiếu đã đóng không sửa được,
            muốn sửa phải tạo phiếu điều chỉnh kèm lý do.
          </p>
        </Card>
      )}

      {locked && (
        <Card className="border-l-4 border-green-600 p-4">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <Receipt size={18} /> Phiếu đã đóng — thực thu {invoice?.totalText}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Hình thức: {invoice?.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
            {invoice?.transferNote ? ` (${invoice.transferNote})` : ''}
          </p>
          {invoice?.adjustReason && (
            <p className="mt-1 text-sm text-ink-soft">Phiếu điều chỉnh — lý do: {invoice.adjustReason}</p>
          )}
          {invoice?.status === 'closed' && user?.role === 'owner' && (adjusting ? (
            <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm text-amber-900">
                Sửa các dòng dịch vụ / mã giảm giá ở trên rồi lưu. Phiếu cũ được giữ nguyên để đối chiếu,
                báo cáo doanh thu tính theo phiếu điều chỉnh.
              </p>
              <Field label="Lý do điều chỉnh" required>
                <Input value={adjustReason} maxLength={255} onChange={(e) => setAdjustReason(e.target.value)}
                       placeholder="VD: Thu nhầm giá dịch vụ, khách được tặng thêm…" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={submitAdjust}>Lưu phiếu điều chỉnh</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { setAdjusting(false); void load(); }}>Huỷ</Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setAdjusting(true)}>
              Lập phiếu điều chỉnh
            </Button>
          ))}
        </Card>
      )}

      {invoice && <Card className="receipt-print p-5">
        <div className="border-b border-slate-300 pb-3 text-center">
          <h3 className="font-serif text-xl font-bold">{SALON.name}</h3>
          <p className="text-xs text-ink-muted">{SALON.address} · {SALON.hotline}</p>
          <p className="mt-2 text-sm font-semibold">HOÁ ĐƠN {invoice.code}</p>
        </div>
        <p className="mt-3 text-sm">Khách hàng: {invoice.customerName} · {invoice.customerPhone}</p>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {lines.map((line, index) => <li key={`${line.name}-${index}`} className="flex justify-between gap-2 py-2"><span>{line.name} × {line.quantity}</span><span>{formatVnd(line.unitPrice * line.quantity)}</span></li>)}
        </ul>
        <div className="mt-3 space-y-1 border-t border-slate-300 pt-3 text-sm">
          <p className="flex justify-between"><span>Tạm tính</span><span>{formatVnd(subtotal)}</span></p>
          <p className="flex justify-between"><span>Giảm giá</span><span>− {formatVnd(discount)}</span></p>
          <p className="flex justify-between text-base font-bold"><span>Thực thu</span><span>{formatVnd(total)}</span></p>
          <p>Thanh toán: {paymentMethod === 'cash' ? 'Tiền mặt' : 'VietQR Banking'}</p>
        </div>
      </Card>}

      <ConfirmDialog
        open={confirmClose}
        title="Đóng phiếu tính tiền"
        confirmLabel="Đóng phiếu"
        message="Sau khi đóng, phiếu không sửa được nữa và hệ thống sẽ gửi liên kết đánh giá cho khách có email."
        onConfirm={close}
        onClose={() => setConfirmClose(false)}
      />
    </div>
  );
}
