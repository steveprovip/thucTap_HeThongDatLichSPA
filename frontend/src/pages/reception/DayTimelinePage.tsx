import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2, RefreshCw, UserRound } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, DayTimeline } from '@/types';
import { Button, DateNav, SectionTitle, Spinner, StatusBadge } from '@/components';
import { STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';
import { timeToMinutes, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';

/** Chiều cao một ô 15 phút (px) — lưới dọc của lịch ngày. */
const SLOT_H = 30;
const STEP = 15;

/** S3-01: lịch cả ngày dạng cột theo từng thợ, trục dọc chia theo 15 phút. */
export function DayTimelinePage() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<DayTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const load = useCallback(async (d: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await appointmentsApi.timeline(d));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(date); }, [date, load]);

  // Giữ nguyên vị trí cuộn theo giờ hiện tại khi mở lịch hôm nay
  useEffect(() => {
    if (!data || date !== todayISO() || !scrollRef.current) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = timeToMinutes(data.salonOpen);
    const offset = ((nowMin - openMin) / STEP) * SLOT_H - 120;
    scrollRef.current.scrollTop = Math.max(0, offset);
  }, [data, date]);

  const rows = useMemo(() => {
    if (!data) return [] as string[];
    const open = timeToMinutes(data.salonOpen);
    const close = timeToMinutes(data.salonClose);
    const out: string[] = [];
    for (let m = open; m < close; m += STEP) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return out;
  }, [data]);

  const openMin = data ? timeToMinutes(data.salonOpen) : 0;
  const gridHeight = rows.length * SLOT_H;

  const topOf = (time: string) => ((timeToMinutes(time) - openMin) / STEP) * SLOT_H;
  const heightOf = (minutes: number) => Math.max(SLOT_H * 0.8, (minutes / STEP) * SLOT_H);

  const nowLineTop = useMemo(() => {
    if (!data || date !== todayISO()) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < openMin || nowMin > timeToMinutes(data.salonClose)) return null;
    return ((nowMin - openMin) / STEP) * SLOT_H;
  }, [data, date, openMin]);

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Lịch hẹn trong ngày"
        description="Mỗi thợ là một cột, trục dọc chia theo 15 phút. Bấm vào một lịch để xử lý."
        action={
          <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => load(date)}>
            Làm mới
          </Button>
        }
      />

      <DateNav value={date} onChange={setDate} />

      {data && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(data.summary) as (keyof typeof data.summary)[])
            .filter((k) => data.summary[k] > 0)
            .map((k) => (
              <span key={k} className={`chip border ${STATUS_STYLES[k]}`}>
                {STATUS_LABELS[k]}: <strong>{data.summary[k]}</strong>
              </span>
            ))}
          {Object.values(data.summary).every((v) => v === 0) && (
            <span className="text-sm text-ink-muted">Chưa có lịch hẹn nào trong ngày này.</span>
          )}
        </div>
      )}

      {loading ? (
        <Spinner label="Đang dựng lịch ngày…" />
      ) : !data ? null : data.salonClosed ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-surface-alt px-4 py-12 text-center">
          <CalendarX2 size={32} className="mx-auto text-brand-400" />
          <p className="mt-2 font-semibold">Tiệm đóng cửa ngày này</p>
          <p className="mt-1 text-sm text-ink-muted">{data.closedReason}</p>
        </div>
      ) : data.columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-surface-alt px-4 py-12 text-center">
          <p className="font-semibold">Chưa có thợ nào đang làm việc</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <div ref={scrollRef} className="thin-scroll max-h-[calc(100vh-280px)] overflow-auto">
            <div className="flex min-w-max">
              {/* Cột giờ, dính bên trái */}
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-brand-100 bg-white">
                <div className="sticky top-0 z-10 h-12 border-b border-brand-100 bg-brand-50" />
                <div className="relative" style={{ height: gridHeight }}>
                  {rows.map((t, i) => (
                    <div
                      key={t}
                      className="absolute left-0 right-0 pr-1.5 text-right text-[11px] text-ink-muted"
                      style={{ top: i * SLOT_H - 6, height: SLOT_H }}
                    >
                      {t.endsWith(':00') || t.endsWith(':30') ? t : ''}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mỗi thợ một cột */}
              {data.columns.map((col) => (
                <div key={col.stylistId} className="w-[170px] shrink-0 border-r border-brand-100 last:border-r-0">
                  <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-brand-100 bg-brand-50 px-2">
                    {col.avatarUrl ? (
                      <img src={col.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-200 text-brand-800">
                        <UserRound size={15} />
                      </span>
                    )}
                    <span className="min-w-0 truncate text-xs font-bold text-brand-900">{col.stylistName}</span>
                  </div>

                  <div className="relative bg-gray-50/70" style={{ height: gridHeight }}>
                    {/* Khoảng thợ có mặt: nền trắng */}
                    {col.workingBlocks.map((b, i) => (
                      <div
                        key={`w${i}`}
                        className="absolute inset-x-0 bg-white"
                        style={{ top: topOf(b.start), height: heightOf(timeToMinutes(b.end) - timeToMinutes(b.start)) }}
                      />
                    ))}
                    {/* Lưới 15 phút */}
                    {rows.map((t, i) => (
                      <div
                        key={t}
                        className={`absolute inset-x-0 border-t ${t.endsWith(':00') ? 'border-brand-200' : 'border-brand-50'}`}
                        style={{ top: i * SLOT_H }}
                      />
                    ))}
                    {/* Nghỉ giữa ca / nghỉ riêng: tô khác màu, không nhận thao tác */}
                    {col.offBlocks.map((b, i) => (
                      <div
                        key={`o${i}`}
                        title={b.reason}
                        className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,#f3f0ec,#f3f0ec_6px,#e8e2da_6px,#e8e2da_12px)]"
                        style={{ top: topOf(b.start), height: heightOf(timeToMinutes(b.end) - timeToMinutes(b.start)) }}
                      >
                        <span className="block px-1 pt-0.5 text-[10px] text-ink-muted">{b.reason}</span>
                      </div>
                    ))}
                    {/* Vạch giờ hiện tại */}
                    {nowLineTop !== null && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                           style={{ top: nowLineTop }} />
                    )}
                    {/* Khối lịch hẹn */}
                    {col.appointments.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelected(a)}
                        className={`absolute inset-x-1 z-[5] overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left
                                    text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md
                                    ${STATUS_STYLES[a.status]}`}
                        style={{ top: topOf(a.startTime) + 1, height: heightOf(a.totalDurationMinutes) - 2 }}
                        title={`${a.startTime}–${a.endTime} · ${a.customer.fullName} · ${a.services.map((s) => s.name).join(', ')}`}
                      >
                        <span className="block truncate font-bold">{a.startTime} {a.customer.fullName}</span>
                        {a.totalDurationMinutes >= 30 && (
                          <span className="block truncate opacity-90">
                            {a.services.map((s) => s.name).join(', ')}
                          </span>
                        )}
                        {a.isLate && a.totalDurationMinutes >= 45 && (
                          <span className="block font-semibold">Trễ {a.lateMinutes}′</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AppointmentDrawer
        appointment={selected}
        onClose={() => setSelected(null)}
        onChanged={() => { void load(date, true); }}
      />
    </div>
  );
}
