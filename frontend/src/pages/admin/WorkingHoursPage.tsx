import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarOff, Copy, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { getErrorMessage, workingHoursApi } from '@/api';
import type { Holiday, WorkingHour } from '@/types';
import {
  Button, Card, ConfirmDialog, Field, Input, Modal, Notice, SectionTitle, Spinner, Toggle,
} from '@/components';
import { addDaysISO, formatDate, formatDuration, timeToMinutes, todayISO } from '@/utils/format';
import { DOW_LABELS, DOW_ORDER } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const MIN_OPEN_MINUTES = 60;
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 0];

type HolidayWarning = { warning: string; affected: number; codes: string[] };

const rowError = (r: WorkingHour): string | null => {
  if (r.isClosed) return null;
  if (!r.openTime || !r.closeTime) return 'Vui lòng nhập đủ giờ mở và giờ đóng';
  const diff = timeToMinutes(r.closeTime) - timeToMinutes(r.openTime);
  if (diff <= 0) return 'Giờ đóng phải sau giờ mở';
  if (diff < MIN_OPEN_MINUTES) return `Giờ đóng phải sau giờ mở ít nhất ${MIN_OPEN_MINUTES} phút`;
  return null;
};

const dayCount = (start: string, end: string) =>
  Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000) + 1;

const vnDate = (iso: string) => formatDate(`${iso}T00:00:00+07:00`);

/** S1-08 + S2-02: giờ mở cửa theo thứ trong tuần và ngày nghỉ của tiệm. */
export function WorkingHoursPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner'; // khớp RolesGuard backend: Admin chỉ xem (PERMISSION_MATRIX)
  const toast = useToast();

  const [rows, setRows] = useState<WorkingHour[]>([]);
  const [saved, setSaved] = useState<WorkingHour[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [holidayOpen, setHolidayOpen] = useState(false);
  const [hStart, setHStart] = useState(todayISO());
  const [hEnd, setHEnd] = useState(todayISO());
  const [hReason, setHReason] = useState('');
  const [hTouched, setHTouched] = useState(false);
  const [hWarning, setHWarning] = useState<HolidayWarning | null>(null);
  const [hSaving, setHSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Holiday | null>(null);

  const load = useCallback(async () => {
    try {
      const [wh, hs] = await Promise.all([workingHoursApi.list(), workingHoursApi.holidays()]);
      const ordered = DOW_ORDER.map((d) => wh.find((r) => r.dayOfWeek === d)
        ?? { id: `new-${d}`, dayOfWeek: d, dayLabel: DOW_LABELS[d], openTime: '08:00', closeTime: '21:00', isClosed: true });
      setRows(ordered); setSaved(ordered);
      setHolidays([...hs].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const errors = useMemo(() => Object.fromEntries(rows.map((r) => [r.dayOfWeek, rowError(r)])), [rows]);
  const hasErrors = Object.values(errors).some(Boolean);

  const weeklyMinutes = rows.reduce((sum, r) =>
    sum + (r.isClosed || errors[r.dayOfWeek] ? 0 : timeToMinutes(r.closeTime) - timeToMinutes(r.openTime)), 0);

  const patch = (dow: number, changes: Partial<WorkingHour>) =>
    setRows((list) => list.map((r) => (r.dayOfWeek === dow ? { ...r, ...changes } : r)));

  const copyFrom = (sourceDow: number, targets: number[]) => {
    const src = rows.find((r) => r.dayOfWeek === sourceDow);
    if (!src) return;
    setRows((list) => list.map((r) => (targets.includes(r.dayOfWeek)
      ? { ...r, openTime: src.openTime, closeTime: src.closeTime, isClosed: src.isClosed } : r)));
    toast.success(`Đã chép giờ ${DOW_LABELS[sourceDow]} sang ${targets.length} ngày`);
  };

  const save = async () => {
    setSubmitted(true);
    if (hasErrors) return toast.error('Còn ngày có giờ mở cửa chưa hợp lệ');
    setSaving(true);
    try {
      const updated = await workingHoursApi.update(
        rows.map(({ dayOfWeek, openTime, closeTime, isClosed }) => ({ dayOfWeek, openTime, closeTime, isClosed })),
      );
      const ordered = DOW_ORDER.map((d) => updated.find((r) => r.dayOfWeek === d)).filter(Boolean) as WorkingHour[];
      setRows(ordered); setSaved(ordered); setSubmitted(false);
      toast.success('Đã lưu giờ mở cửa');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------ Ngày nghỉ
  const hErrors = {
    range: hEnd < hStart ? 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu' : undefined,
    past: hStart < todayISO() ? 'Không khai báo ngày nghỉ trong quá khứ' : undefined,
    reason: !hReason.trim() ? 'Vui lòng nhập lý do nghỉ' : undefined,
    overlap: holidays.some((h) => h.startDate <= hEnd && h.endDate >= hStart)
      ? 'Khoảng ngày này trùng với ngày nghỉ đã khai báo' : undefined,
  };
  const hShown: Partial<typeof hErrors> = hTouched ? hErrors : {};

  const openHoliday = () => {
    const start = addDaysISO(todayISO(), 1);
    setHStart(start); setHEnd(start); setHReason(''); setHTouched(false); setHWarning(null); setHolidayOpen(true);
  };

  const createHoliday = async (force = false) => {
    setHTouched(true);
    if (Object.values(hErrors).some(Boolean)) return;
    setHSaving(true);
    try {
      const res = await workingHoursApi.createHoliday({ startDate: hStart, endDate: hEnd, reason: hReason.trim(), force });
      if ('warning' in res) { setHWarning(res); return; }
      toast.success('Đã khai báo ngày nghỉ');
      setHolidayOpen(false);
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setHSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const today = todayISO();
  const upcoming = holidays.filter((h) => h.endDate >= today);
  const past = holidays.filter((h) => h.endDate < today);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Giờ mở cửa & ngày nghỉ"
        description="Giờ lưu và hiển thị theo múi giờ Asia/Ho_Chi_Minh. Mỗi ngày mở cửa tối thiểu 60 phút."
        action={canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />}
                      onClick={() => { setRows(saved); setSubmitted(false); }}>
                Hoàn tác
              </Button>
            )}
            <Button size="sm" loading={saving} onClick={save} disabled={!dirty} icon={<Save size={15} />}>
              Lưu giờ mở cửa
            </Button>
          </div>
        )}
      />

      {dirty && <Notice tone="warning">Bạn có thay đổi chưa lưu.</Notice>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-bold">Lịch mở cửa hàng tuần</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>Tổng {formatDuration(weeklyMinutes)}/tuần</span>
            {canEdit && (
              <>
                <Button size="sm" variant="outline" icon={<Copy size={13} />} onClick={() => copyFrom(1, WEEKDAYS)}>
                  Chép Thứ hai → T2–T6
                </Button>
                <Button size="sm" variant="outline" icon={<Copy size={13} />} onClick={() => copyFrom(6, WEEKEND)}>
                  Chép Thứ bảy → CN
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Thứ</th><th>Mở cửa</th><th>Giờ mở</th><th>Giờ đóng</th><th>Thời lượng</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const err = submitted || dirty ? errors[r.dayOfWeek] : null;
                const minutes = timeToMinutes(r.closeTime) - timeToMinutes(r.openTime);
                return (
                  <tr key={r.dayOfWeek} className={WEEKEND.includes(r.dayOfWeek) ? 'bg-slate-50/60' : ''}>
                    <td className="whitespace-nowrap font-medium">
                      {DOW_LABELS[r.dayOfWeek]}
                      {WEEKEND.includes(r.dayOfWeek) && <span className="ml-1.5 text-[11px] text-teal-700">cuối tuần</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Toggle size="sm" checked={!r.isClosed} disabled={!canEdit}
                                onChange={(open) => patch(r.dayOfWeek, { isClosed: !open })}
                                label={`${DOW_LABELS[r.dayOfWeek]}: ${r.isClosed ? 'nghỉ' : 'mở cửa'}`} />
                        <span className={`text-xs ${r.isClosed ? 'text-ink-muted' : 'text-emerald-700'}`}>
                          {r.isClosed ? 'Nghỉ' : 'Mở'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <input type="time" step={900} className="field-input min-h-[38px] w-32" value={r.openTime}
                             disabled={!canEdit || r.isClosed} aria-label={`Giờ mở ${DOW_LABELS[r.dayOfWeek]}`}
                             onChange={(e) => patch(r.dayOfWeek, { openTime: e.target.value })} />
                    </td>
                    <td>
                      <input type="time" step={900}
                             className={`field-input min-h-[38px] w-32 ${err ? 'border-red-400' : ''}`}
                             value={r.closeTime} disabled={!canEdit || r.isClosed}
                             aria-label={`Giờ đóng ${DOW_LABELS[r.dayOfWeek]}`} aria-invalid={!!err}
                             onChange={(e) => patch(r.dayOfWeek, { closeTime: e.target.value })} />
                      {err && <p className="field-error text-red-600">{err}</p>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-soft">
                      {r.isClosed ? '—' : minutes > 0 ? formatDuration(minutes) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle
        title="Ngày nghỉ của tiệm"
        description="Trong ngày nghỉ, mọi khung giờ trống trên trang đặt lịch đều bị ẩn."
        action={canEdit && (
          <Button size="sm" variant="outline" icon={<Plus size={15} />} onClick={openHoliday}>Khai báo ngày nghỉ</Button>
        )}
      />

      {holidays.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-muted">
          <CalendarOff size={26} className="mx-auto mb-2 text-teal-600" /> Chưa khai báo ngày nghỉ nào
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Từ ngày</th><th>Đến ngày</th><th>Số ngày</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {[...upcoming, ...past].map((h) => {
                const isPast = h.endDate < today;
                const ongoing = h.startDate <= today && h.endDate >= today;
                return (
                  <tr key={h.id} className={isPast ? 'opacity-60' : ''}>
                    <td className="whitespace-nowrap">{vnDate(h.startDate)}</td>
                    <td className="whitespace-nowrap">{vnDate(h.endDate)}</td>
                    <td>{dayCount(h.startDate, h.endDate)}</td>
                    <td>{h.reason}</td>
                    <td>
                      {ongoing ? <span className="chip border border-red-200 bg-red-50 text-red-700">Đang nghỉ</span>
                        : isPast ? <span className="chip border border-slate-300 text-slate-500">Đã qua</span>
                          : <span className="chip border border-sky-200 bg-sky-50 text-sky-800">Sắp tới</span>}
                    </td>
                    <td className="text-right">
                      {canEdit && !isPast && (
                        <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(h)} aria-label="Xoá ngày nghỉ">
                          <Trash2 size={14} className="text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={holidayOpen}
        title="Khai báo ngày nghỉ của tiệm"
        onClose={() => setHolidayOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHolidayOpen(false)}>Đóng</Button>
            {hWarning
              ? <Button variant="danger" loading={hSaving} onClick={() => createHoliday(true)}>Vẫn lưu ngày nghỉ</Button>
              : <Button loading={hSaving} onClick={() => createHoliday(false)}>Lưu ngày nghỉ</Button>}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Từ ngày" required error={hShown.past}>
              <input type="date" className="field-input" value={hStart} min={today}
                     onChange={(e) => { setHStart(e.target.value); if (e.target.value > hEnd) setHEnd(e.target.value); setHWarning(null); }} />
            </Field>
            <Field label="Đến ngày" required error={hShown.range}>
              <input type="date" className="field-input" value={hEnd} min={hStart}
                     onChange={(e) => { setHEnd(e.target.value); setHWarning(null); }} />
            </Field>
          </div>
          {!hErrors.range && (
            <p className="text-xs text-ink-muted">Tiệm nghỉ {dayCount(hStart, hEnd)} ngày.</p>
          )}
          <Field label="Lý do" required error={hShown.reason}>
            <Input value={hReason} maxLength={200} onChange={(e) => setHReason(e.target.value)}
                   placeholder="VD: Nghỉ Tết Nguyên đán" invalid={!!hShown.reason} />
          </Field>
          {hShown.overlap && <Notice tone="danger">{hShown.overlap}</Notice>}
          {hWarning && (
            <Notice tone="warning" icon={<AlertTriangle size={16} />} title={hWarning.warning}>
              <span className="text-xs">Lịch bị ảnh hưởng: {hWarning.codes.join(', ')}</span>
            </Notice>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá ngày nghỉ"
        confirmLabel="Xoá"
        message={`Xoá khai báo nghỉ “${removeTarget?.reason}”? Các khung giờ trong những ngày này sẽ mở lại cho khách đặt.`}
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await workingHoursApi.removeHoliday(removeTarget.id); toast.success('Đã xoá ngày nghỉ'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
