import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck, UserPlus } from 'lucide-react';
import { getErrorMessage, stylistsApi } from '@/api';
import type { CoverageReport } from '@/types';
import { formatDuration, timeToMinutes } from '@/utils/format';
import { DOW_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/**
 * Mentor Sprint 2 · mục 9 — "khung giờ nào cũng có thợ".
 *  - Thanh thời gian từng ngày: đoạn đỏ = giờ mở cửa chưa có thợ trực.
 *  - Mỗi khoảng trống kèm gợi ý thợ RẢNH ít giờ làm nhất tuần (cân bằng phân bổ); Chủ tiệm bấm là xếp ca ngay.
 *  - Biểu đồ khối lượng giờ làm của từng thợ để thấy ai đang gánh nhiều ca.
 */
export function CoveragePanel({ report, minStaff, onMinStaff, canEdit, onChanged }: {
  report: CoverageReport | null;
  minStaff: number;
  onMinStaff: (n: number) => void;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  /** null = tự động: tuần đủ thợ thì thu gọn (đỡ chiếm chỗ), thiếu thợ thì mở sẵn. */
  const [userOpen, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!report) return null;

  const openDays = report.days.filter((d) => !d.closedReason);
  const gapCount = report.days.reduce((n, d) => n + d.gaps.length, 0);
  const ok = gapCount === 0;
  const maxLoad = Math.max(1, ...report.workload.map((w) => w.minutes));
  const open = userOpen ?? !ok;

  const fill = async (date: string, startTime: string, endTime: string, stylistId: string, name: string) => {
    const key = `${date}|${startTime}|${stylistId}`;
    setBusy(key);
    try {
      await stylistsApi.createShifts(stylistId, [{ workDate: date, startTime, endTime }]);
      toast.success(`Đã xếp ${name} ${startTime}–${endTime}`);
      onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Độ phủ ca làm"
             className={`rounded-2xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/40'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${ok ? 'text-emerald-800' : 'text-red-800'}`}>
          {ok ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
          {ok
            ? 'Mọi khung giờ mở cửa trong tuần đều có thợ trực'
            : `${gapCount} khung giờ chưa đủ thợ trên ${report.understaffedDays}/${openDays.length} ngày mở cửa · tổng ${formatDuration(report.totalGapMinutes)}`}
        </h3>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <label className="flex items-center gap-1">
            Tối thiểu
            <select className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5" value={minStaff}
                    onChange={(e) => onMinStaff(Number(e.target.value))} aria-label="Số thợ tối thiểu mỗi thời điểm">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            thợ / thời điểm
          </label>
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-white/70"
                  aria-expanded={open}>
            {open ? <>Thu gọn <ChevronUp size={14} /></> : <>Chi tiết <ChevronDown size={14} /></>}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="space-y-1.5">
            {report.days.map((d) => {
              const dow = DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
              const o = d.openTime ? timeToMinutes(d.openTime) : 0;
              const c = d.closeTime ? timeToMinutes(d.closeTime) : 1;
              const pct = (m: number) => `${((m - o) / Math.max(1, c - o)) * 100}%`;
              return (
                <div key={d.date} className="grid grid-cols-[92px_1fr] items-start gap-2 text-xs">
                  <span className="pt-0.5 font-medium text-ink">{dow} {d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  {d.closedReason ? (
                    <span className="rounded bg-stripes px-2 py-0.5 text-slate-500">{d.closedReason}</span>
                  ) : (
                    <div>
                      <div className="relative h-3 overflow-hidden rounded-full bg-emerald-400/80" title={`${d.openTime}–${d.closeTime} · phủ ${d.coveragePercent}%`}>
                        {d.gaps.map((g) => (
                          <span key={g.startTime} className={`absolute inset-y-0 ${g.minCount === 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                                style={{ left: pct(timeToMinutes(g.startTime)), width: `calc(${pct(timeToMinutes(g.endTime))} - ${pct(timeToMinutes(g.startTime))})` }} />
                        ))}
                      </div>
                      <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted"><span>{d.openTime}</span><span>{d.coveragePercent}% · {d.staffCount} thợ</span><span>{d.closeTime}</span></div>
                      {d.gaps.map((g) => (
                        <div key={g.startTime} className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`font-semibold ${g.minCount === 0 ? 'text-red-700' : 'text-amber-800'}`}>
                            {g.startTime}–{g.endTime} {g.minCount === 0 ? 'không có thợ' : `chỉ ${g.minCount} thợ`}
                          </span>
                          {canEdit && g.candidates.map((cand) => {
                            const key = `${d.date}|${g.startTime}|${cand.stylistId}`;
                            return (
                              <button key={cand.stylistId} type="button" disabled={!!busy}
                                      onClick={() => fill(d.date, g.startTime, g.endTime, cand.stylistId, cand.fullName)}
                                      className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-white px-2 py-0.5 text-[11px] text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                                      title={`Đang có ${formatDuration(cand.weekMinutes)} trong khoảng xem`}>
                                <UserPlus size={11} /> {busy === key ? 'Đang xếp…' : `Xếp ${cand.fullName}`}
                                <span className="text-ink-muted">({Math.round(cand.weekMinutes / 60)}h)</span>
                              </button>
                            );
                          })}
                          {!g.candidates.length && <span className="text-ink-muted">Không còn thợ rảnh — cân nhắc tuyển thêm hoặc rút giờ mở cửa.</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="mb-1.5 text-xs font-semibold text-ink">Phân bổ giờ làm trong tuần</p>
            <ul className="space-y-1">
              {report.workload.map((w) => (
                <li key={w.stylistId} className="grid grid-cols-[1fr_48px] items-center gap-2 text-[11px]">
                  <div>
                    <span className="block truncate text-ink-soft">{w.fullName}</span>
                    <span className="block h-1.5 rounded-full bg-slate-100">
                      <span className="block h-1.5 rounded-full bg-teal-500" style={{ width: `${(w.minutes / maxLoad) * 100}%` }} />
                    </span>
                  </div>
                  <span className="text-right tabular-nums text-ink-muted">{Math.round(w.minutes / 6) / 10}h</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
