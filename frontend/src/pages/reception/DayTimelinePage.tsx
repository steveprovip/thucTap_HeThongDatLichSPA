import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { CalendarX2, Columns3, GanttChart, RefreshCw, UserPlus } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, DayTimeline } from '@/types';
import { Button, ConfirmDialog, DateNav, SectionTitle, StylistAvatar, TimelineSkeleton } from '@/components';
import { minutesToHHmm, snapStart, TIMELINE_DRAGGABLE } from '@/utils/dragRules';
import { STATUS_BLOCK, STATUS_DOT, STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';
import { timeToMinutes, todayISO } from '@/utils/format';
import { overrunInfo } from '@/utils/opsHelpers';
import { stylistColorMap } from '@/utils/stylistColors';
import { useAppointmentsSync } from '@/utils/liveSync';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';
import { WalkInModal } from './WalkInPage';
import { DayBoard } from './DayBoard';

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
const COLOR_KEY = 'salon.timelineColorBy';
type ColorBy = 'stylist' | 'status';
const readColorBy = (): ColorBy => {
  try { return localStorage.getItem(COLOR_KEY) === 'status' ? 'status' : 'stylist'; } catch { return 'stylist'; }
};

const VIEW_KEY = 'salon.dayView';
type DayView = 'timeline' | 'board';
const readView = (): DayView => {
  try { return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'timeline'; } catch { return 'timeline'; }
};

/** Cột thợ nhận thả (đổi thợ). */
function DropColumn({ id, children, className, style }: { id: string; children: ReactNode; className: string; style: CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`${className} ${isOver ? 'bg-teal-50/60' : ''}`} style={style}>{children}</div>;
}

/**
 * Khối lịch kéo được (ghi chú test 13/10 — đổi thợ / dời giờ kiểu Jira): kéo ngang sang cột thợ khác, kéo dọc để dời giờ,
 * bắt bước 15 phút; trong lúc kéo hiện giờ mới. Bấm (không kéo) vẫn mở chi tiết như cũ.
 */
function TimelineBlock({ id, enabled, slotH, startMin, label, className, style, title, onOpen, children }: {
  id: string; enabled: boolean; slotH: number; startMin: number; label: (m: number) => string; className: string;
  style: CSSProperties; title: string; onOpen: () => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: !enabled });
  const dy = transform ? Math.round(transform.y / slotH) * slotH : 0;
  return (
    <button ref={setNodeRef} type="button" onClick={onOpen} title={title} {...(enabled ? { ...listeners, ...attributes } : {})}
            className={`${className} ${enabled ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${isDragging ? 'z-[30] opacity-90 shadow-xl ring-2 ring-teal-500' : ''}`}
            style={{ ...style, ...(transform ? { transform: `translate3d(${transform.x}px, ${dy}px, 0)` } : {}) }}>
      {isDragging && (
        <span className="absolute -top-5 left-0 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          → {label(startMin + Math.round((transform?.y ?? 0) / slotH) * 15)}
        </span>
      )}
      {children}
    </button>
  );
}

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
  /** TASK v4 · NV4: tô màu khối lịch theo THỢ (mỗi người một màu, kiểu Fresha) hoặc theo TRẠNG THÁI như trước. */
  const [colorBy, setColorByState] = useState<ColorBy>(readColorBy);
  const setColorBy = (v: ColorBy) => {
    setColorByState(v);
    try { localStorage.setItem(COLOR_KEY, v); } catch { /* chế độ riêng tư: chỉ nhớ trong phiên */ }
  };
  const colors = useMemo(() => stylistColorMap(data?.columns.map((c) => c.stylistId) ?? []), [data]);
  /** Ghi chú test 13/10: thêm chế độ Bảng Kanban (kéo thẻ đổi trạng thái kiểu Jira) bên cạnh dòng thời gian. */
  const [view, setViewState] = useState<DayView>(readView);
  const setView = (v: DayView) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* chế độ riêng tư */ }
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [move, setMove] = useState<{ a: Appointment; stylistId: string; stylistName: string; time: string } | null>(null);

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
  // Quay lại từ Bảng Kanban: lưới dựng mới → cuộn lại tới giờ hiện tại
  useEffect(() => { scrolledFor.current = null; }, [view]);
  useEffect(() => {
    if (view !== 'timeline' || !data || date !== todayISO() || !scrollRef.current || scrolledFor.current === date) return;
    scrolledFor.current = date;
    const openMin = timeToMinutes(data.salonOpen);
    const offset = ((salonNowMinutes(Date.now()) - openMin) / STEP) * SLOT_H - 120;
    scrollRef.current.scrollTop = Math.max(0, offset);
  }, [data, date, view]);

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
        description={view === 'board'
          ? 'Mỗi trạng thái là một cột: kéo thẻ để xác nhận, check-in, bắt đầu, hoàn tất. Bấm thẻ để xem chi tiết.'
          : 'Mỗi thợ là một cột, trục dọc 15 phút. Kéo khối lịch sang thợ khác / giờ khác để đổi lịch; bấm để xem chi tiết.'}
        action={
          <div className="flex flex-wrap gap-2">
            <div role="radiogroup" aria-label="Kiểu xem" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
              {([['timeline', 'Dòng thời gian', <GanttChart key="t" size={14} />], ['board', 'Bảng Kanban', <Columns3 key="b" size={14} />]] as const).map(([v, label, icon]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${view === v ? 'bg-teal-600 text-white' : 'text-ink-soft hover:bg-slate-50'}`}>
                  {icon}{label}
                </button>
              ))}
            </div>
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
        <div className="flex flex-wrap items-center gap-1.5">
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
          <div role="radiogroup" aria-label="Tô màu khối lịch" className={`ml-auto ${view === 'board' ? 'hidden' : 'inline-flex'} rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-sm`}>
            {([['stylist', 'Màu theo thợ'], ['status', 'Màu theo trạng thái']] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={colorBy === v} onClick={() => setColorBy(v)}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${colorBy === v ? 'bg-teal-600 text-white' : 'text-ink-soft hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
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
      ) : view === 'board' && data.columns.length > 0 ? (
        <DayBoard columns={data.columns} onOpen={setSelected} onChanged={() => { void load(date, true); }} />
      ) : data.columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="font-semibold">Chưa có thợ nào đang làm việc</p>
        </div>
      ) : (
        <div aria-busy={switching}
             className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition-opacity ${switching ? 'opacity-60' : ''}`}>
          <div ref={scrollRef} className="thin-scroll max-h-[calc(100vh-280px)] overflow-auto">
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={(e: DragEndEvent) => {
              const a = data.columns.flatMap((c) => c.appointments).find((x) => x.id === e.active.id);
              const target = e.over ? data.columns.find((c) => `col:${c.stylistId}` === e.over!.id) : null;
              if (!a || !target) return;
              const start = snapStart(timeToMinutes(a.startTime), e.delta.y, SLOT_H, STEP, openMin, closeMin, a.totalDurationMinutes);
              const time = minutesToHHmm(start);
              if (target.stylistId === a.stylist.id && time === a.startTime) return;
              setMove({ a, stylistId: target.stylistId, stylistName: target.stylistName, time });
            }}>
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
                  <div className={`sticky top-0 z-10 flex h-14 items-center gap-2.5 border-b border-t-4 border-b-slate-200 bg-white/95 px-2.5 backdrop-blur ${colors.get(col.stylistId)?.bar ?? 'border-t-transparent'}`}>
                    <StylistAvatar id={col.stylistId} name={col.stylistName} url={col.avatarUrl} gender={col.gender} size="h-8 w-8" className="shadow-sm" />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-sm font-semibold text-slate-900">{col.stylistName}</span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${colors.get(col.stylistId)?.dot ?? 'bg-slate-300'}`} aria-hidden />
                        {col.appointments.filter((a) => a.status !== 'cancelled').length} lịch
                      </span>
                    </span>
                  </div>

                  <DropColumn id={`col:${col.stylistId}`} className="off-shift relative" style={{ height: gridHeight }}>
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
                    {col.appointments.map((a, index) => {
                      const c = colors.get(col.stylistId);
                      const tone = colorBy === 'stylist' && c
                        ? `${c.soft} ${c.edge} ${c.text} ${a.status === 'cancelled' ? 'line-through opacity-60' : a.status === 'no_show' ? 'opacity-60' : ''}`
                        : STATUS_BLOCK[a.status];
                      // QA Sprint 3 · mục 4: lịch đang làm quá thời lượng chuẩn → viền vàng; quá hơn 20′ → viền đỏ nhấp nháy
                      const over = overrunInfo(a, clock);
                      const overRing = over.level === 'danger' ? 'z-[6] ring-2 ring-red-500 ring-offset-1 animate-pulse-subtle'
                        : over.level === 'warn' ? 'ring-2 ring-amber-400' : '';
                      return (
                      <TimelineBlock
                        key={a.id}
                        id={a.id}
                        enabled={canWalkIn && TIMELINE_DRAGGABLE.includes(a.status)}
                        slotH={SLOT_H}
                        startMin={timeToMinutes(a.startTime)}
                        label={minutesToHHmm}
                        onOpen={() => setSelected(a)}
                        className={`absolute inset-x-1 z-[5] overflow-hidden rounded-md border-l-4 px-2 py-1 text-left
                                    animate-fade-in text-[11px] leading-tight shadow-sm ring-1 ring-slate-900/[0.04] transition-all duration-200 hover:z-[6] hover:-translate-y-px hover:shadow-md active:scale-[0.98]
                                    ${tone} ${overRing} ${flashId === a.id ? 'z-[6] animate-pulse-subtle ring-2 ring-teal-500 ring-offset-1' : ''}`}
                        style={{ top: topOf(a.startTime) + 1, height: heightOf(a.totalDurationMinutes) - 2, animationDelay: `${index * 40}ms` }}
                        title={`${a.startTime}–${a.endTime} · ${a.customer.fullName} · ${a.services.map((s) => s.name).join(', ')} · ${STATUS_LABELS[a.status]}`
                          + (over.level !== 'none' ? ` · Quá thời lượng chuẩn ${over.overMinutes} phút${over.level === 'danger' ? ' — các lịch sau có nguy cơ trễ' : ''}` : '')
                          + (canWalkIn && TIMELINE_DRAGGABLE.includes(a.status) ? ' · Kéo để đổi thợ / dời giờ' : '')}
                      >
                        <span className="flex items-center gap-1 truncate font-semibold">
                        {colorBy === 'stylist' && a.status !== 'in_progress' && (
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} aria-label={STATUS_LABELS[a.status]} />
                        )}
                        {a.status === 'in_progress' && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0"><span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-cyan-500" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-600" /></span>
                        )}{a.startTime} {a.customer.fullName}</span>
                        {a.totalDurationMinutes >= 30 && (
                          <span className="block truncate opacity-80">
                            {a.services.map((s) => s.name).join(', ')}
                          </span>
                        )}
                        {over.level !== 'none' && (
                          <span className={`block truncate font-semibold ${over.level === 'danger' ? 'text-red-700' : 'text-amber-700'}`}>
                            ⚠ Quá giờ {over.overMinutes}′
                          </span>
                        )}
                        {a.isLate && a.totalDurationMinutes >= 45 && (
                          <span className="block font-semibold">Trễ {a.lateMinutes}′</span>
                        )}
                      </TimelineBlock>
                      );
                    })}
                  </DropColumn>
                </div>
              ))}
            </div>
            </DndContext>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!move}
        title="Đổi lịch hẹn?"
        message={move ? (
          <>
            <p className="font-semibold text-ink">{move.a.customer.fullName} · {move.a.services.map((x) => x.name).join(', ')}</p>
            <p className="mt-1">
              {move.a.stylist.fullName} <strong>{move.a.startTime}</strong> → {move.stylistName} <strong>{move.time}</strong>
            </p>
            <p className="mt-1 text-xs">Hệ thống kiểm tra kỹ năng thợ và giờ trống; khách nhận email báo lịch mới.</p>
          </>
        ) : ''}
        confirmLabel="Đổi lịch"
        onClose={() => setMove(null)}
        onConfirm={async () => {
          if (!move) return;
          try {
            await appointmentsApi.reschedule(move.a.id, {
              ...(move.stylistId !== move.a.stylist.id ? { stylistId: move.stylistId } : {}),
              ...(move.time !== move.a.startTime ? { time: move.time } : {}),
            });
            toast.success(`Đã đổi lịch ${move.a.customer.fullName} sang ${move.stylistName} lúc ${move.time}`);
            setFlashId(move.a.id);
            window.setTimeout(() => setFlashId((x) => (x === move.a.id ? null : x)), 4000);
          } catch (e) {
            toast.error(getErrorMessage(e));
          } finally {
            void load(date, true);
          }
        }}
      />
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
