import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Copy, Plus, Trash2 } from 'lucide-react';
import { getErrorMessage, stylistsApi } from '@/api';
import type { Shift, Stylist, TimeOff } from '@/types';
import {
  Button, ConfirmDialog, Field, Input, Modal, SectionTitle, Select, Spinner,
} from '@/components';
import { addDaysISO, formatDate, startOfWeekISO, todayISO } from '@/utils/format';
import { DOW_LABELS } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** S2-01 + S2-02: xếp ca theo tuần, sao chép tuần, khai báo nghỉ riêng của thợ. */
export function ShiftsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [weekStart, setWeekStart] = useState(startOfWeekISO(todayISO()));
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);

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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const to = addDaysISO(weekStart, 6);
      const [sty, sh, off] = await Promise.all([
        stylistsApi.list({ isActive: true }),
        stylistsApi.shifts({ from: weekStart, to }),
        stylistsApi.timeOff({ from: weekStart, to }),
      ]);
      setStylists(sty); setShifts(sh); setTimeOff(off);
      if (!addStylist && sty.length) { setAddStylist(sty[0].id); setOffStylist(sty[0].id); }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, toast]);

  useEffect(() => { void load(); }, [load]);

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
    <div className="space-y-3">
      <SectionTitle
        title="Bảng ca làm theo tuần"
        description="Ca phải nằm trong giờ mở cửa và không chồng lấn nhau. Không xoá được ca đang chứa lịch hẹn."
        action={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => setCopyOpen(true)}>
              Sao chép sang tuần sau
            </Button>
            <Button size="sm" variant="outline" icon={<CalendarPlus size={15} />} onClick={() => setOffOpen(true)}>
              Khai báo nghỉ
            </Button>
            <Button size="sm" icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>Thêm ca</Button>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>Tuần trước</Button>
        <input type="date" className="field-input min-h-[36px] w-auto" value={weekStart}
               onChange={(e) => e.target.value && setWeekStart(startOfWeekISO(e.target.value))} />
        <Button size="sm" variant="outline" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>Tuần sau</Button>
        <span className="text-sm font-semibold">
          {formatDate(`${weekStart}T00:00:00+07:00`)} – {formatDate(`${addDaysISO(weekStart, 6)}T00:00:00+07:00`)}
        </span>
      </div>

      {loading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-brand-50">Thợ</th>
                {days.map((d) => (
                  <th key={d} className="min-w-[150px]">
                    {DOW_LABELS[new Date(`${d}T12:00:00Z`).getUTCDay()]}
                    <span className="block font-normal normal-case text-ink-muted">{d.slice(8)}/{d.slice(5, 7)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stylists.map((s) => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 bg-white font-medium">{s.fullName}</td>
                  {days.map((d) => {
                    const cellShifts = shifts.filter((x) => x.stylistId === s.id && x.workDate === d);
                    const offs = timeOff.filter((x) => x.stylistId === s.id && x.offDate === d);
                    return (
                      <td key={d} className="align-top">
                        {offs.map((o) => (
                          <span key={o.id} className="mb-1 block rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">
                            Nghỉ {o.startTime ? `${o.startTime.slice(0, 5)}–${o.endTime?.slice(0, 5)}` : 'cả ngày'}
                            {o.reason ? ` · ${o.reason}` : ''}
                          </span>
                        ))}
                        {cellShifts.length === 0 && offs.length === 0 && (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                        {cellShifts.map((sh) => (
                          <span key={sh.id}
                                className="mb-1 flex items-center justify-between gap-1 rounded-lg bg-brand-50 px-2 py-1 text-[11px]">
                            <span>
                              {sh.startTime}–{sh.endTime}
                              {sh.breakStart && <em className="block text-ink-muted">nghỉ {sh.breakStart}–{sh.breakEnd}</em>}
                            </span>
                            {canEdit && (
                              <button onClick={() => setRemoveTarget(sh)} aria-label="Xoá ca"
                                      className="shrink-0 text-red-600 hover:underline">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </span>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} title="Thêm ca làm" onClose={() => setAddOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setAddOpen(false)}>Đóng</Button>
               <Button onClick={addShift}>Thêm ca</Button>
             </div>}>
        <div className="space-y-3">
          <Field label="Thợ" required>
            <Select value={addStylist} onChange={(e) => setAddStylist(e.target.value)}>
              {stylists.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Ngày" required>
            <input type="date" className="field-input" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ bắt đầu" required>
              <input type="time" className="field-input" value={addStart} onChange={(e) => setAddStart(e.target.value)} />
            </Field>
            <Field label="Giờ kết thúc" required>
              <input type="time" className="field-input" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} />
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
                <input type="time" className="field-input" value={addBreakStart}
                       onChange={(e) => setAddBreakStart(e.target.value)} />
              </Field>
              <Field label="Nghỉ đến">
                <input type="time" className="field-input" value={addBreakEnd}
                       onChange={(e) => setAddBreakEnd(e.target.value)} />
              </Field>
            </div>
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
              <Field label="Từ giờ">
                <input type="time" className="field-input" value={offStart} onChange={(e) => setOffStart(e.target.value)} />
              </Field>
              <Field label="Đến giờ">
                <input type="time" className="field-input" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} />
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
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
