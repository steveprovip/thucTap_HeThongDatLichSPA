import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, CalendarClock, CheckCircle2, Clock, History, LogIn, NotebookPen, Phone, Play, Receipt, Square,
  Undo2, UserRound, UserX, X, XCircle,
} from 'lucide-react';
import { appointmentsApi, getErrorMessage, stylistsApi } from '@/api';
import type { Appointment, AppointmentStatus, Availability, Stylist, VisitHistoryItem } from '@/types';
import {
  BackButton, Button, ConfirmDialog, CustomerMetrics, EmailText, Field, Modal, Notice, Select, StatusBadge, Textarea,
} from '@/components';
import { formatDate, formatDateTime, formatDuration, formatTime, salonClosedMessage } from '@/utils/format';
import { historyCaption } from '@/utils/customerMetrics';
import { canMarkNoShow, describeAppointmentChange, NO_SHOW_AFTER_MIN, overrunInfo } from '@/utils/opsHelpers';
import { STATUS_LABELS } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export interface AppointmentDrawerProps {
  appointment: Appointment | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Cửa sổ check-in: từ 60 phút trước đến 60 phút sau giờ hẹn. */
const CHECK_IN_WINDOW_MIN = 60;
/** Hoàn tác "không đến" trong vòng 15 phút. */
const UNDO_NO_SHOW_MIN = 15;

const FLOW: AppointmentStatus[] = ['pending', 'confirmed', 'arrived', 'in_progress', 'completed'];

const startMs = (a: Appointment) => new Date(`${a.date}T${a.startTime}:00+07:00`).getTime();

/** Theo dõi "bây giờ" để nút check-in tự mở/khoá khi qua mốc giờ. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Ngăn kéo trượt từ phải (slide-over) để xử lý một lịch hẹn:
 * Xác nhận · Check-in (±60 phút) · Bắt đầu · Đổi thợ/Dời giờ · Báo không đến · Huỷ.
 */
export function AppointmentDrawer({ appointment, onClose, onChanged }: AppointmentDrawerProps) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();

  const [current, setCurrent] = useState<Appointment | null>(appointment);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const childOpen = rescheduleOpen || rejectOpen || cancelOpen || noShowOpen || noteOpen;

  // Đồng bộ khi mở lịch khác
  useEffect(() => {
    setCurrent(appointment);
    if (!appointment) { setVisible(false); return; }
    const t = window.requestAnimationFrame(() => setVisible(true));
    setHistory([]);
    appointmentsApi.customerHistory(appointment.id)
      .then((r) => setHistory(r.history))
      .catch(() => undefined);
    // QA Sprint 3 · mục 5: lịch lấy từ danh sách / lưới ngày KHÔNG kèm lịch sử thay đổi → nạp chi tiết mỗi lần mở
    // ngăn kéo, để đóng rồi mở lại vẫn thấy đủ lịch sử (trước đây chỉ hiện ngay sau một thao tác).
    let alive = true;
    appointmentsApi.detail(appointment.id)
      .then((fresh) => { if (alive) setCurrent((cur) => (cur && cur.id === fresh.id ? fresh : cur)); })
      .catch(() => undefined);
    return () => { alive = false; window.cancelAnimationFrame(t); };
  }, [appointment]);

  useEffect(() => {
    if (user && ['receptionist', 'owner'].includes(user.role)) {
      appointmentsApi.rejectReasons().then(setReasons).catch(() => undefined);
    }
  }, [user]);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  // Esc đóng ngăn kéo (trừ khi đang mở hộp thoại con), khoá cuộn trang nền
  useEffect(() => {
    if (!appointment) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !childOpen) close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [appointment, childOpen, close]);

  /** Chạy một thao tác, rồi nạp lại lịch hẹn để ngăn kéo hiển thị trạng thái mới. */
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, okMessage: string) => {
    if (!current) return;
    setBusy(key);
    try {
      await fn();
      toast.success(okMessage);
      const fresh = await appointmentsApi.detail(current.id).catch(() => null);
      if (fresh) setCurrent(fresh);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [current, toast, onChanged]);

  const timing = useMemo(() => {
    if (!current) return null;
    const start = startMs(current);
    const diffMin = Math.round((now - start) / 60_000);
    return {
      diffMin,
      canCheckIn: Math.abs(diffMin) <= CHECK_IN_WINDOW_MIN,
      checkInFrom: formatTime(new Date(start - CHECK_IN_WINDOW_MIN * 60_000)),
      checkInTo: formatTime(new Date(start + CHECK_IN_WINDOW_MIN * 60_000)),
      // QA Sprint 3 · mục 3: chỉ sau giờ hẹn 30 phút và khi lịch chưa check-in (trạng thái "đã xác nhận")
      canNoShow: canMarkNoShow(current.status, start, now),
      overrun: overrunInfo(current, now),
    };
  }, [current, now]);

  if (!appointment || !current || !timing) return null;
  const a = current;
  /** QA Sprint 4 · mục 6: MỘT ghi chú chung cho lượt dịch vụ — thợ, lễ tân, chủ tiệm cùng thấy & sửa tiếp (không mở ô trống ghi đè). */
  const currentNote = history.find((h) => h.appointmentId === a.id)?.technicalNote ?? '';
  const isStaff =!!user && ['receptionist', 'owner'].includes(user.role);
  const isOwnStylist = user?.role === 'stylist' && user.stylistId === a.stylist.id;
  const canOperate = isStaff || isOwnStylist;
  const terminal = a.status === 'cancelled' || a.status === 'no_show';
  const undoable = a.status === 'no_show' && (!a.noShowAt || now - new Date(a.noShowAt).getTime() <= UNDO_NO_SHOW_MIN * 60_000);

  const relative = timing.diffMin === 0 ? 'đúng giờ hẹn'
    : timing.diffMin < 0 ? `còn ${formatDuration(-timing.diffMin)} tới giờ hẹn`
      : `đã qua giờ hẹn ${formatDuration(timing.diffMin)}`;

  const drawer = (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Lịch hẹn ${a.code}`}>
      <div className={`absolute inset-0 bg-scrim/25 backdrop-blur-[2px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
           onClick={close} aria-hidden />
      <aside className={`relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-pop
                         transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Đầu ngăn kéo */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <BackButton onClick={close} className="mb-2.5" />
            <p className="font-mono text-xs tracking-widest text-ink-muted">{a.code}</p>
            <h3 className="mt-0.5 truncate text-lg font-semibold text-slate-900">{a.customer.fullName}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={a.status} />
              <span className="chip border border-slate-300 bg-slate-100 text-slate-700">
                {a.source === 'walk_in' ? 'Khách tại quầy' : 'Đặt online'}
              </span>
              {a.isLate && <span className="chip border border-red-200 bg-red-50 text-red-700">Trễ {a.lateMinutes}′</span>}
              {a.pendingOverdue && <span className="chip border border-amber-200 bg-amber-50 text-amber-800">Quá hạn xử lý</span>}
            </div>
          </div>
          <button onClick={close} aria-label="Đóng" className="rounded-lg p-2 text-ink-muted hover:bg-slate-100 hover:text-ink">
            <X size={20} />
          </button>
        </header>

        <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <StatusTimeline appointment={a} />

          {timing.overrun.level !== 'none' && (
            <Notice tone={timing.overrun.level === 'danger' ? 'danger' : 'warning'}
                    title={`Đang làm quá thời lượng chuẩn ${formatDuration(timing.overrun.overMinutes)}`}>
              <span className="flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {timing.overrun.level === 'danger'
                  ? `Vượt hơn 20 phút — các lịch sau của ${a.stylist.fullName} có nguy cơ trễ, nên báo khách kế tiếp hoặc chuyển thợ.`
                  : `Chuẩn ${formatDuration(a.totalDurationMinutes)}. Quá 20 phút sẽ ảnh hưởng các lịch sau của ${a.stylist.fullName}.`}
              </span>
            </Notice>
          )}

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
            <div><dt className="text-xs text-ink-muted">Giờ hẹn</dt>
              <dd className="font-semibold">{a.startTime} – {a.endTime}</dd></div>
            <div><dt className="text-xs text-ink-muted">Ngày</dt>
              <dd className="font-semibold">{formatDate(`${a.date}T00:00:00+07:00`)}</dd></div>
            <div><dt className="text-xs text-ink-muted">Thợ phụ trách</dt><dd className="font-semibold">{a.stylist.fullName}</dd></div>
            <div><dt className="text-xs text-ink-muted">Thời lượng</dt>
              <dd className="font-semibold">{formatDuration(a.totalDurationMinutes)}</dd></div>
            <div className="col-span-2 flex items-center gap-1.5 text-xs text-ink-muted">
              <Clock size={13} /> {relative}
            </div>
          </dl>

          <section className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="flex items-center gap-2 font-semibold"><UserRound size={16} className="text-teal-600" /> {a.customer.fullName}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
              <Phone size={14} />
              {a.customer.phoneMasked ? a.customer.phone : <a href={`tel:${a.customer.phone}`} className="hover:underline">{a.customer.phone}</a>}
              {a.customer.phoneMasked && <span className="text-xs text-ink-muted">(đã che theo quyền)</span>}
            </p>
            {a.customer.email && <EmailText email={a.customer.email} className="mt-1 flex" />}
            <CustomerMetrics data={a.customer} className="mt-1 text-xs text-ink-muted" />
            {a.customer.noShowCount >= 2 && (
              <Notice tone="danger" className="mt-2">Khách đã lỡ hẹn {a.customer.noShowCount} lần — nên gọi xác nhận trước.</Notice>
            )}
          </section>

          <section>
            <p className="field-label">Dịch vụ</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {a.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 px-3.5 py-2">
                  <span>{s.name} <span className="text-ink-muted">({s.durationMinutes}′)</span></span>
                  <span className="shrink-0">{s.priceText}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 px-3.5 py-2 font-semibold">
                <span>Tạm tính</span><span className="text-teal-700">{a.estimatedTotalText}</span>
              </li>
            </ul>
          </section>

          {a.customerNote && (
            <section>
              <p className="field-label">Ghi chú của khách</p>
              <p className="rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-2.5 text-sm text-slate-800">{a.customerNote}</p>
            </section>
          )}

          {(a.cancelReason || a.rejectedReason) && (
            <Notice tone="danger" title={a.rejectedReason ? 'Đã từ chối' : 'Đã huỷ'}>
              {a.rejectedReason ?? a.cancelReason}{a.cancelledByLabel ? ` · bởi ${a.cancelledByLabel}` : ''}
            </Notice>
          )}

          {currentNote && (
            <section>
              <p className="field-label flex items-center gap-1.5"><NotebookPen size={13} /> Ghi chú kỹ thuật của lượt này</p>
              <p className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800">{currentNote}</p>
            </section>
          )}

          {history.length > 0 && (
            <details className="rounded-xl border border-slate-200 p-3.5">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <History size={15} /> Lịch sử đặt lịch ({historyCaption(history.length, a.customer.totalAppointments)})
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-soft">
                {history.map((h) => (
                  <li key={h.appointmentId} className="border-b border-slate-200 pb-1.5 last:border-0">
                    <span className="font-medium">{formatDate(h.date)}</span> · {h.services.join(', ')} · thợ {h.stylistName}
                    <span className="ml-1 text-ink-muted">({STATUS_LABELS[h.status]}{h.appointmentId === a.id ? ' · lịch này' : ''})</span>
                    {h.technicalNote && <em className="block text-ink-muted">Ghi chú: {h.technicalNote}</em>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {a.changes && a.changes.length > 0 && (
            <details open className="rounded-xl border border-slate-200 p-3.5">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <Clock size={15} /> Lịch sử thay đổi ({a.changes.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {a.changes.map((c) => {
                  const d = describeAppointmentChange(c);
                  return (
                    <li key={c.id}>
                      {formatDateTime(c.createdAt)} — {c.changedByName}: <span className="font-medium text-ink-soft">{d.label}</span> {d.from} → {d.to}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>

        {/* Thanh thao tác */}
        {canOperate && (
          <footer className="space-y-2 border-t border-slate-200 bg-white px-5 py-3.5 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.12)]">
            {isStaff && a.status === 'confirmed' && !timing.canCheckIn && (
              <p className="text-xs text-ink-muted">
                Check-in mở từ <strong>{timing.checkInFrom}</strong> đến <strong>{timing.checkInTo}</strong> (±60 phút quanh giờ hẹn).
              </p>
            )}
            {isStaff && a.status === 'confirmed' && !timing.canNoShow && (
              <p className="text-xs text-ink-muted">
                Chỉ báo “Không đến” sau giờ hẹn {NO_SHOW_AFTER_MIN} phút (từ <strong>{formatTime(new Date(startMs(a) + NO_SHOW_AFTER_MIN * 60_000))}</strong>).
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {isStaff && a.status === 'pending' && (
                <>
                  <Button size="sm" loading={busy === 'confirm'} icon={<CheckCircle2 size={15} />}
                          onClick={() => run('confirm', () => appointmentsApi.confirm(a.id), 'Đã xác nhận lịch hẹn')}>
                    Xác nhận
                  </Button>
                  <Button size="sm" variant="outline" icon={<XCircle size={15} />} onClick={() => { setRejectReason(''); setRejectOpen(true); }}>
                    Từ chối
                  </Button>
                </>
              )}
              {isStaff && a.status === 'confirmed' && (
                <>
                  <Button size="sm" disabled={!timing.canCheckIn} loading={busy === 'checkin'} icon={<LogIn size={15} />}
                          title={timing.canCheckIn ? 'Khách đã đến tiệm' : `Mở từ ${timing.checkInFrom} đến ${timing.checkInTo}`}
                          onClick={() => run('checkin', () => appointmentsApi.checkIn(a.id), 'Đã check-in khách')}>
                    Check-in
                  </Button>
                  <Button size="sm" variant="outline" disabled={!timing.canNoShow} icon={<UserX size={15} />}
                          title={timing.canNoShow ? 'Khách không đến' : `Mở sau giờ hẹn ${NO_SHOW_AFTER_MIN} phút`}
                          onClick={() => setNoShowOpen(true)}>
                    Không đến
                  </Button>
                </>
              )}
              {a.status === 'arrived' && (
                <Button size="sm" loading={busy === 'start'} icon={<Play size={15} />}
                        onClick={() => run('start', () => appointmentsApi.start(a.id), 'Đã bắt đầu lượt dịch vụ')}>
                  Bắt đầu
                </Button>
              )}
              {a.status === 'in_progress' && (
                <Button size="sm" loading={busy === 'complete'} icon={<Square size={15} />}
                        onClick={() => run('complete', () => appointmentsApi.complete(a.id), 'Đã hoàn tất lượt dịch vụ')}>
                  Hoàn tất
                </Button>
              )}
              {isStaff && ['pending', 'confirmed', 'arrived'].includes(a.status) && (
                <Button size="sm" variant="secondary" icon={<CalendarClock size={15} />} onClick={() => setRescheduleOpen(true)}>
                  Đổi thợ / Dời giờ
                </Button>
              )}
              {isStaff && ['pending', 'confirmed'].includes(a.status) && (
                <Button size="sm" variant="ghost" icon={<Ban size={15} />} onClick={() => { setCancelReason(''); setCancelOpen(true); }}>
                  Huỷ lịch
                </Button>
              )}
              {['in_progress', 'completed'].includes(a.status) && (
                <Button size="sm" variant="outline" icon={<NotebookPen size={15} />} onClick={() => { setNote(currentNote); setNoteOpen(true); }}>
                  Ghi chú kỹ thuật
                </Button>
              )}
              {isStaff && a.status === 'completed' && (
                <Button size="sm" icon={<Receipt size={15} />} onClick={() => navigate(`/quan-ly/phieu-tinh-tien/${a.id}`)}>
                  Lập phiếu tính tiền
                </Button>
              )}
              {isStaff && a.status === 'no_show' && undoable && (
                <Button size="sm" variant="outline" loading={busy === 'undo'} icon={<Undo2 size={15} />}
                        onClick={() => run('undo', () => appointmentsApi.undoNoShow(a.id), 'Đã hoàn tác trạng thái không đến')}>
                  Hoàn tác không đến
                </Button>
              )}
            </div>
            {terminal && !undoable && <p className="text-xs text-ink-muted">Lịch đã kết thúc, không còn thao tác.</p>}
          </footer>
        )}
      </aside>
    </div>
  );

  return (
    <>
      {createPortal(drawer, document.body)}

      <RescheduleModal
        open={rescheduleOpen}
        appointment={a}
        onClose={() => setRescheduleOpen(false)}
        onDone={async () => {
          setRescheduleOpen(false);
          const fresh = await appointmentsApi.detail(a.id).catch(() => null);
          if (fresh) setCurrent(fresh);
          onChanged();
        }}
      />

      <Modal open={rejectOpen} title="Từ chối lịch hẹn" onClose={() => setRejectOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setRejectOpen(false)}>Đóng</Button>
               <Button variant="danger" disabled={!rejectReason} loading={busy === 'reject'}
                       onClick={async () => { await run('reject', () => appointmentsApi.reject(a.id, rejectReason), 'Đã từ chối và giải phóng khung giờ'); setRejectOpen(false); }}>
                 Từ chối lịch
               </Button>
             </div>}>
        <Field label="Lý do từ chối" required hint="Khung giờ được giải phóng ngay lập tức.">
          <Select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
            <option value="">— Chọn lý do —</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal open={cancelOpen} title="Huỷ lịch hẹn" onClose={() => setCancelOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setCancelOpen(false)}>Đóng</Button>
               <Button variant="danger" disabled={cancelReason.trim().length < 3} loading={busy === 'cancel'}
                       onClick={async () => { await run('cancel', () => appointmentsApi.cancel(a.id, cancelReason.trim()), 'Đã huỷ lịch hẹn'); setCancelOpen(false); }}>
                 Huỷ lịch
               </Button>
             </div>}>
        <Field label="Lý do huỷ" required hint="Tối thiểu 3 ký tự. Khách có email sẽ được thông báo.">
          <Textarea value={cancelReason} maxLength={300} onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="VD: Khách gọi báo bận đột xuất" />
        </Field>
      </Modal>

      <Modal open={noteOpen} title="Ghi chú kỹ thuật" onClose={() => setNoteOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setNoteOpen(false)}>Đóng</Button>
               <Button disabled={!note.trim()} loading={busy === 'note'}
                       onClick={async () => {
                         const text = note.trim();
                         await run('note', async () => {
                           await appointmentsApi.serviceNote(a.id, text);
                           setHistory((hs) => hs.map((h) => (h.appointmentId === a.id ? { ...h, technicalNote: text } : h)));
                         }, 'Đã lưu ghi chú');
                         setNoteOpen(false);
                       }}>
                 Lưu ghi chú
               </Button>
             </div>}>
        <Field label="Công thức, sản phẩm đã dùng, lưu ý cho lần sau" hint={`${note.length}/500`}>
          <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={noShowOpen}
        title="Báo khách không đến"
        danger
        confirmLabel="Đánh dấu không đến"
        message={<>Khung giờ còn lại của thợ sẽ được giải phóng và số lần không đến của khách tăng thêm 1.
          Có thể hoàn tác trong vòng {UNDO_NO_SHOW_MIN} phút.</>}
        onConfirm={() => run('noshow', () => appointmentsApi.noShow(a.id), 'Đã đánh dấu khách không đến')}
        onClose={() => setNoShowOpen(false)}
      />
    </>
  );
}

/** Dải trạng thái: Chờ xác nhận → Đã xác nhận → Đã đến → Đang làm → Hoàn tất. */
function StatusTimeline({ appointment: a }: { appointment: Appointment }) {
  const terminal = a.status === 'cancelled' || a.status === 'no_show';
  const reached = terminal ? (a.confirmedAt ? 1 : 0) : FLOW.indexOf(a.status);
  const stamps: Partial<Record<AppointmentStatus, string | null>> = {
    pending: a.createdAt, confirmed: a.confirmedAt, arrived: a.arrivedAt, in_progress: a.startedAt, completed: a.completedAt,
  };
  return (
    <ol className="flex items-start" aria-label="Tiến trình lịch hẹn">
      {FLOW.map((s, i) => {
        const done = i <= reached;
        const isCurrent = !terminal && i === reached;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${i <= reached ? 'bg-teal-600' : 'bg-slate-200'}`} aria-hidden />
            )}
            <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold
              ${isCurrent ? 'border-teal-600 bg-teal-600 text-white ring-4 ring-teal-600/15'
                : done ? 'border-teal-600 bg-teal-500 text-white' : 'border-slate-300 bg-white text-slate-500'}`}>
              {done ? '✓' : i + 1}
            </span>
            <span className={`mt-1 text-[10px] leading-tight ${done ? 'text-ink' : 'text-ink-muted'}`}>{STATUS_LABELS[s]}</span>
            {done && stamps[s] && <span className="text-[10px] text-ink-muted">{formatTime(stamps[s] as string)}</span>}
          </li>
        );
      })}
      {terminal && (
        <li className="relative flex flex-1 flex-col items-center text-center">
          <span className="absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 bg-red-500/60" aria-hidden />
          <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-400 bg-red-500 text-white">
            <X size={12} />
          </span>
          <span className="mt-1 text-[10px] leading-tight text-red-600">{STATUS_LABELS[a.status]}</span>
        </li>
      )}
    </ol>
  );
}

/** Đổi thợ / dời giờ: chỉ liệt kê thợ làm được toàn bộ dịch vụ, và khung giờ còn trống (S3-04). */
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
    setAvailability(null);
    let stale = false;
    appointmentsApi
      .availability({
        date, serviceIds: appointment.services.map((s) => s.serviceId), stylistId, excludeAppointmentId: appointment.id,
      })
      .then((r) => { if (!stale) setAvailability(r); })
      .catch(() => { if (!stale) setAvailability(null); });
    return () => { stale = true; };
  }, [open, date, stylistId, appointment]);

  const capable = stylists.filter((s) => appointment.services.every((sv) => s.serviceIds.includes(sv.serviceId)));
  const unchanged = stylistId === appointment.stylist.id && date === appointment.date && time === appointment.startTime;
  // Ngày đích là ngày tiệm nghỉ cả ngày (nghỉ lễ / nghỉ cố định): chặn hẳn, không cho lưu
  const closedDay = !!availability && availability.date === date && availability.salonClosed;

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

  return (
    <Modal open={open} title="Đổi thợ hoặc dời giờ" onClose={onClose} size="md"
           footer={<div className="flex justify-end gap-2">
             <Button variant="ghost" onClick={onClose}>Đóng</Button>
             <Button loading={busy} onClick={save} disabled={!time || unchanged || closedDay}>Lưu thay đổi</Button>
           </div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Thợ phụ trách" hint="Chỉ hiện thợ làm được toàn bộ dịch vụ">
            <Select value={stylistId} onChange={(e) => { setStylistId(e.target.value); setTime(''); }}>
              {capable.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.id === appointment.stylist.id ? ' (hiện tại)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Ngày">
            <input type="date" className="field-input" value={date} onChange={(e) => { setDate(e.target.value); setTime(''); }} />
          </Field>
        </div>

        <div>
          <p className="field-label">Khung giờ còn trống</p>
          {!availability ? <p className="text-sm text-ink-muted">Đang tính…</p>
            : availability.salonClosed ? <Notice tone="danger">{salonClosedMessage(availability.closedReason, 'reschedule')}</Notice>
              : availability.slots.length === 0 ? <Notice tone="warning">Thợ này không còn khung giờ trống trong ngày đã chọn.</Notice>
                : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {availability.slots.map((s) => (
                      <button key={s.time} type="button" onClick={() => setTime(s.time)} aria-pressed={time === s.time}
                              className={`min-h-[40px] rounded-lg border text-sm font-semibold
                                ${time === s.time ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white hover:border-teal-300'}`}>
                        {s.time}
                      </button>
                    ))}
                  </div>
                )}
        </div>
        <p className="text-xs text-ink-muted">
          Hệ thống kiểm tra lại kỹ năng thợ và khoảng trống trước khi lưu. Mọi thay đổi được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}
