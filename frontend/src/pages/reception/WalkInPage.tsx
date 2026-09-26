import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Clock, History, Loader2, Search, Sparkles, UserCheck, UserPlus, Zap,
} from 'lucide-react';
import { appointmentsApi, catalogApi, customersApi, getErrorMessage, stylistsApi } from '@/api';
import type {
  Appointment, Customer, DayTimeline, ServiceItem, VisitHistoryItem,
} from '@/types';
import {
  Button, Card, EmptyState, Field, Input, Modal, Notice, SectionTitle, Spinner, StatusBadge, Textarea,
} from '@/components';
import {
  formatDate, formatDuration, formatVnd, matchSearch, minutesToTime, timeToMinutes, todayISO, VN_PHONE_REGEX,
} from '@/utils/format';
import { MAX_SERVICES_PER_BOOKING, STATUS_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';

/** Giờ hiện tại theo giờ tiệm, làm tròn lên bội số 5 phút. */
const nowRounded = (): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const total = Math.min(23 * 60 + 55, Math.ceil((h * 60 + m) / 5) * 5);
  return minutesToTime(total);
};

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && e1 > s2;

interface StylistFit {
  id: string;
  name: string;
  skilled: boolean;
  free: boolean;
  reason: string | null;
}

/** Kiểm tra thợ rảnh trong [start, end) dựa trên ca làm, giờ nghỉ và lịch đã có trong ngày. */
function stylistFits(timeline: DayTimeline | null, services: ServiceItem[], skillMap: Record<string, string[]>,
  start: number, end: number): StylistFit[] {
  if (!timeline) return [];
  return timeline.columns.map((col) => {
    const skills = skillMap[col.stylistId] ?? [];
    const skilled = services.every((s) => skills.includes(s.id));
    let reason: string | null = null;
    if (!col.workingBlocks.length) reason = 'Không có ca hôm nay';
    else if (!col.workingBlocks.some((b) => timeToMinutes(b.start) <= start && timeToMinutes(b.end) >= end)) reason = 'Ngoài giờ ca';
    else if (col.offBlocks.some((b) => overlaps(start, end, timeToMinutes(b.start), timeToMinutes(b.end)))) reason = 'Trùng giờ nghỉ';
    else {
      const clash = col.appointments.find((a) => !['cancelled', 'no_show', 'completed'].includes(a.status)
        && overlaps(start, end, timeToMinutes(a.startTime), timeToMinutes(a.endTime)));
      if (clash) reason = `Đang có khách ${clash.startTime}–${clash.endTime}`;
    }
    return { id: col.stylistId, name: col.stylistName, skilled, free: !reason, reason };
  });
}

// =====================================================================================
// Modal tạo lịch nhanh tại quầy
// =====================================================================================

export function WalkInModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (a: Appointment) => void;
}) {
  const toast = useToast();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [skillMap, setSkillMap] = useState<Record<string, string[]>>({});
  const [timeline, setTimeline] = useState<DayTimeline | null>(null);

  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'new'>('idle');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const autoFilledName = useRef<string | null>(null);
  const lookupSeq = useRef(0);

  const [serviceQuery, setServiceQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [time, setTime] = useState(nowRounded());
  const [stylistId, setStylistId] = useState('');
  const [checkInNow, setCheckInNow] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Appointment | null>(null);
  // "Hẹn ngày/giờ khác" cho phép chọn cả ngày, không chỉ giờ trong hôm nay
  const [date, setDate] = useState(todayISO());
  const isToday = date === todayISO();

  const reset = useCallback(() => {
    setPhone(''); setFullName(''); setEmail(''); setNote(''); setLookup('idle'); setCustomer(null); setHistory([]);
    autoFilledName.current = null; setServiceQuery(''); setSelectedIds([]); setMode('now'); setTime(nowRounded());
    setDate(todayISO()); setStylistId(''); setCheckInNow(true); setTouched(false); setCreated(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    catalogApi.services({ isActive: true }).then(setServices).catch(() => undefined);
  }, [open, reset]);

  // Nạp lại lịch ngày + kỹ năng thợ mỗi khi đổi ngày (không xoá dữ liệu khách đang nhập)
  useEffect(() => {
    if (!open) return;
    Promise.all([appointmentsApi.timeline(date), stylistsApi.list({ isActive: true })])
      .then(([tl, sty]) => {
        setTimeline(tl);
        setSkillMap(Object.fromEntries(sty.map((s) => [s.id, s.serviceIds])));
      })
      .catch((e) => toast.error(getErrorMessage(e)));
  }, [open, date, toast]);

  // Tự tra hồ sơ khách quen khi nhập đủ 10 số
  useEffect(() => {
    if (!VN_PHONE_REGEX.test(phone)) {
      setLookup('idle'); setCustomer(null); setHistory([]);
      if (autoFilledName.current && fullName === autoFilledName.current) setFullName('');
      autoFilledName.current = null;
      return;
    }
    const seq = ++lookupSeq.current;
    setLookup('loading');
    (async () => {
      try {
        const res: unknown = await customersApi.byPhone(phone);
        let found: Customer | null = null;
        let visits: VisitHistoryItem[] = [];
        // Máy chủ thật trả { found, customer, history }; bản demo trả thẳng Customer | null
        if (res && typeof res === 'object' && 'found' in res) {
          const r = res as { found: boolean; customer: Customer | null; history: VisitHistoryItem[] };
          found = r.found ? r.customer : null;
          visits = r.history ?? [];
        } else if (res && typeof res === 'object' && 'phone' in res) {
          found = res as Customer;
        }
        if (found && !visits.length) visits = await customersApi.history(found.id).catch(() => []);
        if (seq !== lookupSeq.current) return;
        if (found) {
          setCustomer(found);
          setHistory([...visits].sort((x, y) => y.date.localeCompare(x.date)));
          setLookup('found');
          setFullName((n) => (n.trim() && n !== autoFilledName.current ? n : found!.fullName));
          autoFilledName.current = found.fullName;
          setEmail((e) => e || found!.email || '');
        } else {
          setCustomer(null); setHistory([]); setLookup('new');
        }
      } catch {
        if (seq === lookupSeq.current) setLookup('new');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const selected = useMemo(
    () => selectedIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as ServiceItem[],
    [selectedIds, services],
  );
  const duration = selected.reduce((s, x) => s + x.durationMinutes, 0);
  const total = selected.reduce((s, x) => s + x.price, 0);
  const startMin = timeToMinutes(mode === 'now' ? nowRounded() : time || '00:00');
  const endMin = startMin + duration;

  const fits = useMemo(
    () => (selected.length ? stylistFits(timeline, selected, skillMap, startMin, endMin) : []),
    [timeline, selected, skillMap, startMin, endMin],
  );
  const candidates = fits.filter((f) => f.skilled && f.free);
  const resolvedStylist = stylistId ? fits.find((f) => f.id === stylistId) : candidates[0];

  // Gợi ý các mốc giờ trống gần nhất (bước 15 phút) — không áp ràng buộc 60 phút như trang khách
  const suggestions = useMemo(() => {
    if (!timeline || !selected.length) return [];
    const open = timeToMinutes(timeline.salonOpen);
    const close = timeToMinutes(timeline.salonClose);
    const from = isToday ? Math.max(open, Math.ceil(timeToMinutes(nowRounded()) / 15) * 15) : open;
    const out: string[] = [];
    for (let m = from; m + duration <= close && out.length < 8; m += 15) {
      const f = stylistFits(timeline, selected, skillMap, m, m + duration)
        .filter((x) => x.skilled && x.free && (!stylistId || x.id === stylistId));
      if (f.length) out.push(minutesToTime(m));
    }
    return out;
  }, [timeline, selected, skillMap, duration, stylistId, isToday]);

  const closeMin = timeline ? timeToMinutes(timeline.salonClose) : 24 * 60;
  const errors = {
    phone: !VN_PHONE_REGEX.test(phone) ? 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' : undefined,
    fullName: !fullName.trim() ? 'Vui lòng nhập tên khách' : undefined,
    services: !selected.length ? 'Chọn ít nhất một dịch vụ' : undefined,
    time: mode === 'later' && (!time || date < todayISO() || (isToday && timeToMinutes(time) < timeToMinutes(nowRounded()) - 5))
      ? 'Giờ bắt đầu không được ở quá khứ' : undefined,
    stylist: selected.length && !resolvedStylist ? 'Không có thợ phù hợp rảnh vào giờ này'
      : resolvedStylist && !resolvedStylist.skilled ? `${resolvedStylist.name} chưa làm được toàn bộ dịch vụ đã chọn`
        : resolvedStylist && !resolvedStylist.free ? `${resolvedStylist.name}: ${resolvedStylist.reason}` : undefined,
    closing: selected.length && endMin > closeMin ? `Kết thúc lúc ${minutesToTime(endMin)}, sau giờ đóng cửa ${timeline?.salonClose}` : undefined,
  };
  const shown: Partial<typeof errors> = touched ? errors : {};
  const blocking = Object.values(errors).some(Boolean);

  const toggleService = (id: string) => {
    if (selectedIds.includes(id)) return setSelectedIds(selectedIds.filter((x) => x !== id));
    if (selectedIds.length >= MAX_SERVICES_PER_BOOKING) return toast.warning(`Tối đa ${MAX_SERVICES_PER_BOOKING} dịch vụ mỗi lịch`);
    setSelectedIds([...selectedIds, id]);
  };

  const submit = async () => {
    setTouched(true);
    if (blocking || !resolvedStylist) return;
    setSaving(true);
    try {
      const startTime = mode === 'now' ? nowRounded() : time;
      const res = await appointmentsApi.walkIn({
        serviceIds: selectedIds, date, time: startTime, stylistId: resolvedStylist.id,
        fullName: fullName.trim(), phone, email: email.trim() || undefined, note: note.trim() || undefined,
      }) as Appointment;
      let final = res;
      if (mode === 'now' && checkInNow) {
        final = await appointmentsApi.checkIn(res.id).catch(() => res);
      }
      setCreated(final);
      onCreated(final);
      toast.success(`Đã tạo lịch tại quầy ${res.code}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const visibleServices = services.filter((s) => !serviceQuery || matchSearch(`${s.name} ${s.categoryName}`, serviceQuery));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Khách vãng lai — tạo lịch nhanh tại quầy"
      footer={created ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button icon={<UserPlus size={16} />} onClick={reset}>Tạo lịch khác</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-ink-muted">Tổng: </span><strong>{formatDuration(duration)}</strong>
            <span className="text-ink-muted"> · </span><strong className="text-teal-700">{formatVnd(total)}</strong>
            {resolvedStylist?.free && <span className="text-ink-muted"> · thợ {resolvedStylist.name}</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Huỷ</Button>
            <Button loading={saving} onClick={submit} icon={<Zap size={16} />}>
              {mode === 'now' && checkInNow ? 'Tạo & check-in' : 'Tạo lịch'}
            </Button>
          </div>
        </div>
      )}
    >
      {created ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-600" />
          <p className="mt-3 text-lg font-bold">Đã tạo lịch cho {created.customer.fullName}</p>
          <p className="mt-1 font-mono text-2xl tracking-[0.3em] text-teal-700">{created.code}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {created.startTime}–{created.endTime} hôm nay · thợ {created.stylist.fullName}
          </p>
          <div className="mt-3 flex justify-center"><StatusBadge status={created.status} /></div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
          {/* ---- Khách hàng ---- */}
          <section className="space-y-3">
            <h4 className="text-sm font-bold text-teal-700">1. Khách hàng</h4>
            <Field label="Số điện thoại" required error={shown.phone} hint="Nhập đủ 10 số để tự tìm hồ sơ khách quen">
              <div className="relative">
                <Input autoFocus value={phone} inputMode="numeric" placeholder="0901234567" className="pr-10"
                       invalid={!!shown.phone}
                       onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  {lookup === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </span>
              </div>
            </Field>

            {lookup === 'found' && customer && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-emerald-800">
                  <UserCheck size={16} /> Khách quen: {customer.fullName}
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  {customer.totalVisits} lượt hoàn tất · {customer.noShowCount} lần không đến
                  {customer.email ? ` · ${customer.email}` : ''}
                </p>
                {customer.note && <p className="mt-1 text-xs italic text-emerald-800">Ghi chú: {customer.note}</p>}
                {customer.noShowCount >= 2 && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">Lưu ý: khách từng lỡ hẹn {customer.noShowCount} lần.</p>
                )}
                {history.length > 0 && (
                  <div className="mt-2 border-t border-emerald-200 pt-2">
                    <p className="flex items-center gap-1 text-xs font-semibold"><History size={12} /> Gần đây</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-emerald-800">
                      {history.slice(0, 3).map((h) => (
                        <li key={h.appointmentId}>
                          {formatDate(`${h.date}T00:00:00+07:00`)} · {h.services.join(', ')} · {h.stylistName}
                          <span className="text-emerald-600"> ({STATUS_LABELS[h.status]})</span>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="mt-1.5 text-xs font-semibold text-teal-700 hover:underline"
                            onClick={() => {
                              const last = history.find((h) => h.status === 'completed');
                              const ids = last ? services.filter((s) => last.services.includes(s.name)).map((s) => s.id) : [];
                              if (ids.length) setSelectedIds(ids.slice(0, MAX_SERVICES_PER_BOOKING));
                              else toast.warning('Không tìm thấy dịch vụ của lần trước');
                            }}>
                      Làm lại dịch vụ lần trước
                    </button>
                  </div>
                )}
              </div>
            )}
            {lookup === 'new' && (
              <Notice tone="info" icon={<Sparkles size={15} />}>Khách mới — hồ sơ sẽ được tạo khi lưu lịch.</Notice>
            )}

            <Field label="Họ tên" required error={shown.fullName}>
              <Input value={fullName} maxLength={80} placeholder="Nguyễn Văn A" invalid={!!shown.fullName}
                     onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email (tuỳ chọn)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Ghi chú" hint={`${note.length}/300`}>
              <Textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" />
            </Field>
          </section>

          {/* ---- Dịch vụ, giờ, thợ ---- */}
          <section className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-teal-700">2. Dịch vụ ({selected.length}/{MAX_SERVICES_PER_BOOKING})</h4>
                {shown.services && <span className="text-xs text-red-600">{shown.services}</span>}
              </div>
              <div className="relative mb-2">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <Input value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} placeholder="Tìm dịch vụ…"
                       className="min-h-[38px] pl-8" />
              </div>
              <div className="thin-scroll grid max-h-48 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {visibleServices.map((s) => {
                  const on = selectedIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleService(s.id)}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors
                              ${on ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-400'}`}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="text-[11px] text-ink-muted">{s.durationMinutes}′ · {s.priceText}</span>
                      </span>
                      {on && <CheckCircle2 size={16} className="shrink-0 text-teal-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-teal-700">3. Thời gian</h4>
              <div className="grid grid-cols-2 gap-2">
                {([['now', 'Làm ngay', <Zap size={15} key="z" />], ['later', 'Hẹn ngày/giờ khác', <Clock size={15} key="c" />]] as const)
                  .map(([id, label, icon]) => (
                    <button key={id} type="button" aria-pressed={mode === id}
                            onClick={() => {
                              setMode(id);
                              if (id === 'now') setDate(todayISO());
                              if (id === 'later' && suggestions[0]) setTime(suggestions[0]);
                            }}
                            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold
                              ${mode === id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-ink-soft'}`}>
                      {icon} {label}
                    </button>
                  ))}
              </div>
              {mode === 'now' ? (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-ink-muted">
                    Bắt đầu lúc <strong className="text-ink">{nowRounded()}</strong>
                    {duration > 0 && <> → xong khoảng <strong className="text-ink">{minutesToTime(endMin)}</strong></>}.
                    Lịch tại quầy bỏ qua quy định đặt trước 60 phút.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={checkInNow}
                           onChange={(e) => setCheckInNow(e.target.checked)} />
                    Khách đang có mặt — check-in luôn
                  </label>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <Field label="Ngày">
                      <input type="date" min={todayISO()} className="field-input w-44" value={date}
                             onChange={(e) => setDate(e.target.value || todayISO())} />
                    </Field>
                    <Field label="Giờ bắt đầu" error={shown.time}>
                      <input type="time" step={300} className="field-input w-40" value={time}
                             onChange={(e) => setTime(e.target.value)} />
                    </Field>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="self-center text-xs text-ink-muted">Giờ trống:</span>
                      {suggestions.map((t) => (
                        <button key={t} type="button" onClick={() => setTime(t)}
                                className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-semibold
                                  ${time === t ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 hover:border-teal-300'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-teal-700">4. Thợ</h4>
              {!selected.length ? (
                <p className="text-xs text-ink-muted">Chọn dịch vụ để xem thợ rảnh.</p>
              ) : !timeline ? <Spinner label="Đang kiểm tra lịch thợ…" /> : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <StylistOption active={!stylistId} onClick={() => setStylistId('')}
                                 title="Tự sắp thợ rảnh" subtitle={candidates[0] ? `→ ${candidates[0].name}` : 'Không có thợ rảnh'}
                                 ok={!!candidates[0]} />
                  {fits.filter((f) => f.skilled).map((f) => (
                    <StylistOption key={f.id} active={stylistId === f.id} onClick={() => setStylistId(f.id)}
                                   title={f.name} subtitle={f.free ? 'Rảnh' : f.reason ?? ''} ok={f.free} />
                  ))}
                </div>
              )}
            </div>

            {(shown.stylist || shown.closing) && (
              <Notice tone="danger">{shown.stylist ?? shown.closing}</Notice>
            )}
            {!touched && errors.closing && <Notice tone="warning">{errors.closing}</Notice>}
          </section>
        </div>
      )}
    </Modal>
  );
}

function StylistOption({ active, onClick, title, subtitle, ok }: {
  active: boolean; onClick: () => void; title: string; subtitle: string; ok: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm
              ${active ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-400'}`}>
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        <span className={`block truncate text-[11px] ${ok ? 'text-emerald-700' : 'text-red-600'}`}>{subtitle}</span>
      </span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden />
    </button>
  );
}

// =====================================================================================
// Trang: danh sách khách vãng lai hôm nay + nút mở modal
// =====================================================================================

/** S3-07: khách vãng lai — lịch tạo tại quầy vào thẳng Đã xác nhận, bỏ qua ràng buộc đặt trước 60 phút. */
export function WalkInPage() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await appointmentsApi.list({ from: todayISO(), to: todayISO(), page: 1, limit: 200 });
      setItems(res.items.filter((a) => a.source === 'walk_in').sort((a, b) => a.startTime.localeCompare(b.startTime)));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const revenue = items.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .reduce((s, a) => s + a.estimatedTotal, 0);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Khách vãng lai"
        description="Khách gọi điện hoặc ghé thẳng tiệm. Lịch tạo tại quầy vào thẳng trạng thái Đã xác nhận và bỏ qua quy định đặt trước 60 phút."
        action={<Button icon={<UserPlus size={16} />} onClick={() => setOpen(true)}>Tạo lịch vãng lai</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-ink-muted">Lượt vãng lai hôm nay</p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-ink-muted">Đang phục vụ</p>
          <p className="mt-1 text-2xl font-bold">{items.filter((a) => ['arrived', 'in_progress'].includes(a.status)).length}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-ink-muted">Tạm tính</p>
          <p className="mt-1 text-2xl font-bold text-teal-700">{formatVnd(revenue)}</p></Card>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={<UserPlus size={30} />} title="Chưa có khách vãng lai hôm nay"
                    description="Bấm “Tạo lịch vãng lai” khi có khách tới quầy."
                    action={<Button size="sm" onClick={() => setOpen(true)}>Tạo lịch vãng lai</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Giờ</th><th>Mã</th><th>Khách</th><th>Dịch vụ</th><th>Thợ</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                  <td className="whitespace-nowrap font-semibold">{a.startTime}–{a.endTime}</td>
                  <td className="font-mono text-xs">{a.code}</td>
                  <td>{a.customer.fullName}<span className="block text-xs text-ink-muted">{a.customer.phone}</span></td>
                  <td className="text-xs text-ink-soft">{a.services.map((s) => s.name).join(', ')}</td>
                  <td className="whitespace-nowrap text-xs">{a.stylist.fullName}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="text-right"><Button size="sm" variant="ghost">Mở</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WalkInModal open={open} onClose={() => setOpen(false)} onCreated={() => void load()} />
      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
