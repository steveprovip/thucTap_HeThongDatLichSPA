import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarX2, CheckCircle2, Info, Moon, Sun, Sunset } from 'lucide-react';
import { getErrorMessage, publicApi } from '@/api';
import type { Availability } from '@/types';
import { Button, Skeleton } from '@/components';
import { addDaysISO, formatDuration, formatWeekdayDate, todayISO } from '@/utils/format';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';

/** Nhóm khung giờ theo buổi; mọi khung giờ đều rơi vào đúng một nhóm. */
const SESSIONS: { label: string; icon: ReactNode; test: (t: string) => boolean }[] = [
  { label: 'Sáng', icon: <Sun size={14} className="text-amber-600" />, test: (t) => t < '12:00' },
  { label: 'Chiều', icon: <Sunset size={14} className="text-orange-600" />, test: (t) => t >= '12:00' && t < '17:00' },
  { label: 'Tối', icon: <Moon size={14} className="text-indigo-500" />, test: (t) => t >= '17:00' },
];

/** Bước 2 — chọn ngày rồi chọn khung giờ còn đủ chỗ cho tổng thời lượng (S2-05). */
export function Step2Slot() {
  const { selected, date, setDate, time, setTime, totalDuration, setStylistId } = useBooking();
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!date) setDate(todayISO());
  }, [date, setDate]);

  const load = useCallback(async (d: string) => {
    if (!d || selected.length === 0) return;
    setLoading(true);
    try {
      setData(await publicApi.availability(d, selected.map((s) => s.id)));
    } catch (e) {
      toast.error(getErrorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selected, toast]);

  useEffect(() => { void load(date); }, [date, load]);

  // DateNav 14 ngày tới (fresha-luxury-ui-engine)
  const quickDays = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));

  const pick = (t: string) => {
    setTime(t);
    setStylistId(null); // đổi khung giờ thì chọn lại thợ
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="field-label">Chọn ngày</p>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 thin-scroll">
          {quickDays.map((d, i) => {
            const active = d === date;
            const label = formatWeekdayDate(`${d}T00:00:00+07:00`);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => { setDate(d); setTime(''); }}
                className={`flex min-h-[72px] min-w-[76px] snap-start flex-col items-center justify-center rounded-xl border px-2 py-2 text-center
                  transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.96]
                  ${active ? 'border-teal-800 bg-teal-800 text-white' : 'border-ivory-line bg-white text-slate-700 hover:border-teal-300'}`}
              >
                <span className={`block text-[11px] font-medium ${active ? 'text-amber-100' : i === 0 ? 'text-teal-700' : 'text-slate-500'}`}>
                  {i === 0 ? 'Hôm nay' : label.split(' ').slice(0, -1).join(' ')}
                </span>
                <span className="my-0.5 block text-xl font-semibold leading-none tabular-nums">{d.slice(8, 10)}</span>
                <span className={`block text-[10px] ${active ? 'text-white/75' : 'text-slate-400'}`}>Th{Number(d.slice(5, 7))}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <input
            type="date"
            value={date}
            min={todayISO()}
            max={addDaysISO(todayISO(), 60)}
            onChange={(e) => { if (e.target.value) { setDate(e.target.value); setTime(''); } }}
            className="field-input"
            aria-label="Chọn ngày khác"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-ivory px-3.5 py-2.5 text-xs text-slate-700">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          Tổng thời lượng bạn chọn: <strong>{formatDuration(totalDuration)}</strong>.
          Chỉ hiện khung giờ có thợ rảnh liên tục đủ chừng đó.
        </p>
      </div>

      {data?.exceedsLongestShift && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Tổng thời lượng vượt quá độ dài ca dài nhất trong tuần. Bạn nên tách thành hai lần hẹn để tiệm phục vụ trọn vẹn.
        </p>
      )}

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">Đang tính khung giờ còn trống…</span>
          <Skeleton className="h-3.5 w-40" />
          <div className="grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
          </div>
        </div>
      ) : !data ? null : data.salonClosed ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <CalendarX2 size={30} className="mx-auto text-slate-400" />
          <p className="mt-2 font-semibold">Tiệm không hoạt động ngày này</p>
          <p className="mt-1 text-sm text-ink-muted">{data.closedReason ?? 'Vui lòng chọn ngày khác.'}</p>
        </div>
      ) : data.slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <CalendarX2 size={30} className="mx-auto text-slate-400" />
          <p className="mt-2 font-semibold">Ngày này đã kín chỗ cho gói dịch vụ bạn chọn</p>
          {data.suggestedDates.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-ink-muted">Hai ngày gần nhất còn chỗ:</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {data.suggestedDates.map((d) => (
                  <Button key={d} variant="outline" size="sm" onClick={() => { setDate(d); setTime(''); }}>
                    {formatWeekdayDate(`${d}T00:00:00+07:00`)}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Chưa tìm được ngày trống trong 30 ngày tới, bạn gọi tiệm để được sắp xếp nhé.
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="field-label">Khung giờ còn trống ({data.slots.length})</p>
          {SESSIONS.map((session) => {
            const group = data.slots.filter((s) => session.test(s.time));
            if (!group.length) return null;
            return (
              <section key={session.label} className="mb-3 last:mb-0" aria-label={`Buổi ${session.label}`}>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  {session.icon} {session.label} <span className="font-normal tabular-nums text-slate-400">· {group.length} khung</span>
                </p>
                <div className="grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-6">
                  {group.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => pick(s.time)}
                      aria-pressed={time === s.time}
                      className={`min-h-[48px] rounded-xl border text-sm font-semibold tabular-nums
                        transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.95]
                        ${time === s.time
                          ? 'border-teal-800 bg-teal-800 text-white'
                          : 'border-ivory-line bg-white text-slate-800 hover:border-teal-500 hover:text-teal-800'}`}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {time && (
            <p key={time} className="animate-fade-in mt-3 flex items-start gap-2 rounded-xl bg-teal-800/[0.06] px-3.5 py-2.5 text-xs text-teal-900">
              <CheckCircle2 size={15} className="mt-px shrink-0 text-teal-700" />
              <span>
              Đã chọn <strong>{time}</strong> ngày {formatWeekdayDate(`${date}T00:00:00+07:00`)} — dự kiến xong lúc{' '}
              <strong>{addMinutesLabel(time, totalDuration)}</strong>.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function addMinutesLabel(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
