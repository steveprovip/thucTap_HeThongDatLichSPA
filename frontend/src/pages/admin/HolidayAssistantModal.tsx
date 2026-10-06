import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Moon, Sparkles, Sun } from 'lucide-react';
import { getErrorMessage, workingHoursApi } from '@/api';
import type { HolidaySuggestion } from '@/types';
import { Button, Modal, Notice, Select, Spinner } from '@/components';
import { formatDate } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

const vnDate = (iso: string) => formatDate(`${iso}T00:00:00+07:00`);

const STATUS_LABEL: Record<HolidaySuggestion['status'], { text: string; cls: string }> = {
  ready: { text: 'Sẵn sàng', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  exists: { text: 'Đã khai báo', cls: 'border-slate-300 bg-slate-50 text-slate-600' },
  conflict: { text: 'Trùng lịch khách', cls: 'border-amber-300 bg-amber-50 text-amber-900' },
  past: { text: 'Đã qua', cls: 'border-slate-200 text-slate-400' },
};

/**
 * Mentor Sprint 2 · mục 5 — Trợ lý AI sinh toàn bộ ngày lễ trong năm, 1 cú nhấp.
 * Ngày âm lịch (Tết, Giỗ Tổ) được tính bằng thuật toán âm lịch thiên văn trên máy chủ, không cần Internet.
 * Ngày nào đang có lịch hẹn của khách bị bỏ chọn sẵn để ngày nghỉ của tiệm không "chèn" lên lịch đã đặt.
 */
export function HolidayAssistantModal({ open, onClose, onApplied }: {
  open: boolean; onClose: () => void; onApplied: () => void;
}) {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [items, setItems] = useState<HolidaySuggestion[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await workingHoursApi.holidaySuggestions(year);
      setItems(list);
      setPicked(new Set(list.filter((h) => h.status === 'ready').map((h) => h.key)));
    } catch (e) {
      toast.error(getErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, toast]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const conflictsPicked = useMemo(
    () => items.filter((h) => picked.has(h.key) && h.status === 'conflict'), [items, picked],
  );
  const toggle = (key: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const apply = async () => {
    if (!picked.size) return;
    setSaving(true);
    try {
      const res = await workingHoursApi.generateHolidays({
        year, keys: Array.from(picked), force: conflictsPicked.length > 0,
      });
      toast.success(`Đã tạo ${res.created.length} ngày lễ năm ${year}`
        + (res.skipped.length ? `, bỏ qua ${res.skipped.length} (${res.skipped.map((s) => s.name).join(', ')})` : ''));
      onApplied();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={`Trợ lý AI · Sinh ngày lễ năm ${year}`} onClose={() => { if (!saving) onClose(); }} size="lg"
           footer={(
             <div className="flex flex-wrap items-center justify-between gap-2">
               <span className="text-xs text-ink-muted">Đã chọn {picked.size} ngày lễ</span>
               <div className="flex gap-2">
                 <Button variant="ghost" disabled={saving} onClick={onClose}>Đóng</Button>
                 <Button loading={saving} disabled={!picked.size} icon={<CalendarCheck2 size={15} />} onClick={apply}
                         variant={conflictsPicked.length ? 'danger' : 'primary'}>
                   {conflictsPicked.length ? 'Áp dụng (kể cả ngày trùng lịch khách)' : 'Áp dụng 1-click'}
                 </Button>
               </div>
             </div>
           )}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles size={16} className="text-teal-600" />
          <p className="flex-1 text-sm text-ink-soft">
            Tự tính theo Bộ luật Lao động và âm lịch Việt Nam (Tết Nguyên Đán, Giỗ Tổ Hùng Vương). Ngày đang có
            lịch hẹn của khách được bỏ chọn sẵn.
          </p>
          <Select aria-label="Năm" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear + 1, thisYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>

        {loading ? <Spinner label="Đang tính ngày lễ…" /> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((h) => {
              const disabled = h.status === 'exists' || h.status === 'past';
              const st = STATUS_LABEL[h.status];
              return (
                <li key={h.key} className={`flex items-start gap-3 px-3 py-2.5 ${disabled ? 'opacity-60' : ''}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" disabled={disabled}
                         aria-label={`Chọn ${h.name}`} checked={picked.has(h.key)} onChange={() => toggle(h.key)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {h.calendar === 'lunar' ? <Moon size={14} className="text-indigo-500" /> : <Sun size={14} className="text-amber-500" />}
                      {h.name}
                      <span className={`chip border ${st.cls}`}>{st.text}</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {vnDate(h.startDate)}{h.endDate !== h.startDate ? ` → ${vnDate(h.endDate)}` : ''} · {h.days} ngày · {h.rule}
                    </p>
                    {h.status === 'conflict' && (
                      <p className="mt-0.5 text-xs text-amber-800">
                        {h.affectedAppointments} lịch hẹn chưa hoàn tất: {h.affectedCodes.slice(0, 6).join(', ')}
                        {h.affectedCodes.length > 6 ? '…' : ''}. Nên dời/huỷ các lịch này trước.
                      </p>
                    )}
                    {h.status === 'exists' && h.existingReason && (
                      <p className="mt-0.5 text-xs text-ink-muted">Đã có ngày nghỉ “{h.existingReason}”.</p>
                    )}
                    {h.note && <p className="mt-0.5 text-xs italic text-ink-muted">{h.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {conflictsPicked.length > 0 && (
          <Notice tone="warning" title="Có ngày lễ trùng lịch hẹn của khách">
            Bạn đã chọn {conflictsPicked.map((h) => h.name).join(', ')}. Các lịch hẹn trong những ngày này sẽ không còn
            khung giờ hợp lệ — hãy liên hệ khách để dời lịch.
          </Notice>
        )}
      </div>
    </Modal>
  );
}
