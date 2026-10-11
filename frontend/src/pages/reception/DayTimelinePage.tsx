import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarX2, RefreshCw, UserPlus } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, DayTimeline } from '@/types';
import { Button, DateNav, SectionTitle, StylistAvatar, TimelineSkeleton } from '@/components';
import { STATUS_BLOCK, STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';
import { timeToMinutes, todayISO } from '@/utils/format';
import { useAppointmentsSync } from '@/utils/liveSync';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';
import { WalkInModal } from './WalkInPage';

/** Số phút từ nửa đêm theo giờ tiệm (Asia/Ho_Chi_Minh), không phụ thuộc múi giờ máy. */
const salonNowMinutes = (ms: number): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute') + get('second') / 60;
};

/** Chiều cao một ô 15 phút (px) — lưới dọc của lịch ngày. */
const SLOT_H = 30;
const STEP = 15;

/** S3-01: lịch cả ngày dạng cột theo từng thợ, trục dọc chia theo 15 phút. */
export function DayTimelinePage() {
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date');
  const [date, setDateState] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayISO());
  const [data, setData] = useState<DayTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { user } = useAuth();
  const canWalkIn = user?.role === 'receptionist' || user?.role === 'owner';

  /** Đổi ngày và giữ ?date= trên URL để quay lại / chia sẻ đúng ngày đang xem. */
  const setDate = useCallback((d: string) => {
    setDateState(d);
    setParams(d === todayISO() ? {} : { date: d }, { replace: true });
  }, [setParams]);

  // QA 11/10: đổi ngày KHÔNG thay lưới bằng khung chờ (mất vị trí cuộn ngang/dọc, giật trang) — giữ lưới cũ mờ đi
  // tới khi dữ liệu ngày mới về. `seq` bỏ phản hồi cũ khi bấm qua nhiều ngày liên tiếp.
  const [switching, setSwitching] = useState(false);
  const hasData = useRef(false);
  const seq = useRef(0);
  const load = useCallback(async (d: string, silent = false) => {
    const my = ++seq.current;
    if (!silent) {
      if (hasData.current) setSwitching(true);
      else setLoading(true);
    }
    try {
      const t = await appointmentsApi.timeline(d);
      if (my !== seq.current) return;
      setData(t);
      hasData.current = true;
    } catch (e) {
      if (my === seq.current) toast.error(getErrorMessage(e));
    } finally {
      if (my === seq.current) { setLoading(false); setSwitching(false); }
    }
  }, [toast]);

  useEffect(() => { void load(date); }, [date, load]);
  // Lỗi 6: lịch vừa tạo ở quầy / tab khác xuất hiện ngay, không cần bấm "Làm mới"
  useAppointmentsSync(() => { void load(date, true); });

  const handleWalkInCreated = (a: Appointment) => {
    setFlashId(a.id);
    window.setTimeout(() => setFlashId((id) => (id === a.id ? null : id)), 5000);
    if (a.date !== date) setDate(a.date);
    else void load(date, true);
  };

  // Cuộn tới giờ hiện tại MỘT lần khi mở lịch hôm nay (không giật khi dữ liệu tự làm mới)
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || date !== todayISO() || !scrollRef.current || scrolledFor.current === date) return;
    scrolledFor.current = date;
    const openMin = timeToMinutes(data.salonOpen);
    const offset = ((salonNowMinutes(Date.now()) - openMin) / STEP) * SLOT_H - 120;
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

  // Đồng hồ sống: cập nhật vạch giờ hiện tại mỗi 30 giây.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Vạch đỏ luôn hiện khi xem hôm nay; ngoài giờ mở cửa thì bám mép trên/dưới lưới (nét đứt) kèm nhãn giờ thật.
  const nowMinutes = salonNowMinutes(clock);
  const closeMin = data ? timeToMinutes(data.salonClose) : 0;
  const outsideHours = !!data && (nowMinutes < openMin || nowMinutes > closeMin);
  const nowLineTop = useMemo(() => {
    if (!data || date !== todayISO()) return null;
    const clamped = Math.min(Math.max(nowMinutes, openMin), closeMin);
    return ((clamped - openMin) / STEP) * SLOT_H;
  }, [data, date, openMin, closeMin, nowMinutes]);
  const nowLabel = new Date(clock).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
  });

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Lịch hẹn trong ngày"
        description="Mỗi thợ là một cột, trục dọc chia theo 15 phút. Bấm vào một lịch để xử lý."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => load(date)}>
              Làm mới
            </Button>
            {canWalkIn && (
              <Button size="sm" icon={<UserPlus size={15} />} onClick={() => setWalkInOpen(true)}>
                Khách vãng lai
              </Button>
            )}
          </div>
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
        <TimelineSkeleton />
      ) : !data ? null : data.salonClosed ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <CalendarX2 size={32} className="mx-auto text-slate-400" />
          <p className="mt-2 font-semibold">Tiệm đóng cửa ngày này</p>
          <p className="mt-1 text-sm text-ink-muted">{data.closedReason}</p>
        </div>
      ) : data.columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="font-semibold">Chưa có thợ nào đang làm việc</p>
        </div>
      ) : (
        <div aria-busy={switching}
             className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition-opacity ${switching ? 'opacity-60' : ''}`}>
          <div ref={scrollRef} className="thin-scroll max-h-[calc(100vh-280px)] overflow-auto">
            <div className="flex min-w-max lg:min-w-full">
              {/* Cột giờ, dính bên trái */}
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-slate-100 bg-white">
                <div className="sticky top-0 z-10 h-14 border-b border-slate-200 bg-white" />
                <div className="relative" style={{ height: gridHeight }}>
                  {rows.map((t, i) => (
                    <div
                      key={t}
                      className="absolute left-0 right-0 pr-2 text-right text-[11px] font-medium tabular-nums text-slate-400"
                      style={{ top: i * SLOT_H - 6, height: SLOT_H }}
                    >
                      {t.endsWith(':00') || t.endsWith(':30') ? t : ''}
                    </div>
                  ))}
                  {nowLineTop !== null && (
                    <div className="pointer-events-none absolute right-1 z-20 -translate-y-1/2 transition-[top] duration-1000 ease-linear"
                         style={{ top: nowLineTop }}>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500 py-0.5 pl-1 pr-1.5 text-[10px] font-semibold tabular-nums text-white shadow-md shadow-red-500/40"
                            title={outsideHours ? 'Giờ hiện tại (ngoài giờ mở cửa)' : 'Giờ hiện tại'}>
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-white" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        {nowLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mỗi thợ một cột */}
              {data.columns.map((col) => (
                <div key={col.stylistId} className="w-[176px] shrink-0 border-r border-slate-100 last:border-r-0 lg:min-w-[176px] lg:flex-1">
                  <div className="sticky top-0 z-10 flex h-14 items-center gap-2.5 border-b border-slate-200 bg-white/95 px-2.5 backdrop-blur">
                    <StylistAvatar id={col.stylistId} name={col.stylistName} url={col.avatarUrl} gender={col.gender} size="h-8 w-8" className="shadow-sm" />
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{col.stylistName}</span>
                  </div>

                  <div className="off-shift relative" style={{ height: gridHeight }}>
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
                        className={`absolute inset-x-0 border-t ${t.endsWith(':00') ? 'border-slate-200/80' : 'border-slate-100'}`}
                        style={{ top: i * SLOT_H }}
                      />
                    ))}
                    {/* Nghỉ giữa ca / nghỉ riêng: tô khác màu, không nhận thao tác */}
                    {col.offBlocks.map((b, i) => (
                      <div
                        key={`o${i}`}
                        title={b.reason}
                        className="absolute inset-x-0 z-[1] bg-slate-100/80 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.22)_0_1px,transparent_1px_8px)]"
                        style={{ top: topOf(b.start), height: heightOf(timeToMinutes(b.end) - timeToMinutes(b.start)) }}
                      >
                        <span className="block px-1.5 pt-0.5 text-[10px] font-medium text-slate-500">{b.reason}</span>
                      </div>
                    ))}
                    {/* Vạch giờ hiện tại */}
                    {nowLineTop !== null && (
                      <>
                        {/* Phần đã qua trong ngày: phủ nhạt */}
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] bg-white/45 transition-[height] duration-1000 ease-linear"
                             style={{ height: nowLineTop }} aria-hidden />
                        {/* Vạch đỏ giờ hiện tại: dày 2px, có quầng sáng, nằm trên mọi khối lịch (nhãn giờ ở cột trục) */}
                        <div className={`pointer-events-none absolute inset-x-0 z-[7] h-[2px] -translate-y-1/2 transition-[top] duration-1000 ease-linear
                                         ${outsideHours ? 'bg-[repeating-linear-gradient(90deg,#ef4444_0_6px,transparent_6px_10px)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]'}`}
                             style={{ top: nowLineTop }} aria-hidden />
                      </>
                    )}
                    {/* Khối lịch hẹn */}
                    {col.appointments.map((a, index) => (
                      <button
                        key={a.id}
                        onClick={() => setSelected(a)}
                        className={`absolute inset-x-1 z-[5] overflow-hidden rounded-md border-l-4 px-2 py-1 text-left
                                    animate-fade-in text-[11px] leading-tight shadow-sm ring-1 ring-slate-900/[0.04] transition-all duration-200 hover:z-[6] hover:-translate-y-px hover:shadow-md active:scale-[0.98]
                                    ${STATUS_BLOCK[a.status]} ${flashId === a.id ? 'z-[6] animate-pulse-subtle ring-2 ring-teal-500 ring-offset-1' : ''}`}
                        style={{ top: topOf(a.startTime) + 1, height: heightOf(a.totalDurationMinutes) - 2, animationDelay: `${index * 40}ms` }}
                        title={`${a.startTime}–${a.endTime} · ${a.customer.fullName} · ${a.services.map((s) => s.name).join(', ')}`}
                      >
                        <span className="flex items-center gap-1 truncate font-semibold">{a.status === 'in_progress' && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0"><span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-cyan-500" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-600" /></span>
                        )}{a.startTime} {a.customer.fullName}</span>
                        {a.totalDurationMinutes >= 30 && (
                          <span className="block truncate opacity-80">
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
      {canWalkIn && (
        <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} onCreated={handleWalkInCreated} />
      )}
    </div>
  );
}
