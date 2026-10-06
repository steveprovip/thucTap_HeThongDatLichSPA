import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, ChevronLeft, ChevronRight, Send, XCircle } from 'lucide-react';
import { getErrorMessage, shiftRequestsApi, stylistsApi, workingHoursApi } from '@/api';
import type { Holiday, Shift, ShiftRequest, ShiftRequestItem, WorkingHour } from '@/types';
import { Button, Card, EmptyState, Input, SectionTitle, Spinner, TimeSelect24 } from '@/components';
import { addDaysISO, formatDate, formatDuration, startOfWeekISO, timeToMinutes, todayISO } from '@/utils/format';
import { DOW_LABELS } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

type Choice = 'none' | 'shift' | 'off';
interface DayDraft { choice: Choice; start: string; end: string; note: string }

const STATUS: Record<ShiftRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'Chờ duyệt', cls: 'border-amber-300 bg-amber-50 text-amber-900' },
  approved: { label: 'Đã duyệt', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'Bị từ chối', cls: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: 'Đã huỷ', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
};

const vnDate = (iso: string) => formatDate(`${iso}T00:00:00+07:00`);

/**
 * Mentor Sprint 2 · mục 6 — thợ TỰ ĐĂNG KÝ lịch làm theo tuần (ca làm hoặc nghỉ cả ngày) rồi gửi quản lý duyệt.
 * Mỗi ngày hiển thị luôn giờ mở cửa, ngày lễ và ca đã được xếp để thợ đăng ký đúng ngay từ đầu.
 */
export function ShiftRegistrationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(startOfWeekISO(addDaysISO(todayISO(), 7)));
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const today = todayISO();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);
  const stylistId = user?.stylistId ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const to = addDaysISO(weekStart, 6);
      const [wh, hol, mine, sh] = await Promise.all([
        workingHoursApi.list(),
        workingHoursApi.holidays({ from: weekStart, to }),
        shiftRequestsApi.mine({ from: addDaysISO(today, -30) }),
        stylistId ? stylistsApi.shifts({ from: weekStart, to, stylistId }) : Promise.resolve([] as Shift[]),
      ]);
      setHours(wh); setHolidays(hol); setRequests(mine); setShifts(sh);
      setDrafts(Object.fromEntries(days.map((d) => {
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        const w = wh.find((x) => x.dayOfWeek === dow);
        return [d, { choice: 'none' as Choice, start: w?.openTime ?? '09:00', end: w?.closeTime ?? '18:00', note: '' }];
      })));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [weekStart, days, today, stylistId, toast]);

  useEffect(() => { void load(); }, [load]);

  const dayState = (date: string) => {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const wh = hours.find((h) => h.dayOfWeek === dow);
    const holiday = holidays.find((h) => h.startDate <= date && h.endDate >= date);
    const closed = holiday ? holiday.reason : wh?.isClosed ? 'Tiệm đóng cửa' : null;
    const past = date < today;
    const existing = shifts.filter((s) => s.workDate === date);
    const pending = requests.filter((r) => r.workDate === date && r.status === 'pending');
    return { wh, closed, past, existing, pending };
  };

  const patch = (date: string, change: Partial<DayDraft>) =>
    setDrafts((prev) => ({ ...prev, [date]: { ...prev[date], ...change } }));

  const items: ShiftRequestItem[] = days.flatMap((d): ShiftRequestItem[] => {
    const draft = drafts[d];
    if (!draft || draft.choice === 'none') return [];
    if (draft.choice === 'off') return [{ kind: 'time_off' as const, workDate: d, note: draft.note || undefined }];
    return [{ kind: 'shift' as const, workDate: d, startTime: draft.start, endTime: draft.end, note: draft.note || undefined }];
  });
  const invalid = days.some((d) => drafts[d]?.choice === 'shift' && timeToMinutes(drafts[d].end) <= timeToMinutes(drafts[d].start));
  const totalMinutes = days.reduce((sum, d) => sum + (drafts[d]?.choice === 'shift'
    ? Math.max(0, timeToMinutes(drafts[d].end) - timeToMinutes(drafts[d].start)) : 0), 0);

  const fillWorkdays = () => setDrafts((prev) => {
    const next = { ...prev };
    for (const d of days) {
      const st = dayState(d);
      if (!st.closed && !st.past && !st.existing.length && !st.pending.length) next[d] = { ...next[d], choice: 'shift' };
    }
    return next;
  });

  const submit = async () => {
    if (!items.length || invalid) return;
    setSending(true);
    try {
      const res = await shiftRequestsApi.submit(items);
      toast.success(`Đã gửi ${res.length} yêu cầu, chờ quản lý duyệt`);
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const cancel = async (r: ShiftRequest) => {
    try { await shiftRequestsApi.cancel(r.id); toast.success('Đã huỷ yêu cầu'); void load(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (!stylistId) {
    return <EmptyState title="Tài khoản chưa gắn hồ sơ thợ" description="Nhờ chủ tiệm liên kết tài khoản với hồ sơ thợ để đăng ký ca." />;
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Đăng ký lịch làm"
        description="Chọn ngày bạn rảnh (ca làm) hoặc xin nghỉ, gửi một lần cho cả tuần. Quản lý sẽ duyệt và sắp xếp phù hợp hoạt động của tiệm."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
          <Button size="sm" variant="ghost" aria-label="Tuần trước" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><ChevronLeft size={16} /></Button>
          <span className="px-2 text-sm font-semibold tabular-nums">{vnDate(weekStart)} – {vnDate(addDaysISO(weekStart, 6))}</span>
          <Button size="sm" variant="ghost" aria-label="Tuần sau" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><ChevronRight size={16} /></Button>
        </div>
        <Button size="sm" variant="outline" onClick={fillWorkdays}>Đăng ký cả tuần theo giờ mở cửa</Button>
      </div>

      {loading ? <Spinner /> : (
        <Card className="divide-y divide-slate-100 p-0">
          {days.map((d) => {
            const st = dayState(d);
            const draft = drafts[d];
            const locked = !!st.closed || st.past;
            const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
            return (
              <div key={d} className={`grid gap-3 px-4 py-3 md:grid-cols-[170px_220px_1fr] md:items-center ${locked ? 'bg-slate-50/70' : ''}`}>
                <div>
                  <p className="text-sm font-semibold text-ink">{DOW_LABELS[dow]} · {d.slice(8)}/{d.slice(5, 7)}</p>
                  <p className="text-xs text-ink-muted">
                    {st.closed ?? (st.wh ? `Mở cửa ${st.wh.openTime}–${st.wh.closeTime}` : '')}
                    {st.past ? ' · Đã qua' : ''}
                  </p>
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label={`Lựa chọn ngày ${d}`}>
                  {([['none', 'Bỏ qua'], ['shift', 'Ca làm'], ['off', 'Xin nghỉ']] as [Choice, string][]).map(([c, label]) => (
                    <button key={c} type="button" role="radio" aria-checked={draft?.choice === c}
                            disabled={locked || (c === 'shift' && st.existing.length > 0)}
                            title={c === 'shift' && st.existing.length ? 'Ngày này bạn đã được xếp ca' : undefined}
                            onClick={() => patch(d, { choice: c })}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40
                              ${draft?.choice === c
                                ? c === 'off' ? 'border-rose-400 bg-rose-50 text-rose-700' : c === 'shift' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-400 bg-slate-100 text-slate-700'
                                : 'border-slate-200 bg-white text-ink-soft hover:border-slate-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {draft?.choice === 'shift' && (
                    <>
                      <TimeSelect24 className="min-h-[36px] w-28" value={draft.start} onChange={(v) => patch(d, { start: v })}
                                    min={st.wh?.openTime} max={st.wh?.closeTime} aria-label={`Giờ bắt đầu ngày ${d}`} />
                      <span className="text-ink-muted">→</span>
                      <TimeSelect24 className="min-h-[36px] w-28" value={draft.end} onChange={(v) => patch(d, { end: v })}
                                    min={st.wh?.openTime} max={st.wh?.closeTime} aria-label={`Giờ kết thúc ngày ${d}`}
                                    invalid={timeToMinutes(draft.end) <= timeToMinutes(draft.start)} />
                    </>
                  )}
                  {draft && draft.choice !== 'none' && (
                    <Input className="min-h-[36px] min-w-[160px] flex-1" placeholder="Ghi chú (không bắt buộc)" value={draft.note}
                           onChange={(e) => patch(d, { note: e.target.value })} aria-label={`Ghi chú ngày ${d}`} />
                  )}
                  {st.existing.map((s) => (
                    <span key={s.id} className="chip border border-sky-200 bg-sky-50 text-sky-800">Đã xếp {s.startTime}–{s.endTime}</span>
                  ))}
                  {st.pending.map((r) => (
                    <span key={r.id} className="chip border border-amber-300 bg-amber-50 text-amber-900">
                      Chờ duyệt: {r.kind === 'shift' ? `${r.startTime}–${r.endTime}` : 'nghỉ'}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-pop backdrop-blur">
        <p className="text-sm text-ink-soft">
          {items.length ? <>Sẽ gửi <strong>{items.length}</strong> yêu cầu · tổng {formatDuration(totalMinutes)} làm việc</> : 'Chưa chọn ngày nào'}
        </p>
        <Button icon={<Send size={15} />} loading={sending} disabled={!items.length || invalid} onClick={submit}>Gửi quản lý duyệt</Button>
      </div>

      <SectionTitle title="Yêu cầu của tôi" description="30 ngày gần đây. Chỉ huỷ được yêu cầu còn chờ duyệt." />
      {requests.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 size={22} />} title="Chưa có yêu cầu nào" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {requests.slice().reverse().map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink">{r.dayText}</p>
                <p className="text-ink-soft">{r.kind === 'shift' ? `Ca làm ${r.startTime}–${r.endTime}` : r.startTime ? `Nghỉ ${r.startTime}–${r.endTime}` : 'Nghỉ cả ngày'}</p>
                {r.reviewNote && <p className="mt-0.5 text-xs text-ink-muted">Quản lý: {r.reviewNote}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`chip border ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                {r.status === 'pending' && (
                  <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => cancel(r)}>Huỷ</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
