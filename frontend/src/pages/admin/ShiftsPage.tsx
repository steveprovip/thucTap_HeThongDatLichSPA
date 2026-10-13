import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Plus, Search } from 'lucide-react';
import { getErrorCode, getErrorDetails, getErrorMessage, shiftRequestsApi, stylistsApi, workingHoursApi } from '@/api';
import type { CoverageReport, Holiday, Shift, ShiftConflictAppointment, ShiftRequest, Stylist, TimeOff, WorkingHour } from '@/types';
import {
  Button, ConfirmDialog, Field, Input, Modal, Pagination, Select, Spinner, TimeSelect24,
} from '@/components';
import { useClientPage } from '@/utils/useClientPage';
import { addDaysISO, formatDate, formatDuration, startOfWeekISO, timeToMinutes, todayISO } from '@/utils/format';
import { DayInfo, QuickShift, ShiftBoard } from './shifts/ShiftBoard';
import { ShiftRequestsPanel } from './shifts/ShiftRequestsPanel';
import { CoveragePanel } from './shifts/CoveragePanel';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** S2-01 + S2-02: xếp ca theo tuần, sao chép tuần, khai báo nghỉ riêng của thợ. */
export function ShiftsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  /** Khớp RolesGuard backend: Chủ tiệm và Lễ tân được khai báo / huỷ ngày nghỉ của thợ (S2-02). */
  const canManageOff = user?.role === 'owner' || user?.role === 'receptionist';
  const toast = useToast();

  const [weekStart, setWeekStart] = useState(startOfWeekISO(todayISO()));
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  /** Mentor S2 · mục 6: lịch rảnh thợ tự đăng ký, chờ duyệt. */
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const canSeeRequests = user?.role === 'owner' || user?.role === 'receptionist' || user?.role === 'admin';
  /** Mentor S2 · mục 9: cảnh báo khung giờ chưa có thợ. */
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [minStaff, setMinStaff] = useState(1);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onlyScheduled, setOnlyScheduled] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addStylist, setAddStylist] = useState('');
  const [addDate, setAddDate] = useState(todayISO());
  const [addStart, setAddStart] = useState('09:00');
  const [addEnd, setAddEnd] = useState('18:00');
  const [addBreakStart, setAddBreakStart] = useState('12:00');
  const [addBreakEnd, setAddBreakEnd] = useState('13:00');
  const [hasBreak, setHasBreak] = useState(true);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyOverwrite, setCopyOverwrite] = useState(false);

  const [offOpen, setOffOpen] = useState(false);
  const [offStylist, setOffStylist] = useState('');
  const [offDate, setOffDate] = useState(todayISO());
  const [offAllDay, setOffAllDay] = useState(true);
  const [offStart, setOffStart] = useState('14:00');
  const [offEnd, setOffEnd] = useState('18:00');
  const [offReason, setOffReason] = useState('');
  const [offWarning, setOffWarning] = useState<{ warning: string; codes: string[] } | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Shift | null>(null);
  /** QA-10: huỷ nhanh khai báo nghỉ nhập nhầm. */
  const [removeOffTarget, setRemoveOffTarget] = useState<TimeOff | null>(null);
  /** QA-09: ca không xoá được vì đang chứa lịch hẹn -> liệt kê các lịch cần xử lý trước. */
  const [blocked, setBlocked] = useState<{ shift: Shift; appointments: ShiftConflictAppointment[] } | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);
  /** Lý do tiệm nghỉ từng ngày: ngày lễ / nghỉ đột xuất, hoặc thứ đóng cửa cố định. */
  const dayInfos = useMemo<DayInfo[]>(() => days.map((date) => {
    const holiday = holidays.find((h) => h.startDate <= date && h.endDate >= date);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const wh = hours.find((h) => h.dayOfWeek === dow);
    return {
      date, closedReason: holiday ? holiday.reason : wh?.isClosed ? 'Đóng cửa cố định' : null,
      openTime: wh && !wh.isClosed ? wh.openTime.slice(0, 5) : null, closeTime: wh && !wh.isClosed ? wh.closeTime.slice(0, 5) : null,
    };
  }), [days, holidays, hours]);
  const visibleStylists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stylists
      .filter((s) => !q || s.fullName.toLowerCase().includes(q))
      .filter((s) => !onlyScheduled || shifts.some((x) => x.stylistId === s.id));
  }, [stylists, shifts, query, onlyScheduled]);
  // Bảng ca nhiều thợ: phân trang theo hàng thợ (10 thợ / trang), lọc / đổi tuần → về trang 1
  const stylistPage = useClientPage(visibleStylists, 10, `${query}|${onlyScheduled}`);
  const addHours = useMemo(() => {
    const dow = new Date(`${addDate}T12:00:00Z`).getUTCDay();
    return hours.find((h) => h.dayOfWeek === dow);
  }, [hours, addDate]);
  const addDuration = timeToMinutes(addEnd) - timeToMinutes(addStart)
    - (hasBreak ? Math.max(0, timeToMinutes(addBreakEnd) - timeToMinutes(addBreakStart)) : 0);
  const addError = timeToMinutes(addEnd) <= timeToMinutes(addStart) ? 'Giờ kết thúc phải sau giờ bắt đầu'
    : hasBreak && (timeToMinutes(addBreakStart) < timeToMinutes(addStart) || timeToMinutes(addBreakEnd) > timeToMinutes(addEnd)
      || timeToMinutes(addBreakEnd) <= timeToMinutes(addBreakStart)) ? 'Giờ nghỉ phải nằm trong ca và kết thúc sau khi bắt đầu'
      : null;

  const openAdd = (stylistId?: string, date?: string) => {
    if (stylistId) setAddStylist(stylistId);
    if (date) setAddDate(date);
    setAddOpen(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const to = addDaysISO(weekStart, 6);
      const [sty, sh, off, hol, wh] = await Promise.all([
        stylistsApi.list({ isActive: true }),
        stylistsApi.shifts({ from: weekStart, to }),
        stylistsApi.timeOff({ from: weekStart, to }),
        workingHoursApi.holidays({ from: weekStart, to }),
        workingHoursApi.list(),
      ]);
      setStylists(sty); setShifts(sh); setTimeOff(off); setHolidays(hol); setHours(wh);
      // Hộp yêu cầu là phần phụ: lỗi tải (vd. máy chủ cũ chưa có API) không được làm hỏng bảng ca
      setRequests(canSeeRequests
        ? await shiftRequestsApi.list({ status: 'pending', from: weekStart, to }).catch(() => [] as ShiftRequest[])
        : []);
      setCoverage(canSeeRequests
        ? await stylistsApi.coverage({ from: weekStart, to, minStaff }).catch(() => null)
        : null);
      if (!addStylist && sty.length) { setAddStylist(sty[0].id); setOffStylist(sty[0].id); }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, minStaff, toast]);

  useEffect(() => { void load(); }, [load]);

  /** TASK v3 · NV3: thêm ca một chạm từ popover (ca mẫu đã cắt theo giờ mở cửa). Lỗi → toast, popover giữ nguyên. */
  const quickAdd = async (stylistId: string, date: string, s: QuickShift) => {
    try {
      await stylistsApi.createShifts(stylistId, [{ workDate: date, ...s }]);
      toast.success(`Đã thêm ca ${s.startTime}–${s.endTime}`);
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); throw e; }
  };
  const updateShift = async (shift: Shift, patch: { startTime: string; endTime: string }) => {
    try {
      // Nghỉ giữa ca không còn nằm trọn trong ca mới thì bỏ (máy chủ từ chối nghỉ giữa ca nằm ngoài ca)
      const keepBreak = shift.breakStart && shift.breakEnd
        && shift.breakStart.slice(0, 5) >= patch.startTime && shift.breakEnd.slice(0, 5) <= patch.endTime;
      await stylistsApi.updateShift(shift.id, { ...patch, ...(keepBreak ? {} : { breakStart: null, breakEnd: null }) });
      toast.success('Đã đổi giờ ca');
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); throw e; }
  };

  /** Ghi chú test 13/10 — kéo thả ca kiểu Jira. */
  const moveShift = async (shift: Shift, stylistId: string, date: string, copy: boolean) => {
    try {
      await stylistsApi.moveShift(shift.id, {
        ...(stylistId !== shift.stylistId ? { stylistId } : {}), ...(date !== shift.workDate ? { workDate: date } : {}), ...(copy ? { copy: true } : {}),
      });
      const who = stylistPage.items.find((s) => s.id === stylistId)?.fullName ?? '';
      toast.success(`${copy ? 'Đã sao chép' : 'Đã chuyển'} ca ${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)} sang ${who} ngày ${date.slice(8)}/${date.slice(5, 7)}`);
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); throw e; }
  };

  const addShift = async () => {
    try {
      await stylistsApi.createShifts(addStylist, [{
        workDate: addDate, startTime: addStart, endTime: addEnd,
        breakStart: hasBreak ? addBreakStart : null,
        breakEnd: hasBreak ? addBreakEnd : null,
      }]);
      toast.success('Đã thêm ca làm');
      setAddOpen(false); void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const copyWeek = async () => {
    try {
      const res = await stylistsApi.copyWeek({
        sourceWeekStart: weekStart, targetWeekStart: addDaysISO(weekStart, 7), overwrite: copyOverwrite,
      });
      toast.success(`Đã tạo ${res.created} ca cho tuần sau` +
        (res.skipped ? `, bỏ qua ${res.skipped} ca do ngày đích đã có ca hoặc đã có lịch hẹn` : ''));
      setCopyOpen(false);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const addTimeOff = async (force = false) => {
    try {
      const res = await stylistsApi.createTimeOff(offStylist, {
        offDate, startTime: offAllDay ? null : offStart, endTime: offAllDay ? null : offEnd,
        reason: offReason || undefined, force,
      });
      if (res && typeof res === 'object' && 'warning' in res) {
        setOffWarning(res as { warning: string; codes: string[] });
        return;
      }
      toast.success('Đã khai báo ngày nghỉ của thợ');
      setOffOpen(false); setOffWarning(null); void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-2">
      {/* QA 11/10: tiêu đề + điều hướng tuần + thao tác gộp MỘT hàng để bảng ca vừa một màn hình */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-lg font-bold text-ink"
            title="Ca phải nằm trong giờ mở cửa và không chồng lấn nhau. Không xoá được ca đang chứa lịch hẹn.">
          Ca làm theo tuần
        </h1>
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
          <Button size="sm" variant="ghost" aria-label="Tuần trước" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>
            <ChevronLeft size={16} />
          </Button>
          <span className="px-2 text-sm font-semibold tabular-nums">
            {formatDate(`${weekStart}T00:00:00+07:00`)} – {formatDate(`${addDaysISO(weekStart, 6)}T00:00:00+07:00`)}
          </span>
          <Button size="sm" variant="ghost" aria-label="Tuần sau" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeekISO(todayISO()))}>Tuần này</Button>
        <input type="date" aria-label="Chọn tuần" className="field-input min-h-[34px] w-auto py-1" value={weekStart}
               onChange={(e) => e.target.value && setWeekStart(startOfWeekISO(e.target.value))} />
        <div className="relative w-full sm:w-44">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm thợ" aria-label="Tìm thợ"
                 className="min-h-[34px] py-1 pl-8" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={onlyScheduled}
                 onChange={(e) => setOnlyScheduled(e.target.checked)} />
          Chỉ thợ có ca
        </label>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {canEdit && (
            <Button size="sm" variant="outline" icon={<Copy size={14} />} onClick={() => setCopyOpen(true)} title="Sao chép bảng ca sang tuần sau">
              Chép sang tuần sau
            </Button>
          )}
          {canManageOff && (
            // Lễ tân không xếp ca nhưng vẫn được khai báo / huỷ nghỉ cho thợ
            <Button size="sm" variant="outline" icon={<CalendarPlus size={14} />} onClick={() => setOffOpen(true)}>
              Khai báo nghỉ
            </Button>
          )}
          {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => openAdd()}>Thêm ca</Button>}
        </div>
      </div>

      {!loading && (
        <ShiftRequestsPanel requests={requests} canApprove={canManageOff} timeOffOnly={!canEdit} onChanged={() => void load()} />
      )}

      {!loading && (
        <CoveragePanel report={coverage} minStaff={minStaff} onMinStaff={setMinStaff} canEdit={canEdit} onChanged={() => void load()} />
      )}

      {loading ? <Spinner /> : (
        <>
        <ShiftBoard
          days={dayInfos}
          stylists={stylistPage.items}
          shifts={shifts}
          timeOff={timeOff}
          pendingRequests={requests}
          understaffedDates={new Set(coverage?.days.filter((d) => d.gaps.length).map((d) => d.date) ?? [])}
          today={todayISO()}
          canEdit={canEdit}
          canManageOff={canManageOff}
          onAdd={(stylistId, date) => openAdd(stylistId, date)}
          onQuickAdd={quickAdd}
          onUpdateShift={updateShift}
          onRemoveShift={setRemoveTarget}
          onRemoveOff={setRemoveOffTarget}
          onMoveShift={moveShift}
        />
        <Pagination page={stylistPage.page} totalPages={stylistPage.totalPages} total={stylistPage.total} onChange={stylistPage.setPage}
                    limit={stylistPage.limit} onLimitChange={stylistPage.setLimit} />
        </>
      )}

      <Modal open={addOpen} title="Thêm ca làm" onClose={() => setAddOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setAddOpen(false)}>Đóng</Button>
               <Button onClick={addShift} disabled={!!addError}>Thêm ca</Button>
             </div>}>
        <div className="space-y-3">
          <Field label="Thợ" required>
            <Select value={addStylist} onChange={(e) => setAddStylist(e.target.value)}>
              {stylists.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Ngày" required
                 hint={addHours ? (addHours.isClosed ? 'Tiệm đóng cửa ngày này' : `Giờ mở cửa: ${addHours.openTime}–${addHours.closeTime}`) : undefined}>
            <input type="date" className="field-input" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5" aria-label="Mẫu ca nhanh">
            {[['Ca sáng', '08:00', '12:00'], ['Ca chiều', '13:00', '17:00'], ['Ca tối', '17:00', '21:00'], ['Cả ngày', '09:00', '18:00']].map(([label, a, b]) => (
              <button key={label} type="button" onClick={() => { setAddStart(a); setAddEnd(b); setHasBreak(label === 'Cả ngày'); }}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-ink-soft hover:border-teal-500 hover:text-teal-700">
                {label} {a}–{b}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ bắt đầu (24h)" required>
              <TimeSelect24 value={addStart} onChange={setAddStart} aria-label="Giờ bắt đầu ca" />
            </Field>
            <Field label="Giờ kết thúc (24h)" required error={addError ?? undefined}>
              <TimeSelect24 value={addEnd} onChange={setAddEnd} invalid={!!addError} aria-label="Giờ kết thúc ca" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                   checked={hasBreak} onChange={(e) => setHasBreak(e.target.checked)} />
            Có nghỉ giữa ca
          </label>
          {hasBreak && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nghỉ từ">
                <TimeSelect24 value={addBreakStart} onChange={setAddBreakStart} min={addStart} max={addEnd} aria-label="Nghỉ giữa ca từ" />
              </Field>
              <Field label="Nghỉ đến">
                <TimeSelect24 value={addBreakEnd} onChange={setAddBreakEnd} min={addStart} max={addEnd} aria-label="Nghỉ giữa ca đến" />
              </Field>
            </div>
          )}
          {!addError && (
            <p className="text-xs text-ink-muted">Thời gian làm thực tế: <strong>{formatDuration(Math.max(0, addDuration))}</strong></p>
          )}
        </div>
      </Modal>

      <Modal open={copyOpen} title="Sao chép bảng ca sang tuần sau" onClose={() => setCopyOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setCopyOpen(false)}>Đóng</Button>
               <Button onClick={copyWeek}>Sao chép</Button>
             </div>}>
        <p className="text-sm text-ink-soft">
          Sao chép toàn bộ ca của tuần {formatDate(`${weekStart}T00:00:00+07:00`)} sang tuần bắt đầu{' '}
          {formatDate(`${addDaysISO(weekStart, 7)}T00:00:00+07:00`)}.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300"
                 checked={copyOverwrite} onChange={(e) => setCopyOverwrite(e.target.checked)} />
          <span>
            Ghi đè các ngày đã có ca ở tuần đích.
            <span className="block text-xs text-ink-muted">
              Ngày đã có lịch hẹn giữ chỗ sẽ luôn được bỏ qua để không làm mất lịch của khách.
            </span>
          </span>
        </label>
      </Modal>

      <Modal open={offOpen} title="Khai báo ngày nghỉ của thợ" onClose={() => { setOffOpen(false); setOffWarning(null); }}
             size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => { setOffOpen(false); setOffWarning(null); }}>Đóng</Button>
               {offWarning
                 ? <Button variant="danger" onClick={() => addTimeOff(true)}>Vẫn lưu</Button>
                 : <Button onClick={() => addTimeOff(false)}>Lưu</Button>}
             </div>}>
        <div className="space-y-3">
          <Field label="Thợ" required>
            <Select value={offStylist} onChange={(e) => setOffStylist(e.target.value)}>
              {stylists.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Ngày nghỉ" required>
            <input type="date" className="field-input" value={offDate} onChange={(e) => setOffDate(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                   checked={offAllDay} onChange={(e) => setOffAllDay(e.target.checked)} />
            Nghỉ cả ngày
          </label>
          {!offAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Từ giờ (24h)">
                <TimeSelect24 value={offStart} onChange={setOffStart} aria-label="Nghỉ từ giờ" />
              </Field>
              <Field label="Đến giờ (24h)">
                <TimeSelect24 value={offEnd} onChange={setOffEnd} aria-label="Nghỉ đến giờ" />
              </Field>
            </div>
          )}
          <Field label="Lý do">
            <Input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="VD: nghỉ phép cá nhân" />
          </Field>
          {offWarning && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              {offWarning.warning}
              <span className="mt-1 block text-xs">Lịch bị ảnh hưởng: {offWarning.codes.join(', ')}</span>
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá ca làm"
        message={`Xoá ca ${removeTarget?.startTime}–${removeTarget?.endTime} ngày ${removeTarget?.workDate} của ${removeTarget?.stylistName}?`}
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await stylistsApi.removeShift(removeTarget.id); toast.success('Đã xoá ca'); void load(); }
          catch (e) {
            const appointments = getErrorDetails(e).appointments;
            if (getErrorCode(e) === 'SHIFT_HAS_APPOINTMENTS' && appointments?.length) {
              setBlocked({ shift: removeTarget, appointments });
            } else {
              toast.error(getErrorMessage(e));
            }
          }
        }}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!removeOffTarget}
        danger
        title="Huỷ khai báo nghỉ"
        confirmLabel="Huỷ khai báo"
        message={`Huỷ khai báo nghỉ ${removeOffTarget?.startTime
          ? `${removeOffTarget.startTime.slice(0, 5)}–${removeOffTarget.endTime?.slice(0, 5)}` : 'cả ngày'} ngày ${removeOffTarget?.offDate}?`
          + ' Khung giờ của thợ sẽ mở lại cho khách đặt.'}
        onConfirm={async () => {
          if (!removeOffTarget) return;
          try { await stylistsApi.removeTimeOff(removeOffTarget.id); toast.success('Đã huỷ khai báo nghỉ'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveOffTarget(null)}
      />

      <Modal open={!!blocked} title="Không xoá được ca đang có lịch hẹn" onClose={() => setBlocked(null)} size="sm"
             footer={<div className="flex justify-end"><Button onClick={() => setBlocked(null)}>Đã hiểu</Button></div>}>
        <p className="text-sm text-ink-soft">
          Ca {blocked?.shift.startTime}–{blocked?.shift.endTime} ngày {blocked?.shift.workDate} của {blocked?.shift.stylistName}{' '}
          đang chứa {blocked?.appointments.length} lịch hẹn. Hãy chuyển thợ, đổi giờ hoặc huỷ các lịch dưới đây rồi xoá ca.
        </p>
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {blocked?.appointments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-mono font-semibold">{a.code}</span>
                <span className="block truncate text-xs text-ink-muted">{a.startTime}–{a.endTime}{a.customerName ? ` · ${a.customerName}` : ''}</span>
              </span>
              <Link to={`/quan-ly/lich-hen/${a.id}`} className="shrink-0 text-xs font-semibold text-teal-700 hover:underline">
                Xử lý lịch
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
