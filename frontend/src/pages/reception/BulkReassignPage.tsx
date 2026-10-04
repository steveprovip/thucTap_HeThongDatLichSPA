import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Clock, PhoneCall, RotateCcw, Siren,
  Sparkles, Star, Wand2,
} from 'lucide-react';
import { appointmentsApi, getErrorMessage, stylistsApi } from '@/api';
import type { Appointment, DayTimeline, Stylist } from '@/types';
import {
  Button, Card, EmptyState, Field, Input, Notice, SectionTitle, Spinner, StylistAvatar,
} from '@/components';
import {
  formatDuration, formatWeekdayDate, minutesToTime, timeToMinutes, todayISO,
} from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

type Step = 1 | 2 | 3 | 4;

interface Option {
  key: string;
  stylistId: string;
  stylistName: string;
  time: string;
  sameTime: boolean;
  shiftMin: number;
  rating: number | null;
}

interface Plan { appointmentId: string; option: Option | null }

const STEPS = ['Thợ báo nghỉ', 'Chọn phương án', 'Xác nhận', 'Hoàn tất'];
const SEARCH_WINDOW_MIN = 180;
const ACTIVE = ['pending', 'confirmed'];

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && e1 > s2;

/** Thợ rảnh trong [start, end) theo ca, giờ nghỉ, lịch hiện có và các phương án đã chọn trong wizard. */
function isFree(timeline: DayTimeline, stylistId: string, start: number, end: number,
  booked: { stylistId: string; start: number; end: number }[]): boolean {
  const col = timeline.columns.find((c) => c.stylistId === stylistId);
  if (!col || !col.workingBlocks.length) return false;
  if (!col.workingBlocks.some((b) => timeToMinutes(b.start) <= start && timeToMinutes(b.end) >= end)) return false;
  if (col.offBlocks.some((b) => overlaps(start, end, timeToMinutes(b.start), timeToMinutes(b.end)))) return false;
  if (col.appointments.some((a) => !['cancelled', 'no_show', 'completed'].includes(a.status)
    && overlaps(start, end, timeToMinutes(a.startTime), timeToMinutes(a.endTime)))) return false;
  return !booked.some((b) => b.stylistId === stylistId && overlaps(start, end, b.start, b.end));
}

/** S3-09: wizard khẩn cấp chuyển hàng loạt lịch khi thợ báo nghỉ đột xuất. */
export function BulkReassignPage() {
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [stylistId, setStylistId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [partial, setPartial] = useState(false);
  const [fromTime, setFromTime] = useState('12:00');
  const [toTime, setToTime] = useState('21:00');
  const [reason, setReason] = useState('Ốm đột xuất');
  const [recordTimeOff, setRecordTimeOff] = useState(true);

  const [timeline, setTimeline] = useState<DayTimeline | null>(null);
  const [affected, setAffected] = useState<Appointment[]>([]);
  const [plans, setPlans] = useState<Record<string, Option | null>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ moved: Plan[]; failed: { appointmentId: string; reason: string }[]; skipped: Appointment[] } | null>(null);

  useEffect(() => {
    stylistsApi.list({ isActive: true }).then(setStylists).catch((e) => toast.error(getErrorMessage(e)));
  }, [toast]);

  // Tải lưới lịch trong ngày để biết mỗi thợ có bao nhiêu lịch
  useEffect(() => {
    setTimeline(null);
    appointmentsApi.timeline(date).then(setTimeline).catch(() => undefined);
  }, [date]);

  const countFor = (id: string) => timeline?.columns.find((c) => c.stylistId === id)?.appointments
    .filter((a) => ACTIVE.includes(a.status)).length ?? 0;

  const sick = stylists.find((s) => s.id === stylistId);
  const peers = stylists.filter((s) => s.id !== stylistId);

  /** Tính các phương án cho từng lịch, có xét các phương án đã chọn cho lịch khác. */
  const optionsFor = (a: Appointment, current: Record<string, Option | null>): Option[] => {
    if (!timeline) return [];
    const booked = Object.entries(current)
      .filter(([id, o]) => id !== a.id && o)
      .map(([id, o]) => {
        const appt = affected.find((x) => x.id === id);
        const start = timeToMinutes(o!.time);
        return { stylistId: o!.stylistId, start, end: start + (appt?.totalDurationMinutes ?? 0) };
      });
    const dur = a.totalDurationMinutes;
    const orig = timeToMinutes(a.startTime);
    const close = timeToMinutes(timeline.salonClose);
    const open = timeToMinutes(timeline.salonOpen);
    const skilled = peers.filter((p) => a.services.every((s) => p.serviceIds.includes(s.serviceId)));
    const out: Option[] = [];
    skilled.forEach((p) => {
      if (isFree(timeline, p.id, orig, orig + dur, booked)) {
        out.push({ key: `${p.id}|${a.startTime}`, stylistId: p.id, stylistName: p.fullName, time: a.startTime,
          sameTime: true, shiftMin: 0, rating: p.avgRating });
        return;
      }
      // Tìm mốc gần giờ gốc nhất trong ±3 giờ
      for (let d = 15; d <= SEARCH_WINDOW_MIN; d += 15) {
        const found = [orig + d, orig - d].find((m) => m >= open && m + dur <= close && isFree(timeline, p.id, m, m + dur, booked));
        if (found !== undefined) {
          out.push({ key: `${p.id}|${minutesToTime(found)}`, stylistId: p.id, stylistName: p.fullName,
            time: minutesToTime(found), sameTime: false, shiftMin: found - orig, rating: p.avgRating });
          break;
        }
      }
    });
    return out.sort((x, y) => Number(y.sameTime) - Number(x.sameTime)
      || Math.abs(x.shiftMin) - Math.abs(y.shiftMin) || (y.rating ?? 0) - (x.rating ?? 0));
  };

  const load = async () => {
    if (!stylistId) return toast.warning('Chọn thợ báo nghỉ');
    if (partial && timeToMinutes(toTime) <= timeToMinutes(fromTime)) return toast.warning('Giờ kết thúc nghỉ phải sau giờ bắt đầu');
    setLoading(true);
    try {
      const [res, tl] = await Promise.all([appointmentsApi.bulkSuggestions(stylistId, date), appointmentsApi.timeline(date)]);
      setTimeline(tl);
      const list = res.items.map((i) => i.appointment)
        .filter((a) => !partial || overlaps(timeToMinutes(a.startTime), timeToMinutes(a.endTime), timeToMinutes(fromTime), timeToMinutes(toTime)))
        .sort((x, y) => x.startTime.localeCompare(y.startTime));
      setAffected(list);
      setPlans({});
      setStep(2);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const autoPick = () => {
    const next: Record<string, Option | null> = {};
    affected.forEach((a) => { next[a.id] = optionsFor(a, next)[0] ?? null; });
    setPlans(next);
    const picked = Object.values(next).filter(Boolean).length;
    toast.success(`Đã tự chọn ${picked}/${affected.length} phương án tối ưu`);
  };

  const chosen = affected.filter((a) => plans[a.id]);
  const unresolved = affected.filter((a) => !plans[a.id]);
  const timeChanged = chosen.filter((a) => plans[a.id] && !plans[a.id]!.sameTime);

  const apply = async () => {
    setApplying(true);
    try {
      const items = chosen.map((a) => ({
        appointmentId: a.id, targetStylistId: plans[a.id]!.stylistId,
        targetTime: plans[a.id]!.sameTime ? undefined : plans[a.id]!.time,
      }));
      const res = items.length ? await appointmentsApi.bulkReassign(items) : { succeeded: 0, failed: [] };
      if (recordTimeOff && sick) {
        await stylistsApi.createTimeOff(sick.id, {
          offDate: date, startTime: partial ? fromTime : null, endTime: partial ? toTime : null,
          reason: reason.trim() || 'Nghỉ đột xuất', force: true,
        }).catch((e) => toast.error(`Chưa ghi được lịch nghỉ: ${getErrorMessage(e)}`));
      }
      const failedIds = new Set(res.failed.map((f) => f.appointmentId));
      setResult({
        moved: chosen.filter((a) => !failedIds.has(a.id)).map((a) => ({ appointmentId: a.id, option: plans[a.id] })),
        failed: res.failed, skipped: unresolved,
      });
      setStep(4);
      toast.success(`Đã chuyển ${res.succeeded} lịch hẹn`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const restart = () => {
    setStep(1); setAffected([]); setPlans({}); setResult(null);
    appointmentsApi.timeline(date).then(setTimeline).catch(() => undefined);
  };

  const apptById = useMemo(() => Object.fromEntries(affected.map((a) => [a.id, a])), [affected]);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Chuyển lịch khẩn khi thợ nghỉ đột xuất"
        description="Chọn thợ báo nghỉ, hệ thống gợi ý thợ cùng kỹ năng đang rảnh để nhận lại từng lịch."
      />

      {/* Thanh bước */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Các bước">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? 'done' : n === step ? 'current' : 'todo';
          return (
            <li key={label} aria-current={state === 'current' ? 'step' : undefined}
                className={`rounded-xl border px-3 py-2 text-xs sm:text-sm
                  ${state === 'current' ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : state === 'done' ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-ink-muted'}`}>
              <span className="font-bold">{state === 'done' ? '✓' : n}.</span> <span className="hidden sm:inline">{label}</span>
            </li>
          );
        })}
      </ol>

      {/* -------------------------------------------------- Bước 1 */}
      {step === 1 && (
        <Card className="space-y-4 p-4 sm:p-5">
          <Notice tone="danger" icon={<Siren size={16} />} title="Chế độ khẩn cấp">
            Chỉ các lịch <strong>Chờ xác nhận</strong> và <strong>Đã xác nhận</strong> được chuyển. Lịch đang làm dở cần xử lý thủ công.
          </Notice>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày nghỉ">
              <input type="date" className="field-input" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Lý do">
              <Input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="field-label">Thợ báo nghỉ — {formatWeekdayDate(`${date}T00:00:00+07:00`)}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stylists.map((s) => {
                const count = countFor(s.id);
                const on = stylistId === s.id;
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setStylistId(s.id)}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors
                            ${on ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-400'}`}>
                    <StylistAvatar id={s.id} name={s.fullName} url={s.avatarUrl} gender={s.gender} size="h-10 w-10" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.fullName}</span>
                      <span className={`text-xs ${count ? 'text-teal-700' : 'text-ink-muted'}`}>
                        {timeline ? `${count} lịch cần xử lý` : '…'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
              Chỉ nghỉ một phần ngày
            </label>
            {partial && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                Từ <input type="time" className="field-input min-h-[38px] w-32" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
                đến <input type="time" className="field-input min-h-[38px] w-32" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={recordTimeOff} onChange={(e) => setRecordTimeOff(e.target.checked)} />
              Ghi nhận nghỉ vào lịch của thợ (khách không đặt được thợ này trong thời gian nghỉ)
            </label>
          </div>

          <div className="flex justify-end">
            <Button loading={loading} disabled={!stylistId} onClick={load} icon={<ArrowRight size={16} />}>
              Tìm lịch bị ảnh hưởng
            </Button>
          </div>
        </Card>
      )}

      {/* -------------------------------------------------- Bước 2 */}
      {step === 2 && (
        !timeline ? <Spinner /> : affected.length === 0 ? (
          <EmptyState icon={<CalendarCheck size={30} />} title="Không có lịch nào cần chuyển"
                      description={`${sick?.fullName ?? 'Thợ'} không có lịch chờ/đã xác nhận trong khoảng đã chọn.`}
                      action={<div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setStep(1)}>Quay lại</Button>
                        {recordTimeOff && <Button size="sm" onClick={apply} loading={applying}>Chỉ ghi nhận nghỉ</Button>}
                      </div>} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <strong>{affected.length}</strong> lịch của <strong>{sick?.fullName}</strong> · đã chọn {chosen.length}/{affected.length}
              </p>
              <Button size="sm" variant="secondary" icon={<Wand2 size={15} />} onClick={autoPick}>Tự chọn phương án tốt nhất</Button>
            </div>

            {affected.map((a) => {
              const opts = optionsFor(a, plans);
              const current = plans[a.id];
              const skilledCount = peers.filter((p) => a.services.every((s) => p.serviceIds.includes(s.serviceId))).length;
              return (
                <Card key={a.id} className={`p-4 ${current ? 'ring-1 ring-emerald-200' : opts.length ? '' : 'ring-1 ring-red-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs tracking-widest text-ink-muted">{a.code}</p>
                      <p className="font-semibold">{a.startTime}–{a.endTime} · {a.customer.fullName}</p>
                      <p className="text-xs text-ink-muted">
                        {a.services.map((s) => s.name).join(', ')} · {formatDuration(a.totalDurationMinutes)} · {a.statusLabel}
                      </p>
                    </div>
                    <span className="text-xs text-ink-muted">{skilledCount} thợ cùng kỹ năng</span>
                  </div>

                  {opts.length === 0 && !current ? (
                    <Notice tone="danger" icon={<PhoneCall size={15} />} className="mt-3">
                      Không có thợ cùng kỹ năng rảnh trong ±3 giờ. Cần gọi khách ({a.customer.phone}) để dời ngày hoặc huỷ.
                    </Notice>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={`Phương án cho ${a.code}`}>
                      {[...(current && !opts.some((o) => o.key === current.key) ? [current] : []), ...opts].map((o, idx) => {
                        const on = current?.key === o.key;
                        return (
                          <button key={o.key} type="button" role="radio" aria-checked={on}
                                  onClick={() => setPlans((p) => ({ ...p, [a.id]: on ? null : o }))}
                                  className={`rounded-xl border p-2.5 text-left text-sm transition-colors
                                    ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-400'}`}>
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold">{o.stylistName}</span>
                              {idx === 0 && !current && <span className="chip border border-teal-200 text-[10px] text-teal-700"><Sparkles size={10} /> Gợi ý</span>}
                            </span>
                            <span className={`mt-0.5 flex items-center gap-1 text-xs ${o.sameTime ? 'text-emerald-700' : 'text-teal-700'}`}>
                              <Clock size={12} />
                              {o.sameTime ? `Giữ nguyên ${o.time}` : `Dời sang ${o.time} (${o.shiftMin > 0 ? '+' : ''}${o.shiftMin}′)`}
                            </span>
                            {o.rating !== null && (
                              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                                <Star size={10} className="fill-amber-400 text-amber-400" /> {o.rating.toFixed(1)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(1)}>Quay lại</Button>
              <Button onClick={() => setStep(3)} disabled={chosen.length === 0 && !recordTimeOff} icon={<ArrowRight size={16} />}>
                Xem lại ({chosen.length})
              </Button>
            </div>
          </div>
        )
      )}

      {/* -------------------------------------------------- Bước 3 */}
      {step === 3 && (
        <Card className="space-y-4 p-4 sm:p-5">
          <p className="font-semibold">Xác nhận chuyển {chosen.length} lịch của {sick?.fullName} · {formatWeekdayDate(`${date}T00:00:00+07:00`)}</p>
          {chosen.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Mã</th><th>Khách</th><th>Hiện tại</th><th /><th>Sau khi chuyển</th></tr></thead>
                <tbody>
                  {chosen.map((a) => {
                    const o = plans[a.id]!;
                    return (
                      <tr key={a.id}>
                        <td className="font-mono text-xs">{a.code}</td>
                        <td>{a.customer.fullName}</td>
                        <td className="whitespace-nowrap text-xs text-ink-muted">{a.startTime} · {a.stylist.fullName}</td>
                        <td><ArrowRight size={14} className="text-teal-600" /></td>
                        <td className="whitespace-nowrap text-xs">
                          <span className={o.sameTime ? '' : 'font-semibold text-teal-700'}>{o.time}</span> · <strong>{o.stylistName}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {timeChanged.length > 0 && (
            <Notice tone="warning" icon={<AlertTriangle size={16} />}>
              {timeChanged.length} lịch bị đổi giờ — nên gọi báo khách trước khi áp dụng.
            </Notice>
          )}
          {unresolved.length > 0 && (
            <Notice tone="danger" icon={<PhoneCall size={16} />}>
              {unresolved.length} lịch chưa có phương án sẽ giữ nguyên với {sick?.fullName}: {unresolved.map((a) => a.code).join(', ')}.
            </Notice>
          )}
          {recordTimeOff && (
            <p className="text-xs text-ink-muted">
              Sẽ ghi nhận {sick?.fullName} nghỉ {partial ? `từ ${fromTime} đến ${toTime}` : 'cả ngày'} ({reason || 'Nghỉ đột xuất'}).
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(2)}>Sửa phương án</Button>
            <Button loading={applying} onClick={apply} icon={<CheckCircle2 size={16} />}>Áp dụng chuyển lịch</Button>
          </div>
        </Card>
      )}

      {/* -------------------------------------------------- Bước 4 */}
      {step === 4 && result && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
            <p className="mt-2 text-lg font-bold">Đã chuyển {result.moved.length} lịch hẹn</p>
            <p className="text-sm text-ink-muted">
              {result.failed.length ? `${result.failed.length} lịch lỗi · ` : ''}{result.skipped.length} lịch cần gọi khách
            </p>
          </div>
          {result.failed.length > 0 && (
            <Notice tone="danger" title="Lịch chuyển không thành công">
              <ul className="text-xs">{result.failed.map((f) => <li key={f.appointmentId}>{apptById[f.appointmentId]?.code ?? f.appointmentId}: {f.reason}</li>)}</ul>
            </Notice>
          )}
          {(result.skipped.length > 0 || timeChanged.length > 0) && (
            <div>
              <p className="mb-2 text-sm font-semibold">Danh sách cần gọi báo khách</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                {[...timeChanged, ...result.skipped].map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{a.customer.fullName} · <span className="text-ink-muted">{a.code}</span>
                      {plans[a.id] ? <span className="text-teal-700"> → {plans[a.id]!.time} với {plans[a.id]!.stylistName}</span>
                        : <span className="text-red-600"> · chưa có phương án</span>}
                    </span>
                    <a href={`tel:${a.customer.phone}`} className="btn btn-outline btn-sm"><PhoneCall size={13} /> {a.customer.phone}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/quan-ly" className="btn btn-outline"><CalendarCheck size={16} /> Xem lịch ngày</Link>
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={restart}>Xử lý thợ khác</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
