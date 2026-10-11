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
 * Bảng ca làm theo tuần — bản GỌN (phản hồi QA 11/10: cả tuần × toàn bộ thợ vừa một màn hình, ít khoảng trắng):
 *  - mỗi thợ MỘT dòng thấp (ảnh 24px, tên + tổng giờ tuần cùng một khối), mỗi ngày MỘT cột, cột hôm nay tô nổi;
 *  - ca là "viên" một dòng `08:00–17:00` màu theo buổi; nghỉ giữa ca chỉ là biểu tượng ☕ (rê chuột xem giờ);
 *  - ngày tiệm nghỉ gạch chéo cả cột; nghỉ riêng của thợ là viên đỏ viền đứt; yêu cầu chờ duyệt viền đứt xanh;
 *  - nút xoá / thêm chỉ hiện khi rê chuột hoặc focus bàn phím; chú thích màu gộp vào dòng tổng cuối bảng.
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="thin-scroll max-h-[calc(100vh-210px)] overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[150px]" />
            {days.map((d) => <col key={d.date} />)}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50">
              <th scope="col" className="sticky left-0 z-30 bg-slate-50 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Thợ · giờ/tuần
              </th>
              {days.map((d) => {
                const isToday = d.date === today;
                const short = understaffedDates?.has(d.date) && !d.closedReason;
                return (
                  <th key={d.date} scope="col" title={d.closedReason ?? (short ? 'Có khung giờ thiếu thợ' : undefined)}
                      className={`border-l border-slate-100 px-1.5 py-1 text-left ${isToday ? 'bg-teal-50' : 'bg-slate-50'}`}>
                    <span className={`flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${isToday ? 'text-teal-700' : 'text-ink'}`}>
                      {DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}
                      <span className="font-normal text-ink-muted">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                      {short && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Thiếu thợ" />}
                    </span>
                    {d.closedReason && (
                      <span className="block truncate text-[10px] font-medium text-slate-500">{d.closedReason}</span>
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
                  <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-0.5 text-left font-normal">
                    <div className="flex items-center gap-1.5">
                      <StylistAvatar id={st.id} name={st.fullName} url={st.avatarUrl} gender={st.gender} size="h-6 w-6" />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-semibold text-ink" title={st.fullName}>{st.fullName}</span>
                        <span className="block text-[10px] text-ink-muted">{mins ? formatDuration(mins) : 'Chưa có ca'}</span>
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
                          className={`group relative border-l border-slate-100 px-1 py-0.5 align-middle
                            ${closed ? 'bg-stripes' : ''} ${d.date === today ? 'bg-teal-50/40' : ''}`}>
                        <div className="flex min-h-[26px] flex-col justify-center gap-0.5">
                          {offs.map((o) => (
                            <span key={o.id} title={o.reason ?? undefined}
                                  className="flex items-center justify-between gap-0.5 rounded border border-dashed border-rose-300 bg-rose-50 px-1 text-[11px] leading-5 text-rose-700">
                              <span className="truncate">Nghỉ {o.startTime ? `${hhmm(o.startTime)}–${hhmm(o.endTime)}` : 'cả ngày'}</span>
                              {canManageOff && (
                                <button type="button" onClick={() => onRemoveOff(o)} title="Huỷ khai báo nghỉ"
                                        aria-label={`Huỷ khai báo nghỉ ngày ${o.offDate} của ${st.fullName}`}
                                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-rose-600 opacity-0 hover:bg-rose-100 focus:opacity-100 group-hover:opacity-100">
                                  <X size={11} />
                                </button>
                              )}
                            </span>
                          ))}
                          {cellShifts.map((sh) => {
                            const style = PERIOD_STYLE[shiftPeriod(sh.startTime)];
                            const brk = sh.breakStart ? `Nghỉ giữa ca ${hhmm(sh.breakStart)}–${hhmm(sh.breakEnd)}` : '';
                            return (
                              <span key={sh.id} title={[style.label, brk, sh.note].filter(Boolean).join(' · ')}
                                    className={`flex items-center justify-between gap-0.5 rounded border-l-[3px] px-1 leading-5 ${style.pill}`}>
                                <span className="flex min-w-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums">
                                  {hhmm(sh.startTime)}–{hhmm(sh.endTime)}
                                  {brk && <Coffee size={10} className="shrink-0 opacity-60" aria-label={brk} />}
                                </span>
                                {canEdit && (
                                  <button type="button" onClick={() => onRemoveShift(sh)} title="Xoá ca"
                                          aria-label={`Xoá ca ${hhmm(sh.startTime)}–${hhmm(sh.endTime)} ngày ${sh.workDate} của ${st.fullName}`}
                                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-red-600 opacity-0 hover:bg-white/70 focus:opacity-100 group-hover:opacity-100">
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                          {reqs.map((r) => (
                            <span key={r.id} title={`${r.note ?? 'Thợ tự đăng ký'} · chờ duyệt`}
                                  className="truncate rounded border border-dashed border-teal-500 bg-white px-1 text-[11px] leading-5 text-teal-800">
                              {r.kind === 'shift' ? `${hhmm(r.startTime)}–${hhmm(r.endTime)}` : 'Xin nghỉ'} ?
                            </span>
                          ))}
                          {canEdit && !closed && (
                            <button type="button" onClick={() => onAdd(st.id, d.date)}
                                    aria-label={`Thêm ca cho ${st.fullName} ngày ${d.date}`}
                                    className={`flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 transition
                                      hover:border-teal-500 hover:text-teal-600 focus:opacity-100
                                      ${empty ? 'h-6 opacity-30 group-hover:opacity-100' : 'absolute right-0.5 top-0.5 h-4 w-4 border-0 opacity-0 group-hover:opacity-100'}`}>
                              <Plus size={12} />
                            </button>
                          )}
                          {!canEdit && empty && !closed && <span className="text-center text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="border-t border-slate-200 bg-slate-50 text-xs">
              <th scope="row" className="sticky left-0 z-30 bg-slate-50 px-2 py-1 text-left font-semibold text-ink-soft">Số thợ trực</th>
              {days.map((d) => {
                const n = staffCount(d.date);
                return (
                  <td key={d.date} className="border-l border-slate-100 px-1.5 py-1">
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 px-2 py-1 text-[11px] text-ink-soft">
        {(Object.keys(PERIOD_STYLE) as ShiftPeriod[]).map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${PERIOD_STYLE[p].dot}`} /> {PERIOD_STYLE[p].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><Coffee size={10} /> Có nghỉ giữa ca</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-dashed border-rose-400 bg-rose-50" /> Thợ nghỉ</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-stripes" /> Tiệm nghỉ</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-dashed border-teal-500 bg-white" /> Chờ duyệt</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Thiếu thợ</span>
      </div>
    </div>
  );
}
