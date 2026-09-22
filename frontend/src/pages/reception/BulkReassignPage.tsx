import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, PhoneCall, Users } from 'lucide-react';
import { appointmentsApi, getErrorMessage, stylistsApi } from '@/api';
import type { Stylist } from '@/types';
import type { BulkReassignSuggestion } from '@/api/appointments.api';
import { Button, Card, EmptyState, Field, SectionTitle, Select, Spinner } from '@/components';
import { formatDuration, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

/** S3-09: chuyển hàng loạt lịch của một thợ báo nghỉ đột xuất sang thợ khác. */
export function BulkReassignPage() {
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [stylistId, setStylistId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<BulkReassignSuggestion[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    stylistsApi.list({ isActive: true }).then((l) => {
      setStylists(l);
      if (l.length && !stylistId) setStylistId(l[0].id);
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!stylistId) return;
    setLoading(true);
    try {
      const res = await appointmentsApi.bulkSuggestions(stylistId, date);
      setItems(res.items);
      setChoices({});
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [stylistId, date, toast]);

  const apply = async () => {
    const payload = Object.entries(choices)
      .filter(([, v]) => v)
      .map(([appointmentId, v]) => {
        const [targetStylistId, targetTime] = v.split('|');
        return { appointmentId, targetStylistId, targetTime: targetTime || undefined };
      });
    if (payload.length === 0) return toast.warning('Chưa chọn phương án nào');
    setSaving(true);
    try {
      const res = await appointmentsApi.bulkReassign(payload);
      toast.success(`Đã chuyển ${res.succeeded} lịch${res.failed.length ? `, ${res.failed.length} lịch lỗi` : ''}`);
      if (res.failed.length) res.failed.forEach((f) => toast.error(f.reason));
      void load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const needCall = items.filter((i) => i.needsPhoneCall);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Chuyển lịch khi thợ nghỉ đột xuất"
        description="Chọn thợ và ngày, hệ thống liệt kê các lịch chưa hoàn tất kèm gợi ý thợ thay thế."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Thợ báo nghỉ">
            <Select value={stylistId} onChange={(e) => setStylistId(e.target.value)} className="min-w-[200px]">
              {stylists.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Select>
          </Field>
          <Field label="Ngày">
            <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button onClick={load} loading={loading}>Tìm lịch cần chuyển</Button>
        </div>
      </Card>

      {needCall.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <PhoneCall size={17} className="mt-0.5 shrink-0" />
          {needCall.length} lịch không tìm được phương án nào — cần gọi điện cho khách:{' '}
          {needCall.map((i) => i.appointment.code).join(', ')}
        </p>
      )}

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={<Users size={30} />} title="Không có lịch nào cần chuyển"
                    description="Thợ này không có lịch chưa hoàn tất trong ngày đã chọn." />
      ) : (
        <>
          <div className="space-y-2.5">
            {items.map((it) => (
              <Card key={it.appointment.id} className={`p-4 ${it.needsPhoneCall ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs tracking-widest text-ink-muted">{it.appointment.code}</p>
                    <p className="font-semibold">{it.appointment.startTime} — {it.appointment.customer.fullName}</p>
                    <p className="text-xs text-ink-muted">
                      {it.appointment.services.map((s) => s.name).join(', ')} ·{' '}
                      {formatDuration(it.appointment.totalDurationMinutes)}
                    </p>
                  </div>
                  {it.needsPhoneCall && (
                    <span className="chip border border-amber-300 bg-amber-50 text-amber-800">
                      <AlertTriangle size={13} /> Cần gọi khách
                    </span>
                  )}
                </div>

                {!it.needsPhoneCall && (
                  <div className="mt-3">
                    <Select
                      value={choices[it.appointment.id] ?? ''}
                      onChange={(e) => setChoices((c) => ({ ...c, [it.appointment.id]: e.target.value }))}
                    >
                      <option value="">— Chọn phương án —</option>
                      {it.sameTimeOptions.map((o) => (
                        <option key={o.stylistId} value={`${o.stylistId}|`}>
                          Giữ nguyên {it.appointment.startTime} — chuyển sang {o.stylistName}
                        </option>
                      ))}
                      {it.alternativeTimeOptions.map((o) => (
                        <option key={`${o.stylistId}-${o.time}`} value={`${o.stylistId}|${o.time}`}>
                          Dời sang {o.time} — thợ {o.stylistName}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Button loading={saving} onClick={apply}>
            Áp dụng chuyển lịch ({Object.values(choices).filter(Boolean).length})
          </Button>
          <p className="text-xs text-ink-muted">
            Áp dụng theo lô: lỗi ở một lịch không làm hỏng các lịch đã chuyển xong.
            Khách có email được gửi thông báo đổi thợ trong vòng 5 phút.
          </p>
        </>
      )}
    </div>
  );
}
