import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CalendarX2, Check, Info, Moon, Sun, Sunset } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { Availability } from '@/types';
import { Button, Skeleton } from '@/components';
import { addDaysISO, formatDuration, formatWeekdayDate, todayISO } from '@/utils/format';
import { buildRadar, capacityLabel, freeLevel, type SessionKey } from '@/utils/slotRadar';
import { useSalonInfo } from '@/utils/salonInfo';
import { playCue } from '@/utils/sound';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

const SESSION_ICON: Record<SessionKey, ReactNode> = {
  morning: <Sun size={15} />,
  afternoon: <Sunset size={15} />,
  evening: <Moon size={15} />,
};
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dowOf = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay();

function addMinutesLabel(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Bước 2 — Real-time Availability Radar (S2-05 · RFC-2026-SPA-V3 Pillar I.4): dải 14 ngày (không lịch bật lên rườm rà),
 * khung giờ trống gom theo Sáng / Chiều / Tối với thanh độ trống THẬT (tính từ số thợ rảnh và giờ mở cửa của ngày đó),
 * mỗi khung có chấm mức thợ rảnh. Đổi ngày KHÔNG thay bằng khung chờ: radar cũ mờ đi tới khi dữ liệu mới về (không nháy,
 * không mất vị trí cuộn). Khung giờ đã chọn mà vừa bị đặt mất → tự bỏ chọn và báo khách.
 */
export function Step2Slot() {
  const { selected, date, setDate, time, setTime, totalDuration, setStylistId } = useBooking();
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [lostTime, setLostTime] = useState<string | null>(null);
  const toast = useToast();
  const hours = useSalonInfo().info?.openingHours;
  const seq = useRef(0);
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!date) setDate(todayISO());
  }, [date, setDate]);

  const load = useCallback(async (d: string) => {
    if (!d || selected.length === 0) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const next = await publicApi.availability(d, selected.map((s) => s.id));
      if (my === seq.current) setData(next);
    } catch (e) {
      if (my === seq.current) { toast.error(getErrorMessage(e)); setData(null); }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [selected, toast]);

  useEffect(() => { void load(date); }, [date, load]);

  // Giờ đã chọn (bản nháp cũ, trợ lý điền sẵn, hoặc vừa bị khách khác đặt) không còn trong danh sách mới → bỏ chọn
  useEffect(() => {
    if (!data || data.date !== date || !time) return;
    if (!data.slots.some((s) => s.time === time && s.stylistIds.length > 0)) {
      setLostTime(time);
      setTime('');
    }
  }, [data, date, time, setTime]);

  const quickDays = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)), []);
  const today = quickDays[0];
  const fresh = !!data && data.date === date;
  const dayHours = hours?.find((h) => h.dayOfWeek === dowOf(date));
  const radar = useMemo(
    () => (data ? buildRadar(data.slots, { open: dayHours?.isClosed ? undefined : dayHours?.openTime, close: dayHours?.closeTime, duration: totalDuration }) : []),
    [data, dayHours, totalDuration],
  );
  const maxFree = Math.max(1, ...(data?.slots.map((s) => s.stylistIds.length) ?? [1]));
  const openCount = radar.reduce((n, s) => n + s.slots.length, 0);

  const pickDate = (d: string) => {
    if (d === date) return;
    setDate(d);
    setTime('');
    setLostTime(null);
  };
  const pick = (t: string) => {
    setTime(t);
    setLostTime(null);
    setStylistId(null); // đổi khung giờ thì chọn lại thợ
    playCue('select');
  };

  return (
    <div className="space-y-5">
      <section aria-label="Chọn ngày">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="eyebrow">Chọn ngày</p>
          {/* Ngày xa hơn 14 ngày: ô chọn ngày gốc của hệ điều hành, ẩn sau một nút gọn */}
          <label className="relative inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-gold/50 hover:text-slate-900">
            <CalendarDays size={14} className="text-gold" /> Ngày khác
            <input ref={dateInput} type="date" value={date} min={today} max={addDaysISO(today, 60)} aria-label="Chọn ngày khác"
                   onChange={(e) => { if (e.target.value) pickDate(e.target.value); }}
                   onClick={() => dateInput.current?.showPicker?.()}
                   className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 thin-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quickDays.map((d, i) => {
            const active = d === date;
            const closed = hours?.find((h) => h.dayOfWeek === dowOf(d))?.isClosed;
            return (
              <button key={d} type="button" aria-pressed={active} aria-label={formatWeekdayDate(`${d}T00:00:00+07:00`)} onClick={() => pickDate(d)}
                      className={`relative flex min-h-[78px] min-w-[64px] snap-start flex-col items-center justify-center rounded-2xl border px-2 text-center
                        transition-[color,background-color,border-color,transform,box-shadow] duration-spring ease-spring active:scale-[0.95]
                        ${active ? 'border-transparent bg-teal-700 text-white shadow-glow' : 'border-slate-200 bg-white/50 text-slate-700 hover:border-gold/50'}
                        ${closed && !active ? 'opacity-45' : ''}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${active ? 'text-white/75' : i === 0 ? 'text-gold' : 'text-slate-500'}`}>
                  {i === 0 ? 'Nay' : i === 1 ? 'Mai' : WEEKDAY[dowOf(d)]}
                </span>
                <span className="tnum mt-1 font-display text-[26px] font-semibold leading-none">{d.slice(8, 10)}</span>
                <span className={`tnum mt-1 text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{closed ? 'Nghỉ' : `Th${Number(d.slice(5, 7))}`}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Info size={14} className="mt-px shrink-0 text-gold" />
        <span>Gói của bạn kéo dài <strong className="font-semibold text-slate-800">{formatDuration(totalDuration)}</strong> — radar chỉ hiện khung có thợ rảnh liên tục đủ chừng đó, cập nhật theo lịch thật.</span>
      </p>

      {data?.exceedsLongestShift && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Tổng thời lượng vượt quá độ dài ca dài nhất trong tuần. Bạn nên tách thành hai lần hẹn để tiệm phục vụ trọn vẹn.
        </p>
      )}
      {lostTime && (
        <p role="status" className="animate-fade-in flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Khung {lostTime} vừa được khách khác giữ hoặc không còn đủ thời lượng. Bạn chọn giờ khác giúp tiệm nhé.
        </p>
      )}

      {!data && loading ? (
        <div role="status" aria-busy="true" className="grid gap-3 lg:grid-cols-3">
          <span className="sr-only">Đang tính khung giờ còn trống…</span>
          {[0, 1, 2].map((k) => (
            <div key={k} className="space-y-3 rounded-2xl border border-slate-200/70 p-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            </div>
          ))}
        </div>
      ) : !data ? null : (
        <div aria-busy={loading} className={`relative transition-opacity duration-200 ${fresh && !loading ? 'opacity-100' : 'pointer-events-none opacity-50'}`}>
          {loading && <span aria-hidden className="absolute -top-2 left-0 h-px w-full overflow-hidden"><span className="block h-full w-1/3 animate-progress bg-gold" /></span>}
          {data.salonClosed ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <CalendarX2 size={30} className="mx-auto text-slate-400" />
              <p className="mt-3 font-display text-xl font-semibold text-slate-900">Tiệm không hoạt động ngày này</p>
              <p className="mt-1 text-sm text-slate-500">{data.closedReason ?? 'Vui lòng chọn ngày khác.'}</p>
            </div>
          ) : openCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <CalendarX2 size={30} className="mx-auto text-slate-400" />
              <p className="mt-3 font-display text-xl font-semibold text-slate-900">Ngày này đã kín chỗ cho gói bạn chọn</p>
              {data.suggestedDates.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-slate-500">Ngày gần nhất còn chỗ:</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {data.suggestedDates.map((d) => (
                      <Button key={d} variant="outline" size="sm" onClick={() => pickDate(d)}>{formatWeekdayDate(`${d}T00:00:00+07:00`)}</Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Chưa tìm được ngày trống trong 30 ngày tới, bạn gọi tiệm để được sắp xếp nhé.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {radar.map((session) => (
                <section key={session.key} aria-label={`Buổi ${session.label}: ${session.slots.length} khung trống`}
                         className={`rounded-2xl border border-slate-200/70 bg-white/40 p-3.5 sm:p-4 ${session.slots.length ? '' : 'opacity-60'}`}>
                  <header className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold">{SESSION_ICON[session.key]}</span>
                      {session.label}
                    </span>
                    <span className="tnum text-[11px] text-slate-500">
                      {session.range ? `${session.range[0]}–${session.range[1]}` : '—'}
                    </span>
                  </header>
                  {/* Thanh độ trống thật của buổi: chỉ transform scaleX (GPU), lò xo khi đổi ngày */}
                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full origin-left rounded-full transition-transform duration-spring ease-spring ${session.capacity >= 0.3 ? 'bg-gold' : 'bg-amber-500'}`}
                           style={{ transform: `scaleX(${Math.max(session.slots.length ? 0.04 : 0, session.capacity)})` }} />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-600">{capacityLabel(session.capacity, session.slots.length)}</span>
                  </div>
                  {session.slots.length > 0 ? (
                    <div className="mt-3.5 grid grid-cols-3 gap-2 xs:grid-cols-4 lg:grid-cols-3">
                      {session.slots.map((s) => {
                        const on = time === s.time;
                        const level = freeLevel(s.free, maxFree);
                        return (
                          <button key={s.time} type="button" onClick={() => pick(s.time)} aria-pressed={on}
                                  aria-label={`${s.time}, ${s.free} thợ rảnh`}
                                  className={`group relative flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold
                                    transition-[color,background-color,border-color,transform,box-shadow] duration-spring ease-spring active:scale-[0.94]
                                    ${on ? 'border-transparent bg-teal-700 text-white shadow-glow' : 'border-slate-200 bg-white/60 text-slate-800 hover:border-gold/60 hover:text-slate-900'}`}>
                            <span className="tnum leading-none">{s.time}</span>
                            <span aria-hidden className="flex gap-0.5">
                              {[1, 2, 3].map((d) => (
                                <span key={d} className={`h-1 w-1 rounded-full ${d <= level ? (on ? 'bg-white/80' : 'bg-gold') : on ? 'bg-white/25' : 'bg-slate-300'}`} />
                              ))}
                            </span>
                            {on && <span className="animate-spring-pop absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-teal-700 shadow ring-2 ring-canvas"><Check size={12} strokeWidth={3} /></span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-center text-xs text-slate-500">Buổi này đã kín</p>
                  )}
                </section>
              ))}
            </div>
          )}
          {time && fresh && (
            <p key={time} className="animate-spring-in mt-4 flex items-start gap-2.5 rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3 text-sm text-slate-800">
              <Check size={16} className="mt-0.5 shrink-0 text-gold" />
              <span>
                Đã chọn <strong className="tnum">{time}</strong> · {formatWeekdayDate(`${date}T00:00:00+07:00`)} — dự kiến xong lúc{' '}
                <strong className="tnum">{addMinutesLabel(time, totalDuration)}</strong>.
              </span>
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span aria-hidden className="flex gap-0.5"><span className="h-1 w-1 rounded-full bg-gold" /><span className="h-1 w-1 rounded-full bg-gold" /><span className="h-1 w-1 rounded-full bg-gold" /></span>
            Số chấm = mức thợ rảnh ở khung giờ đó (càng nhiều càng dễ chọn thợ quen).
          </p>
        </div>
      )}
    </div>
  );
}
