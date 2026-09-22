import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, Search, UserPlus } from 'lucide-react';
import { appointmentsApi, catalogApi, customersApi, getErrorMessage, stylistsApi } from '@/api';
import type { Availability, ServiceItem, Stylist, VisitHistoryItem } from '@/types';
import { Button, Card, Field, Input, SectionTitle, Select, Spinner, Textarea } from '@/components';
import { formatDate, formatDuration, formatVnd, todayISO, VN_PHONE_REGEX } from '@/utils/format';
import { MAX_SERVICES_PER_BOOKING } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/** S3-07: nhập lịch cho khách vãng lai tại quầy, vào thẳng trạng thái Đã xác nhận. */
export function WalkInPage() {
  const toast = useToast();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stylistId, setStylistId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [knownCustomer, setKnownCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ code: string; startAtText: string; stylistName: string } | null>(null);

  useEffect(() => {
    catalogApi.services({ isActive: true }).then(setServices).catch(() => undefined);
    stylistsApi.list({ isActive: true }).then(setStylists).catch(() => undefined);
  }, []);

  const selected = useMemo(
    () => selectedIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as ServiceItem[],
    [selectedIds, services],
  );
  const totalDuration = selected.reduce((s, x) => s + x.durationMinutes, 0);
  const totalPrice = selected.reduce((s, x) => s + x.price, 0);

  const loadSlots = useCallback(async () => {
    if (selectedIds.length === 0) { setAvailability(null); return; }
    setLoadingSlots(true);
    try {
      setAvailability(await appointmentsApi.availability({
        date, serviceIds: selectedIds, stylistId: stylistId || undefined,
      }));
    } catch (e) {
      toast.error(getErrorMessage(e));
      setAvailability(null);
    } finally {
      setLoadingSlots(false);
    }
  }, [date, selectedIds, stylistId, toast]);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  /** Gõ số điện thoại đã có trong hệ thống thì tự điền tên và hiện lịch sử gần nhất. */
  const lookupPhone = async (value: string) => {
    if (!VN_PHONE_REGEX.test(value)) { setKnownCustomer(false); setHistory([]); return; }
    try {
      const res = await customersApi.byPhone(value);
      if (res.found && res.customer) {
        setKnownCustomer(true);
        if (!fullName) setFullName(res.customer.fullName);
        setEmail((e) => e || res.customer?.email || '');
        setHistory(res.history);
        toast.success(`Khách quen: ${res.customer.fullName} — đã đến ${res.customer.totalVisits} lần`);
      } else {
        setKnownCustomer(false);
        setHistory([]);
      }
    } catch { /* bỏ qua */ }
  };

  const toggle = (id: string) => {
    setTime('');
    setSelectedIds((list) =>
      list.includes(id) ? list.filter((x) => x !== id)
        : list.length >= MAX_SERVICES_PER_BOOKING ? list : [...list, id],
    );
  };

  const submit = async () => {
    if (selectedIds.length === 0) return toast.warning('Vui lòng chọn ít nhất một dịch vụ');
    if (!time) return toast.warning('Vui lòng chọn khung giờ');
    if (!fullName.trim()) return toast.warning('Vui lòng nhập tên khách');
    if (!VN_PHONE_REGEX.test(phone)) return toast.warning('Số điện thoại phải gồm đúng 10 chữ số');
    setSaving(true);
    try {
      const res = await appointmentsApi.walkIn({
        serviceIds: selectedIds, date, time, stylistId: stylistId || undefined,
        fullName: fullName.trim(), phone, email: email.trim() || undefined, note: note.trim() || undefined,
      }) as { code: string; startAtText: string; stylistName: string };
      setResult(res);
      toast.success(`Đã tạo lịch tại quầy, mã ${res.code}`);
      setSelectedIds([]); setTime(''); setPhone(''); setFullName(''); setEmail(''); setNote('');
      setHistory([]); setKnownCustomer(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Nhập lịch cho khách vãng lai"
        description="Khách gọi điện hoặc đi ngang qua tiệm. Lịch tạo tại quầy vào thẳng trạng thái Đã xác nhận và bỏ qua ràng buộc đặt trước 60 phút."
      />

      {result && (
        <Card className="border-l-4 border-green-600 p-4">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <CheckCircle2 size={18} /> Đã tạo lịch — mã tra cứu <span className="tracking-widest">{result.code}</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">{result.startAtText} · thợ {result.stylistName}</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">1. Chọn dịch vụ (tối đa {MAX_SERVICES_PER_BOOKING})</h3>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 thin-scroll">
            {services.map((s) => {
              const on = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm
                    ${on ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-300'}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{s.name}</span>
                    <span className="text-xs text-ink-muted">{s.categoryName} · {s.durationMinutes}′</span>
                  </span>
                  <span className="shrink-0 font-semibold">{s.priceText}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Thợ">
              <Select value={stylistId} onChange={(e) => { setStylistId(e.target.value); setTime(''); }}>
                <option value="">Thợ bất kỳ (tiệm tự sắp)</option>
                {stylists
                  .filter((s) => selectedIds.every((id) => s.serviceIds.includes(id)))
                  .map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Ngày">
              <input type="date" className="field-input" value={date}
                     onChange={(e) => { setDate(e.target.value); setTime(''); }} />
            </Field>
          </div>

          <div className="mt-3">
            <p className="field-label">2. Khung giờ</p>
            {loadingSlots ? <Spinner label="Đang tính khung giờ…" />
              : !availability ? <p className="text-sm text-ink-muted">Chọn dịch vụ để xem khung giờ.</p>
              : availability.slots.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
                  Không còn khung giờ trống. {availability.suggestedDates.length > 0 &&
                    `Gợi ý: ${availability.suggestedDates.join(', ')}`}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {availability.slots.map((s) => (
                    <button key={s.time} onClick={() => setTime(s.time)}
                            className={`min-h-[40px] rounded-lg border text-sm font-semibold
                              ${time === s.time ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white'}`}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">3. Thông tin khách</h3>
          <div className="space-y-3">
            <Field label="Số điện thoại" required hint="Gõ xong số sẽ tự tìm hồ sơ khách quen">
              <div className="relative">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={(e) => lookupPhone(e.target.value)}
                  inputMode="numeric" placeholder="0901234567" className="pr-10"
                />
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              </div>
            </Field>
            {knownCustomer && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                Đã tìm thấy hồ sơ khách quen. Sửa tên ở đây không ghi đè tên trong hồ sơ cũ.
              </p>
            )}
            <Field label="Họ tên" required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Email (tuỳ chọn)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Ghi chú" hint={`${note.length}/300`}>
              <Textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>

          {history.length > 0 && (
            <details className="mt-3 rounded-xl border border-brand-100 p-3" open>
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <History size={15} /> Lịch sử gần nhất
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                {history.map((h) => (
                  <li key={h.appointmentId}>{formatDate(h.date)} — {h.services.join(', ')} (thợ {h.stylistName})</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 rounded-xl bg-surface-alt p-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-muted">Tổng thời lượng</span>
              <strong>{formatDuration(totalDuration)}</strong></div>
            <div className="mt-1 flex justify-between"><span className="text-ink-muted">Tạm tính</span>
              <strong className="text-brand-800">{formatVnd(totalPrice)}</strong></div>
          </div>

          <Button className="mt-3 w-full" loading={saving} onClick={submit} icon={<UserPlus size={16} />}>
            Tạo lịch tại quầy
          </Button>
        </Card>
      </div>
    </div>
  );
}
