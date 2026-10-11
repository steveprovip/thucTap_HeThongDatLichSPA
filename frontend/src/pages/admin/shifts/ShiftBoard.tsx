import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Shift, ShiftRequest, Stylist, TimeOff } from '@/types';
import { StylistAvatar, TimeSelect24 } from '@/components';
import { DOW_LABELS } from '@/utils/constants';
import { timeToMinutes } from '@/utils/format';
import { presetShift, SHIFT_PRESETS, shiftKind, type ShiftKind } from '@/utils/opsHelpers';
import { stylistColorMap } from '@/utils/stylistColors';

/** Số phút làm thực tế của ca (trừ nghỉ giữa ca). */
export const shiftWorkMinutes = (s: Pick<Shift, 'startTime' | 'endTime' | 'breakStart' | 'breakEnd'>): number => {
  const total = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
  const brk = s.breakStart && s.breakEnd ? timeToMinutes(s.breakEnd) - timeToMinutes(s.breakStart) : 0;
  return Math.max(0, total - brk);
};

/** Màu viên ca theo loại (TASK v3 · NV3): sáng = xanh ngọc nhạt, chiều = tím nhạt, cả ngày = xanh dương nhạt. */
export const KIND_STYLE: Record<ShiftKind, { label: string; pill: string; dot: string }> = {
  morning: { label: 'Ca sáng', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100', dot: 'bg-emerald-300' },
  afternoon: { label: 'Ca chiều', pill: 'bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100', dot: 'bg-violet-300' },
  full: { label: 'Cả ngày', pill: 'bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100', dot: 'bg-sky-300' },
};

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export interface DayInfo {
  date: string;
  /** Lý do tiệm nghỉ cả ngày (nghỉ lễ / đóng cửa cố định); null = mở cửa. */
  closedReason: string | null;
  /** Giờ mở / đóng cửa hôm đó — để ca mẫu một chạm không vượt giờ mở cửa. */
  openTime?: string | null;
  closeTime?: string | null;
}

export interface QuickShift { startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null }

export interface ShiftBoardProps {
  days: DayInfo[];
  stylists: Stylist[];
  shifts: Shift[];
  timeOff: TimeOff[];
  pendingRequests?: ShiftRequest[];
  today: string;
  canEdit: boolean;
  canManageOff: boolean;
  understaffedDates?: Set<string>;
  /** "+ Tuỳ chỉnh": mở hộp thoại thêm ca đầy đủ. */
  onAdd: (stylistId: string, date: string) => void;
  /** "+ Ca sáng / chiều / cả ngày": tạo ca ngay. */
  onQuickAdd: (stylistId: string, date: string, shift: QuickShift) => Promise<void>;
  onUpdateShift: (shift: Shift, patch: { startTime: string; endTime: string }) => Promise<void>;
  onRemoveShift: (shift: Shift) => void;
  onRemoveOff: (off: TimeOff) => void;
}

type Pop =
  | { kind: 'add'; stylist: Stylist; day: DayInfo; anchor: DOMRect }
  | { kind: 'edit'; stylist: Stylist; shift: Shift; anchor: DOMRect };

/** Popover gắn vào ô được bấm, vẽ qua portal để không bị bảng cuộn cắt mất; Esc / bấm ra ngoài để đóng. */
function Popover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.left });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8);
    const below = anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="dialog" style={{ top: pos.top, left: pos.left }}
         className="fixed z-[60] w-60 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
      {children}
    </div>,
    document.body,
  );
}

/**
 * Bảng ca làm theo tuần — phong cách Fresha / 7shifts (TASK v3 · NV3), "nhìn một cái hiểu ngay":
 *  - Hàng: ảnh + tên thợ + tổng giờ tuần ("Nguyễn Thu Hà · 42h"); cột: 7 ngày, cột hôm nay viền xanh dịu.
 *  - Viên ca màu theo loại (sáng / chiều / cả ngày); ngày thợ không có ca là ô xám mờ, nghỉ riêng là viên xám "Nghỉ".
 *  - Bấm ô trống → [+ Ca sáng] [+ Ca chiều] [+ Cả ngày] [+ Tuỳ chỉnh]; bấm viên ca → đổi giờ hoặc xoá ngay.
 */
export function ShiftBoard({
  days, stylists, shifts, timeOff, pendingRequests = [], today, canEdit, canManageOff, understaffedDates,
  onAdd, onQuickAdd, onUpdateShift, onRemoveShift, onRemoveOff,
}: ShiftBoardProps) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ start: '', end: '' });

  const byCell = new Map<string, Shift[]>();
  for (const s of shifts) byCell.set(`${s.stylistId}|${s.workDate}`, [...(byCell.get(`${s.stylistId}|${s.workDate}`) ?? []), s]);
  const offByCell = new Map<string, TimeOff[]>();
  for (const o of timeOff) offByCell.set(`${o.stylistId}|${o.offDate}`, [...(offByCell.get(`${o.stylistId}|${o.offDate}`) ?? []), o]);
  const reqByCell = new Map<string, ShiftRequest[]>();
  for (const r of pendingRequests) reqByCell.set(`${r.stylistId}|${r.workDate}`, [...(reqByCell.get(`${r.stylistId}|${r.workDate}`) ?? []), r]);
  const weekHours = (id: string) => Math.round((shifts.filter((s) => s.stylistId === id).reduce((a, s) => a + shiftWorkMinutes(s), 0) / 60) * 10) / 10;
  const staffCount = (date: string) => new Set(shifts.filter((s) => s.workDate === date).map((s) => s.stylistId)).size;
  // TASK v4 · NV4: cùng một màu cho mỗi thợ ở Bảng ca và Lịch ngày
  const colors = stylistColorMap(stylists.map((s) => s.id));
  const hoursText = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setPop(null); } catch { /* lỗi đã báo bằng toast ở trang; giữ popover để sửa */ } finally { setBusy(false); }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="thin-scroll max-h-[calc(100vh-200px)] overflow-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[190px]" />
            {days.map((d) => <col key={d.date} />)}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th scope="col" className="sticky left-0 z-30 border-b border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Thợ · giờ/tuần
              </th>
              {days.map((d) => {
                const isToday = d.date === today;
                const short = understaffedDates?.has(d.date) && !d.closedReason;
                return (
                  <th key={d.date} scope="col" title={d.closedReason ?? (short ? 'Có khung giờ thiếu thợ' : undefined)}
                      className={`border-b px-2 py-2 text-left font-normal ${isToday ? 'border-b-teal-400 border-x border-x-teal-100 bg-teal-50/60' : 'border-slate-200'}`}>
                    <span className={`flex items-baseline gap-1 whitespace-nowrap ${isToday ? 'text-teal-700' : 'text-ink'}`}>
                      <span className="text-xs font-semibold">{DOW_SHORT[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}</span>
                      <span className="text-[11px] text-ink-muted">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                      {isToday && <span className="text-[10px] font-semibold uppercase">Hôm nay</span>}
                      {short && <span className="ml-auto h-1.5 w-1.5 self-center rounded-full bg-amber-500" aria-label="Thiếu thợ" />}
                    </span>
                    {d.closedReason && <span className="block truncate text-[10px] text-slate-400">{d.closedReason}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {stylists.map((st) => (
              <tr key={st.id} className="group/row">
                <th scope="row" className="sticky left-0 z-10 border-b border-slate-100 bg-white py-1.5 pl-0 pr-3 text-left font-normal">
                  <div className="flex items-center gap-2">
                    <span className={`h-9 w-1 shrink-0 rounded-r-full ${colors.get(st.id)?.dot ?? 'bg-slate-200'}`} aria-hidden />
                    <StylistAvatar id={st.id} name={st.fullName} url={st.avatarUrl} gender={st.gender} size="h-7 w-7" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink" title={st.fullName}>{st.fullName}</span>
                      <span className="block text-[11px] tabular-nums text-ink-muted">{weekHours(st.id)} giờ / tuần</span>
                    </span>
                  </div>
                </th>
                {days.map((d) => {
                  const key = `${st.id}|${d.date}`;
                  const cellShifts = byCell.get(key) ?? [];
                  const offs = offByCell.get(key) ?? [];
                  const reqs = reqByCell.get(key) ?? [];
                  const closed = !!d.closedReason;
                  const empty = !cellShifts.length && !offs.length && !reqs.length;
                  const isToday = d.date === today;
                  const addable = canEdit && !closed;
                  return (
                    <td key={d.date}
                        className={`group/cell relative border-b border-slate-100 p-1 align-middle ${isToday ? 'border-x border-x-teal-100 bg-teal-50/30' : ''}
                          ${closed ? 'bg-stripes' : empty ? 'bg-slate-50/70' : ''}`}>
                      <div className="flex min-h-[34px] flex-col justify-center gap-1">
                        {offs.map((o) => (
                          <span key={o.id} title={o.reason ?? undefined}
                                className="group/off flex items-center justify-between rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                            <span className="truncate">Nghỉ{o.startTime ? ` ${hhmm(o.startTime)}–${hhmm(o.endTime)}` : ''}</span>
                            {canManageOff && (
                              <button type="button" onClick={() => onRemoveOff(o)} title="Huỷ khai báo nghỉ"
                                      aria-label={`Huỷ khai báo nghỉ ngày ${o.offDate} của ${st.fullName}`}
                                      className="inline-flex h-4 w-4 items-center justify-center rounded opacity-0 hover:bg-slate-200 focus:opacity-100 group-hover/off:opacity-100">
                                <X size={11} />
                              </button>
                            )}
                          </span>
                        ))}
                        {cellShifts.map((sh) => {
                          const k = shiftKind(sh.startTime, sh.endTime);
                          const brk = sh.breakStart ? `Nghỉ giữa ca ${hhmm(sh.breakStart)}–${hhmm(sh.breakEnd)}` : '';
                          return (
                            <button key={sh.id} type="button" disabled={!canEdit}
                                    title={[KIND_STYLE[k].label, brk, sh.note].filter(Boolean).join(' · ')}
                                    onClick={(e) => {
                                      setEdit({ start: hhmm(sh.startTime), end: hhmm(sh.endTime) });
                                      setPop({ kind: 'edit', stylist: st, shift: sh, anchor: e.currentTarget.getBoundingClientRect() });
                                    }}
                                    className={`flex w-full flex-col items-center rounded-lg px-2 py-1 text-[12px] font-semibold tabular-nums ring-1 ring-inset transition hover:shadow-sm disabled:cursor-default ${KIND_STYLE[k].pill}`}>
                              <span className="flex items-center gap-1">
                                {hhmm(sh.startTime)} – {hhmm(sh.endTime)}
                                {brk && <Coffee size={11} className="opacity-50" aria-label={brk} />}
                              </span>
                              <span className="text-[10px] font-medium opacity-70">{KIND_STYLE[k].label} · {hoursText(shiftWorkMinutes(sh))}</span>
                            </button>
                          );
                        })}
                        {reqs.map((r) => (
                          <span key={r.id} title={`${r.note ?? 'Thợ tự đăng ký'} · chờ duyệt`}
                                className="truncate rounded-md border border-dashed border-teal-400 px-2 py-0.5 text-center text-[11px] text-teal-700">
                            {r.kind === 'shift' ? `${hhmm(r.startTime)}–${hhmm(r.endTime)}` : 'Xin nghỉ'} · chờ duyệt
                          </span>
                        ))}
                        {addable && empty && (
                          <button type="button" aria-label={`Thêm ca cho ${st.fullName} ngày ${d.date}`}
                                  onClick={(e) => setPop({ kind: 'add', stylist: st, day: d, anchor: e.currentTarget.getBoundingClientRect() })}
                                  className="flex h-[30px] w-full items-center justify-center rounded-md text-slate-300 transition hover:bg-white hover:text-teal-600 hover:ring-1 hover:ring-teal-200 focus:text-teal-600">
                            <Plus size={14} />
                          </button>
                        )}
                        {addable && !empty && (
                          // nút góc trên phải, không chiếm chỗ → rê chuột không làm hàng nhảy chiều cao
                          <button type="button" aria-label={`Thêm ca khác cho ${st.fullName} ngày ${d.date}`} title="Thêm ca khác"
                                  onClick={(e) => setPop({ kind: 'add', stylist: st, day: d, anchor: e.currentTarget.getBoundingClientRect() })}
                                  className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 hover:text-teal-600 focus:flex group-hover/cell:flex">
                            <Plus size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-white">
            <tr className="text-xs">
              <th scope="row" className="sticky left-0 z-30 border-t border-slate-200 bg-white px-3 py-1.5 text-left font-medium text-ink-muted">Số thợ trực</th>
              {days.map((d) => {
                const n = staffCount(d.date);
                return (
                  <td key={d.date} className={`border-t border-slate-200 px-2 py-1.5 tabular-nums ${d.date === today ? 'bg-teal-50/60' : ''}`}>
                    {d.closedReason ? <span className="text-slate-300">—</span>
                      : <span className={n === 0 ? 'font-semibold text-red-600' : 'text-ink-soft'}>{n} thợ</span>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 px-3 py-1.5 text-[11px] text-ink-muted">
        {(Object.keys(KIND_STYLE) as ShiftKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND_STYLE[k].dot}`} /> {KIND_STYLE[k].label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" /> Nghỉ / chưa xếp</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-dashed border-teal-400" /> Chờ duyệt</span>
        {canEdit && <span className="ml-auto">Bấm ô trống để thêm ca · bấm ca để đổi giờ hoặc xoá</span>}
      </div>

      {pop?.kind === 'add' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <p className="mb-1.5 px-1 text-xs text-ink-muted">
            {pop.stylist.fullName} · {DOW_LABELS[new Date(`${pop.day.date}T12:00:00Z`).getUTCDay()]} {pop.day.date.slice(8)}/{pop.day.date.slice(5, 7)}
          </p>
          <div className="grid gap-1">
            {(Object.keys(SHIFT_PRESETS) as ShiftKind[]).map((k) => {
              const preset = presetShift(k, pop.day.openTime ?? null, pop.day.closeTime ?? null);
              return (
                <button key={k} type="button" disabled={!preset || busy}
                        onClick={() => preset && void run(() => onQuickAdd(pop.stylist.id, pop.day.date, preset))}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium ring-1 ring-inset disabled:opacity-40 ${KIND_STYLE[k].pill}`}>
                  <span className="inline-flex items-center gap-1"><Plus size={13} /> {SHIFT_PRESETS[k].label}</span>
                  <span className="text-[11px] tabular-nums opacity-80">{preset ? `${preset.startTime}–${preset.endTime}` : 'ngoài giờ mở cửa'}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => { onAdd(pop.stylist.id, pop.day.date); setPop(null); }}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-ink-soft ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              <SlidersHorizontal size={13} /> + Tuỳ chỉnh…
            </button>
          </div>
        </Popover>
      )}

      {pop?.kind === 'edit' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <p className="mb-1.5 flex items-center gap-1 px-1 text-xs text-ink-muted">
            <Pencil size={12} /> {pop.stylist.fullName} · {pop.shift.workDate.slice(8)}/{pop.shift.workDate.slice(5, 7)}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <TimeSelect24 value={edit.start} onChange={(v) => setEdit((e) => ({ ...e, start: v }))} aria-label="Giờ bắt đầu" className="py-1 text-sm" />
            <TimeSelect24 value={edit.end} onChange={(v) => setEdit((e) => ({ ...e, end: v }))} aria-label="Giờ kết thúc" className="py-1 text-sm" />
          </div>
          {timeToMinutes(edit.end) <= timeToMinutes(edit.start) && <p className="mt-1 px-1 text-[11px] text-red-600">Giờ kết thúc phải sau giờ bắt đầu</p>}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => { onRemoveShift(pop.shift); setPop(null); }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50">
              <Trash2 size={13} /> Xoá ca
            </button>
            <button type="button" disabled={busy || timeToMinutes(edit.end) <= timeToMinutes(edit.start)}
                    onClick={() => void run(() => onUpdateShift(pop.shift, { startTime: edit.start, endTime: edit.end }))}
                    className="ml-auto rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
              Lưu giờ
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}
