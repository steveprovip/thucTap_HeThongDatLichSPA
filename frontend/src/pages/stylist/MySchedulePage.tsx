import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardEdit, History, Play, Square } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, VisitHistoryItem } from '@/types';
import { Button, Card, DateNav, EmptyState, Field, Modal, SectionTitle, StatusBadge, Textarea, ListSkeleton } from '@/components';
import { formatDate, formatDuration, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { useAppointmentsSync } from '@/utils/liveSync';

/** S3-08 + S4-03: lịch cá nhân của thợ, bấm bắt đầu / hoàn tất và ghi chú kỹ thuật. */
export function MySchedulePage() {
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteTarget, setNoteTarget] = useState<Appointment | null>(null);
  const [completionTarget, setCompletionTarget] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const toast = useToast();

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setItems(await appointmentsApi.myDay(d));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(date); }, [date, load]);
  useAppointmentsSync(() => { void load(date); });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const act = async (a: Appointment, kind: 'start' | 'complete') => {
    setBusyId(a.id);
    try {
      if (kind === 'start') await appointmentsApi.start(a.id);
      else await appointmentsApi.complete(a.id);
      toast.success(kind === 'start' ? 'Đã bắt đầu lượt dịch vụ' : 'Đã hoàn tất lượt dịch vụ');
      void load(date);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const openNote = async (a: Appointment, completing = false) => {
    setNoteTarget(a);
    setCompletionTarget(completing ? a.id : null);
    setNoteText('');
    try {
      const res = await appointmentsApi.customerHistory(a.id);
      setHistory(res.history.filter((h) => h.appointmentId !== a.id));
      const current = res.history.find((h) => h.appointmentId === a.id);
      if (current?.technicalNote) setNoteText(current.technicalNote);
    } catch { setHistory([]); }
  };

  const saveNote = async () => {
    if (!noteTarget) return;
    try {
      await appointmentsApi.serviceNote(noteTarget.id, noteText);
      if (completionTarget === noteTarget.id) {
        await appointmentsApi.complete(noteTarget.id);
        toast.success('Đã lưu công thức và hoàn tất lượt dịch vụ');
        void load(date);
      } else toast.success('Đã lưu ghi chú kỹ thuật');
      setNoteTarget(null);
      setCompletionTarget(null);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Lịch của tôi"
        description="Bạn chỉ thấy lịch hẹn của chính mình. Số điện thoại khách được che bớt để bảo vệ dữ liệu cá nhân."
      />
      <DateNav value={date} onChange={setDate} />

      {loading ? <ListSkeleton count={3} avatar label="Đang tải lịch của bạn…" /> : items.length === 0 ? (
        <EmptyState icon={<CalendarDays size={30} />} title="Ngày này bạn chưa có lịch hẹn nào" />
      ) : (
        <div className="stagger space-y-2.5">
          {items.map((a) => (
            <Card key={a.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{a.startTime} – {a.endTime}</p>
                  <p className="mt-1 text-lg font-semibold leading-tight text-slate-900">{a.customer.fullName}</p>
                  <p className="mt-0.5 font-mono text-sm tracking-wide text-slate-500">{a.customer.phone}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={a.status} />
                  {a.status === 'in_progress' && <span className="chip border border-amber-200 bg-amber-50 text-amber-800">
                    Đang làm · {a.startedAt ? `${Math.max(0, Math.floor((now - new Date(a.startedAt).getTime()) / 60000))} phút` : 'vừa bắt đầu'}
                  </span>}
                  {a.isLate && (
                    <span className="chip border border-red-300 bg-red-50 text-red-700">Khách đến trễ {a.lateMinutes}′</span>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3 text-sm text-slate-700">
                {a.services.map((s) => (
                  <li key={s.id}>• {s.name} <span className="text-ink-muted">({s.durationMinutes}′)</span></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-muted">Tổng {formatDuration(a.totalDurationMinutes)}</p>

              {a.customerNote && (
                <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-2.5 text-sm text-slate-800">
                  <strong>Khách nhắn:</strong> {a.customerNote}
                </p>
              )}
              {a.actualDurationMinutes !== null && a.status === 'completed' && (
                <p className="mt-2 text-xs text-ink-muted">
                  Thời lượng thực tế {a.actualDurationMinutes}′ so với chuẩn {a.totalDurationMinutes}′
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {a.status === 'arrived' && (
                  <Button size="sm" loading={busyId === a.id} onClick={() => act(a, 'start')} icon={<Play size={15} />}>
                    Bắt đầu
                  </Button>
                )}
                {a.status === 'in_progress' && (
                  <Button size="sm" loading={busyId === a.id} onClick={() => openNote(a, true)} icon={<Square size={15} />}>
                    Hoàn tất
                  </Button>
                )}
                {['arrived', 'in_progress', 'completed'].includes(a.status) && (
                  <Button size="sm" variant="outline" onClick={() => openNote(a)} icon={<ClipboardEdit size={15} />}>
                    Ghi chú kỹ thuật
                  </Button>
                )}
                {a.status === 'confirmed' && (
                  <span className="chip border border-blue-200 bg-blue-50 text-blue-700">
                    <CheckCircle2 size={13} /> Chờ lễ tân check-in
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!noteTarget}
        title={`${completionTarget ? 'Hoàn tất ca & công thức kỹ thuật' : 'Ghi chú kỹ thuật'} — ${noteTarget?.customer.fullName ?? ''}`}
        onClose={() => { setNoteTarget(null); setCompletionTarget(null); }}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setNoteTarget(null); setCompletionTarget(null); }}>Đóng</Button>
            <Button onClick={saveNote}>{completionTarget ? 'Lưu và hoàn tất' : 'Lưu ghi chú'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Ghi chú cho lượt này" hint={`${noteText.length}/500 ký tự — chỉ Thợ, Lễ tân và Chủ tiệm xem được`}>
            <Textarea value={noteText} maxLength={500} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="VD: nhuộm mã 7.13, ủ 35 phút, da đầu nhạy cảm nên pha loãng oxy." />
          </Field>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History size={15} /> 10 lượt gần nhất của khách
            </p>
            {history.length === 0 ? (
              <p className="rounded-xl bg-blue-50 px-3.5 py-2.5 text-sm text-blue-900">
                Đây là khách mới, chưa có lịch sử dịch vụ tại tiệm.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs text-ink-soft">
                {history.map((h) => (
                  <li key={h.appointmentId} className="border-b border-slate-100 pb-1.5">
                    <strong>{formatDate(h.date)}</strong> — {h.services.join(', ')} · thợ {h.stylistName}
                    {h.technicalNote && <em className="block text-ink-muted">{h.technicalNote}</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
