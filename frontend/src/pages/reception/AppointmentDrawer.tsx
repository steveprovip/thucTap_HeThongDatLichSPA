import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock, CheckCircle2, Clock, History, Phone, Play, Receipt, Square, UserRound, XCircle,
} from 'lucide-react';
import { appointmentsApi, getErrorMessage, stylistsApi } from '@/api';
import type { Appointment, Availability, Stylist, VisitHistoryItem } from '@/types';
import { Button, ConfirmDialog, Field, Modal, Select, StatusBadge } from '@/components';
import { formatDate, formatDateTime, formatDuration } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export interface AppointmentDrawerProps {
  appointment: Appointment | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Bảng thao tác nhanh cho một lịch hẹn: xác nhận, check-in, đổi thợ, dời giờ, huỷ, không đến. */
export function AppointmentDrawer({ appointment, onClose, onChanged }: AppointmentDrawerProps) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    setHistory([]);
    appointmentsApi.customerHistory(appointment.id)
      .then((r) => setHistory(r.history.filter((h) => h.appointmentId !== appointment.id)))
      .catch(() => undefined);
    if (user && ['receptionist', 'owner'].includes(user.role)) {
      appointmentsApi.rejectReasons().then(setReasons).catch(() => undefined);
    }
  }, [appointment, user]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, okMessage: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(okMessage);
        onChanged();
        onClose();
      } catch (e) {
        toast.error(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [toast, onChanged, onClose],
  );

  if (!appointment) return null;
  const a = appointment;
  const isStaff = !!user && ['receptionist', 'owner'].includes(user.role);
  const isStylistOwner = user?.role === 'stylist' && user.stylistId === a.stylist.id;

  return (
    <>
      <Modal
        open={!!appointment}
        title={`Lịch hẹn ${a.code}`}
        onClose={onClose}
        size="md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {isStaff && a.status === 'pending' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)} disabled={busy}>
                  <XCircle size={15} /> Từ chối
                </Button>
                <Button size="sm" loading={busy}
                        onClick={() => run(() => appointmentsApi.confirm(a.id), 'Đã xác nhận lịch hẹn')}>
                  <CheckCircle2 size={15} /> Xác nhận
                </Button>
              </>
            )}
            {isStaff && a.status === 'confirmed' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setConfirmNoShow(true)} disabled={busy}>
                  Không đến
                </Button>
                <Button size="sm" loading={busy}
                        onClick={() => run(() => appointmentsApi.checkIn(a.id), 'Đã check-in khách')}>
                  <CheckCircle2 size={15} /> Check-in
                </Button>
              </>
            )}
            {(isStaff || isStylistOwner) && a.status === 'arrived' && (
              <Button size="sm" loading={busy}
                      onClick={() => run(() => appointmentsApi.start(a.id), 'Đã bắt đầu lượt dịch vụ')}>
                <Play size={15} /> Bắt đầu
              </Button>
            )}
            {(isStaff || isStylistOwner) && a.status === 'in_progress' && (
              <Button size="sm" loading={busy}
                      onClick={() => run(() => appointmentsApi.complete(a.id), 'Đã hoàn tất lượt dịch vụ')}>
                <Square size={15} /> Hoàn tất
              </Button>
            )}
            {isStaff && a.status === 'completed' && (
              <Button size="sm" onClick={() => navigate(`/quan-ly/phieu-tinh-tien/${a.id}`)}>
                <Receipt size={15} /> Lập phiếu tính tiền
              </Button>
            )}
            {isStaff && a.status === 'no_show' && (
              <Button variant="outline" size="sm" loading={busy}
                      onClick={() => run(() => appointmentsApi.undoNoShow(a.id), 'Đã hoàn tác')}>
                Hoàn tác không đến
              </Button>
            )}
            {isStaff && ['pending', 'confirmed', 'arrived'].includes(a.status) && (
              <Button variant="secondary" size="sm" onClick={() => setRescheduleOpen(true)} disabled={busy}>
                <CalendarClock size={15} /> Đổi thợ / dời giờ
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            {a.isLate && <span className="chip border border-red-300 bg-red-50 text-red-700">Trễ {a.lateMinutes} phút</span>}
            {a.pendingOverdue && (
              <span className="chip border border-amber-300 bg-amber-50 text-amber-800">Quá hạn xử lý 12 giờ</span>
            )}
            <span className="chip border border-brand-200 bg-brand-50 text-brand-800">
              {a.source === 'walk_in' ? 'Khách tại quầy' : 'Đặt online'}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-ink-muted">Thời gian</dt><dd className="font-semibold">{a.startAtText}</dd></div>
            <div><dt className="text-ink-muted">Dự kiến xong</dt><dd className="font-semibold">{a.endTime}</dd></div>
            <div><dt className="text-ink-muted">Thợ</dt><dd className="font-semibold">{a.stylist.fullName}</dd></div>
            <div><dt className="text-ink-muted">Tổng thời lượng</dt>
                 <dd className="font-semibold">{formatDuration(a.totalDurationMinutes)}</dd></div>
          </dl>

          <div className="rounded-xl border border-brand-100 bg-surface-alt p-3.5">
            <p className="flex items-center gap-2 font-semibold">
              <UserRound size={16} /> {a.customer.fullName}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <Phone size={14} /> {a.customer.phone}
              {a.customer.phoneMasked && <span className="text-xs text-ink-muted">(đã che theo quyền của bạn)</span>}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Đã đến {a.customer.totalVisits} lần · {a.customer.noShowCount} lần không đến
            </p>
            {a.customer.noShowCount >= 2 && (
              <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                Cảnh báo: khách này đã lỡ hẹn {a.customer.noShowCount} lần.
              </p>
            )}
          </div>

          <div>
            <p className="field-label">Dịch vụ</p>
            <ul className="space-y-1 text-sm">
              {a.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.name} <span className="text-ink-muted">({s.durationMinutes}′)</span></span>
                  <span>{s.priceText}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-brand-100 pt-1.5 font-semibold">
                <span>Tạm tính</span><span className="text-brand-800">{a.estimatedTotalText}</span>
              </li>
            </ul>
          </div>

          {a.customerNote && (
            <div>
              <p className="field-label">Ghi chú của khách</p>
              <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm">{a.customerNote}</p>
            </div>
          )}

          {history.length > 0 && (
            <details className="rounded-xl border border-brand-100 p-3.5">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <History size={15} /> Lịch sử {history.length} lượt gần đây của khách
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-soft">
                {history.map((h) => (
                  <li key={h.appointmentId} className="border-b border-brand-50 pb-1.5 last:border-0">
                    <span className="font-medium">{formatDate(h.date)}</span> · {h.services.join(', ')} · thợ {h.stylistName}
                    {h.technicalNote && <em className="block text-ink-muted">Ghi chú: {h.technicalNote}</em>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {a.changes && a.changes.length > 0 && (
            <details className="rounded-xl border border-brand-100 p-3.5">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <Clock size={15} /> Lịch sử thay đổi
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {a.changes.map((c) => (
                  <li key={c.id}>
                    {formatDateTime(c.createdAt)} — {c.changedByName}: {c.field} {c.oldValue} → {c.newValue}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Modal>

      <RescheduleModal
        open={rescheduleOpen}
        appointment={a}
        onClose={() => setRescheduleOpen(false)}
        onDone={() => { setRescheduleOpen(false); onChanged(); onClose(); }}
      />

      <Modal
        open={rejectOpen}
        title="Từ chối lịch hẹn"
        onClose={() => setRejectOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Đóng</Button>
            <Button
              variant="danger"
              disabled={!rejectReason}
              loading={busy}
              onClick={() => run(() => appointmentsApi.reject(a.id, rejectReason), 'Đã từ chối và giải phóng khung giờ')}
            >
              Từ chối lịch
            </Button>
          </div>
        }
      >
        <Field label="Lý do từ chối" required hint="Khung giờ sẽ được giải phóng ngay lập tức.">
          <Select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
            <option value="">— Chọn lý do —</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmNoShow}
        title="Đánh dấu khách không đến"
        danger
        confirmLabel="Đánh dấu không đến"
        message={
          <>
            Khung giờ còn lại của thợ sẽ được giải phóng và số lần không đến của khách tăng thêm 1.
            Bạn có thể hoàn tác trong vòng 15 phút.
          </>
        }
        onConfirm={() => run(() => appointmentsApi.noShow(a.id), 'Đã đánh dấu khách không đến')}
        onClose={() => setConfirmNoShow(false)}
      />
    </>
  );
}

/** Đổi thợ / dời giờ có kiểm tra lại kỹ năng và khoảng trống trước khi lưu (S3-04). */
function RescheduleModal({ open, appointment, onClose, onDone }: {
  open: boolean; appointment: Appointment; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [stylistId, setStylistId] = useState(appointment.stylist.id);
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.startTime);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStylistId(appointment.stylist.id);
    setDate(appointment.date);
    setTime(appointment.startTime);
    stylistsApi.list({ isActive: true }).then(setStylists).catch(() => undefined);
  }, [open, appointment]);

  useEffect(() => {
    if (!open) return;
    appointmentsApi
      .availability({
        date,
        serviceIds: appointment.services.map((s) => s.serviceId),
        stylistId,
        excludeAppointmentId: appointment.id,
      })
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [open, date, stylistId, appointment]);

  const save = async () => {
    setBusy(true);
    try {
      await appointmentsApi.reschedule(appointment.id, { stylistId, date, time });
      toast.success('Đã cập nhật lịch hẹn và gửi thông báo cho khách');
      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const capable = stylists.filter((s) =>
    appointment.services.every((sv) => s.serviceIds.includes(sv.serviceId)),
  );

  return (
    <Modal
      open={open}
      title="Đổi thợ hoặc dời giờ"
      onClose={onClose}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button loading={busy} onClick={save} disabled={!time}>Lưu thay đổi</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Thợ phụ trách" hint="Chỉ hiện thợ làm được toàn bộ dịch vụ của lịch hẹn này">
          <Select value={stylistId} onChange={(e) => { setStylistId(e.target.value); setTime(''); }}>
            {capable.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </Select>
        </Field>

        <Field label="Ngày">
          <input type="date" className="field-input" value={date}
                 onChange={(e) => { setDate(e.target.value); setTime(''); }} />
        </Field>

        <div>
          <p className="field-label">Khung giờ còn trống</p>
          {!availability ? (
            <p className="text-sm text-ink-muted">Đang tính…</p>
          ) : availability.slots.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              Thợ này không còn khung giờ trống trong ngày đã chọn.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {availability.slots.map((s) => (
                <button
                  key={s.time}
                  onClick={() => setTime(s.time)}
                  className={`min-h-[40px] rounded-lg border text-sm font-semibold
                    ${time === s.time ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white'}`}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-ink-muted">
          Hệ thống kiểm tra lại kỹ năng thợ và khoảng trống trước khi lưu. Mọi thay đổi đều được ghi nhật ký,
          khách có email sẽ nhận thông báo trong vòng 5 phút.
        </p>
      </div>
    </Modal>
  );
}
