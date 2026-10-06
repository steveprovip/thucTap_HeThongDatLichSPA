import { Coffee, Plus, Trash2, X } from 'lucide-react';
import type { Shift, ShiftRequest, Stylist, TimeOff } from '@/types';
import { StylistAvatar } from '@/components';
import { DOW_LABELS } from '@/utils/constants';
import { formatDuration, timeToMinutes } from '@/utils/format';

/** Buổi của ca theo giờ bắt đầu — mỗi buổi một màu để nhìn lướt cả tuần không bị rối mắt. */
export type ShiftPeriod = 'morning' | 'afternoon' | 'evening';
export const shiftPeriod = (startTime: string): ShiftPeriod => {
  const m = timeToMinutes(startTime);
  return m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening';
};
export const PERIOD_STYLE: Record<ShiftPeriod, { label: string; pill: string; dot: string }> = {
  morning: { label: 'Ca sáng', pill: 'border-amber-400 bg-amber-50 text-amber-900', dot: 'bg-amber-400' },
  afternoon: { label: 'Ca chiều', pill: 'border-sky-400 bg-sky-50 text-sky-900', dot: 'bg-sky-400' },
  evening: { label: 'Ca tối', pill: 'border-violet-400 bg-violet-50 text-violet-900', dot: 'bg-violet-400' },
};

/** Số phút làm thực tế của ca (trừ nghỉ giữa ca). */
export const shiftWorkMinutes = (s: Pick<Shift, 'startTime' | 'endTime' | 'breakStart' | 'breakEnd'>): number => {
  const total = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
  const brk = s.breakStart && s.breakEnd ? timeToMinutes(s.breakEnd) - timeToMinutes(s.breakStart) : 0;
  return Math.max(0, total - brk);
};

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);

export interface DayInfo {
  date: string;
  /** Lý do tiệm nghỉ cả ngày (nghỉ lễ / đóng cửa cố định); null = mở cửa. */
  closedReason: string | null;
}

export interface ShiftBoardProps {
  days: DayInfo[];
  stylists: Stylist[];
  shifts: Shift[];
  timeOff: TimeOff[];
  /** Yêu cầu thợ tự đăng ký đang chờ duyệt — vẽ thành viên viền đứt để quản lý xếp ca theo lịch rảnh. */
  pendingRequests?: ShiftRequest[];
  today: string;
  canEdit: boolean;
  canManageOff: boolean;
  /** Ô có cảnh báo thiếu thợ (Mentor S2 · mục 9) — tô viền đỏ tiêu đề cột. */
  understaffedDates?: Set<string>;
  onAdd: (stylistId: string, date: string) => void;
  onRemoveShift: (shift: Shift) => void;
  onRemoveOff: (off: TimeOff) => void;
}

/**
 * Mentor Sprint 2 · mục 2 — Bảng ca làm theo tuần, gọn & dễ đọc:
 *  - mỗi thợ MỘT dòng (ảnh, tên, tổng giờ tuần), mỗi ngày MỘT cột, cột hôm nay được tô nổi;
 *  - ca hiển thị thành "viên" màu theo buổi (sáng / chiều / tối), nghỉ giữa ca là dòng phụ nhỏ;
 *  - ngày tiệm nghỉ được gạch chéo cả cột; nghỉ riêng của thợ là viên đỏ viền đứt;
 *  - nút xoá / thêm chỉ hiện khi rê chuột hoặc focus bàn phím (giảm nhiễu thị giác);
 *  - dòng cuối đếm số thợ trực mỗi ngày.
 */
export function ShiftBoard({
  days, stylists, shifts, timeOff, pendingRequests = [], today, canEdit, canManageOff, understaffedDates, onAdd, onRemoveShift, onRemoveOff,
}: ShiftBoardProps) {
  const byCell = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = `${s.stylistId}|${s.workDate}`;
    byCell.set(key, [...(byCell.get(key) ?? []), s]);
  }
  const offByCell = new Map<string, TimeOff[]>();
  for (const o of timeOff) {
    const key = `${o.stylistId}|${o.offDate}`;
    offByCell.set(key, [...(offByCell.get(key) ?? []), o]);
  }
  const reqByCell = new Map<string, ShiftRequest[]>();
  for (const r of pendingRequests) {
    const key = `${r.stylistId}|${r.workDate}`;
    reqByCell.set(key, [...(reqByCell.get(key) ?? []), r]);
  }
  const weekMinutes = (stylistId: string) =>
    shifts.filter((s) => s.stylistId === stylistId).reduce((sum, s) => sum + shiftWorkMinutes(s), 0);
  const staffCount = (date: string) => new Set(shifts.filter((s) => s.workDate === date).map((s) => s.stylistId)).size;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2 text-xs text-ink-soft">
        {(Object.keys(PERIOD_STYLE) as ShiftPeriod[]).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${PERIOD_STYLE[p].dot}`} /> {PERIOD_STYLE[p].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-rose-400 bg-rose-50" /> Thợ nghỉ</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-stripes" /> Tiệm nghỉ</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-teal-500 bg-white" /> Thợ đăng ký, chờ duyệt</span>
      </div>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[200px]" />
            {days.map((d) => <col key={d.date} />)}
          </colgroup>
          <thead>
            <tr className="bg-slate-50/80">
              <th scope="col" className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Thợ · giờ/tuần
              </th>
              {days.map((d) => {
                const isToday = d.date === today;
                const short = understaffedDates?.has(d.date);
                return (
                  <th key={d.date} scope="col"
                      className={`border-l border-slate-100 px-2 py-2 text-left align-top ${isToday ? 'bg-teal-50' : ''}`}>
                    <span className={`block text-xs font-semibold ${isToday ? 'text-teal-700' : 'text-ink'}`}>
                      {DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}
                    </span>
                    <span className="block text-[11px] font-normal text-ink-muted">
                      {d.date.slice(8)}/{d.date.slice(5, 7)}{isToday ? ' · Hôm nay' : ''}
                    </span>
                    {d.closedReason && (
                      <span className="mt-1 block truncate rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-600" title={d.closedReason}>
                        {d.closedReason}
                      </span>
                    )}
                    {short && !d.closedReason && (
                      <span className="mt-1 block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Thiếu thợ</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {stylists.map((st) => {
              const mins = weekMinutes(st.id);
              return (
                <tr key={st.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal">
                    <div className="flex items-center gap-2.5">
                      <StylistAvatar id={st.id} name={st.fullName} url={st.avatarUrl} gender={st.gender} size="h-8 w-8" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{st.fullName}</span>
                        <span className="block text-[11px] text-ink-muted">{mins ? formatDuration(mins) : 'Chưa có ca'}</span>
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
                    return (
                      <td key={d.date}
                          className={`group relative border-l border-slate-100 px-1.5 py-1.5 align-top
                            ${closed ? 'bg-stripes' : ''} ${d.date === today ? 'bg-teal-50/40' : ''}`}>
                        <div className="flex min-h-[40px] flex-col gap-1">
                          {offs.map((o) => (
                            <span key={o.id}
                                  className="flex items-center justify-between gap-1 rounded-md border border-dashed border-rose-300 bg-rose-50 px-1.5 py-1 text-[11px] text-rose-700">
                              <span className="truncate" title={o.reason ?? undefined}>
                                Nghỉ {o.startTime ? `${hhmm(o.startTime)}–${hhmm(o.endTime)}` : 'cả ngày'}
                              </span>
                              {canManageOff && (
                                <button type="button" onClick={() => onRemoveOff(o)} title="Huỷ khai báo nghỉ"
                                        aria-label={`Huỷ khai báo nghỉ ngày ${o.offDate} của ${st.fullName}`}
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-rose-600 opacity-0 hover:bg-rose-100 focus:opacity-100 group-hover:opacity-100">
                                  <X size={12} />
                                </button>
                              )}
                            </span>
                          ))}
                          {cellShifts.map((sh) => {
                            const style = PERIOD_STYLE[shiftPeriod(sh.startTime)];
                            return (
                              <span key={sh.id} title={sh.note ?? style.label}
                                    className={`flex items-start justify-between gap-1 rounded-md border-l-[3px] px-1.5 py-1 ${style.pill}`}>
                                <span className="min-w-0 leading-tight">
                                  <span className="block text-[12px] font-semibold tabular-nums">{hhmm(sh.startTime)}–{hhmm(sh.endTime)}</span>
                                  {sh.breakStart && (
                                    <span className="mt-0.5 flex items-center gap-0.5 text-[10px] opacity-75">
                                      <Coffee size={10} /> {hhmm(sh.breakStart)}–{hhmm(sh.breakEnd)}
                                    </span>
                                  )}
                                </span>
                                {canEdit && (
                                  <button type="button" onClick={() => onRemoveShift(sh)} title="Xoá ca"
                                          aria-label={`Xoá ca ${hhmm(sh.startTime)}–${hhmm(sh.endTime)} ngày ${sh.workDate} của ${st.fullName}`}
                                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-600 opacity-0 hover:bg-white/70 focus:opacity-100 group-hover:opacity-100">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                          {reqs.map((r) => (
                            <span key={r.id} title={r.note ?? 'Thợ tự đăng ký, chờ duyệt'}
                                  className="rounded-md border border-dashed border-teal-500 bg-white px-1.5 py-1 text-[11px] text-teal-800">
                              <span className="block font-semibold">{r.kind === 'shift' ? `${hhmm(r.startTime)}–${hhmm(r.endTime)}` : 'Xin nghỉ'}</span>
                              <span className="block text-[10px] opacity-75">Chờ duyệt</span>
                            </span>
                          ))}
                          {canEdit && !closed && (
                            <button type="button" onClick={() => onAdd(st.id, d.date)}
                                    aria-label={`Thêm ca cho ${st.fullName} ngày ${d.date}`}
                                    className={`flex items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 transition
                                      hover:border-teal-500 hover:text-teal-600 focus:opacity-100
                                      ${empty ? 'h-9 opacity-40 group-hover:opacity-100' : 'h-5 opacity-0 group-hover:opacity-100'}`}>
                              <Plus size={13} />
                            </button>
                          )}
                          {!canEdit && empty && !closed && <span className="pt-2 text-center text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/80 text-xs">
              <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-ink-soft">Số thợ trực</th>
              {days.map((d) => {
                const n = staffCount(d.date);
                return (
                  <td key={d.date} className="border-l border-slate-100 px-2 py-2">
                    {d.closedReason ? <span className="text-ink-muted">—</span> : (
                      <span className={`font-semibold ${n === 0 ? 'text-red-600' : n === 1 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {n} thợ
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
