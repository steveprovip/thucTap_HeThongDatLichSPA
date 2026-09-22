import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Plus, Save, Trash2 } from 'lucide-react';
import { getErrorMessage, workingHoursApi } from '@/api';
import type { Holiday, WorkingHour } from '@/types';
import { Button, Card, ConfirmDialog, Field, Input, Modal, SectionTitle, Spinner } from '@/components';
import { formatDate, timeToMinutes, todayISO } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** S1-08 + S2-02: giờ mở cửa theo thứ và ngày nghỉ của tiệm. */
export function WorkingHoursPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [rows, setRows] = useState<WorkingHour[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [hStart, setHStart] = useState(todayISO());
  const [hEnd, setHEnd] = useState(todayISO());
  const [hReason, setHReason] = useState('');
  const [hWarning, setHWarning] = useState<{ warning: string; affected: number; codes: string[] } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Holiday | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wh, hs] = await Promise.all([workingHoursApi.list(), workingHoursApi.holidays()]);
      setRows(wh); setHolidays(hs);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const patch = (dow: number, changes: Partial<WorkingHour>) => {
    setRows((list) => list.map((r) => (r.dayOfWeek === dow ? { ...r, ...changes } : r)));
    setErrors((e) => { const n = { ...e }; delete n[dow]; return n; });
  };

  const save = async () => {
    const nextErrors: Record<number, string> = {};
    for (const r of rows) {
      if (r.isClosed) continue;
      if (timeToMinutes(r.closeTime) - timeToMinutes(r.openTime) < 60) {
        nextErrors[r.dayOfWeek] = 'Giờ đóng phải sau giờ mở ít nhất 60 phút';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const updated = await workingHoursApi.update(
        rows.map(({ dayOfWeek, openTime, closeTime, isClosed }) => ({ dayOfWeek, openTime, closeTime, isClosed })),
      );
      setRows(updated);
      toast.success('Đã lưu giờ mở cửa');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const createHoliday = async (force = false) => {
    try {
      const res = await workingHoursApi.createHoliday({ startDate: hStart, endDate: hEnd, reason: hReason.trim(), force });
      if ('warning' in res) { setHWarning(res); return; }
      toast.success('Đã khai báo ngày nghỉ');
      setHolidayOpen(false); setHWarning(null); setHReason('');
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Giờ mở cửa &amp; ngày nghỉ"
        description="Mọi giờ lưu và hiển thị theo múi giờ Asia/Ho_Chi_Minh. Cuối tuần có thể cấu hình khung giờ dài hơn ngày thường."
        action={canEdit && <Button size="sm" loading={saving} onClick={save} icon={<Save size={15} />}>Lưu giờ mở cửa</Button>}
      />

      <Card className="overflow-hidden">
        <table className="table">
          <thead><tr><th>Thứ</th><th>Giờ mở</th><th>Giờ đóng</th><th>Đóng cửa cả ngày</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dayOfWeek}>
                <td className="font-medium">{r.dayLabel}</td>
                <td>
                  <input type="time" className="field-input min-h-[38px] w-32" value={r.openTime} disabled={!canEdit || r.isClosed}
                         onChange={(e) => patch(r.dayOfWeek, { openTime: e.target.value })} />
                </td>
                <td>
                  <input type="time" className="field-input min-h-[38px] w-32" value={r.closeTime} disabled={!canEdit || r.isClosed}
                         onChange={(e) => patch(r.dayOfWeek, { closeTime: e.target.value })} />
                  {errors[r.dayOfWeek] && <p className="field-error">{errors[r.dayOfWeek]}</p>}
                </td>
                <td>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 rounded border-brand-300" disabled={!canEdit}
                           checked={r.isClosed} onChange={(e) => patch(r.dayOfWeek, { isClosed: e.target.checked })} />
                    {r.isClosed ? 'Nghỉ' : 'Mở cửa'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle
        title="Ngày nghỉ của tiệm"
        description="Ngày nghỉ làm biến mất toàn bộ khung giờ trống tương ứng trên trang đặt lịch."
        action={canEdit && (
          <Button size="sm" variant="outline" icon={<Plus size={15} />}
                  onClick={() => { setHolidayOpen(true); setHWarning(null); }}>
            Khai báo ngày nghỉ
          </Button>
        )}
      />

      {holidays.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-muted">
          <CalendarOff size={26} className="mx-auto mb-2 text-brand-400" /> Chưa khai báo ngày nghỉ nào
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="table">
            <thead><tr><th>Từ ngày</th><th>Đến ngày</th><th>Lý do</th><th></th></tr></thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(`${h.startDate}T00:00:00+07:00`)}</td>
                  <td>{formatDate(`${h.endDate}T00:00:00+07:00`)}</td>
                  <td>{h.reason}</td>
                  <td className="text-right">
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(h)}>
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={holidayOpen}
        title="Khai báo ngày nghỉ của tiệm"
        onClose={() => { setHolidayOpen(false); setHWarning(null); }}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setHolidayOpen(false); setHWarning(null); }}>Đóng</Button>
            {hWarning
              ? <Button variant="danger" onClick={() => createHoliday(true)}>Vẫn lưu ngày nghỉ</Button>
              : <Button onClick={() => createHoliday(false)} disabled={!hReason.trim()}>Lưu</Button>}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Từ ngày" required>
              <input type="date" className="field-input" value={hStart} onChange={(e) => setHStart(e.target.value)} />
            </Field>
            <Field label="Đến ngày" required>
              <input type="date" className="field-input" value={hEnd} onChange={(e) => setHEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Lý do" required>
            <Input value={hReason} onChange={(e) => setHReason(e.target.value)}
                   placeholder="VD: Nghỉ Tết từ 28 tháng Chạp đến mùng 4" />
          </Field>
          {hWarning && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              {hWarning.warning}
              <span className="mt-1 block text-xs">Các lịch bị ảnh hưởng: {hWarning.codes.join(', ')}</span>
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá ngày nghỉ"
        message={`Xoá khai báo nghỉ "${removeTarget?.reason}"?`}
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await workingHoursApi.removeHoliday(removeTarget.id); toast.success('Đã xoá'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
