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
  /** QA 11/10: luôn thu gọn thành MỘT dòng tóm tắt (mỗi ngày một chip %) để bảng ca vừa màn hình; bấm Chi tiết mới mở. */
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Danh sách khoảng trống + gợi ý xếp thợ: thu gọn mặc định để bảng ca vẫn nằm trong màn hình đầu. */
  const [showGaps, setShowGaps] = useState(false);
  if (!report) return null;

  const openDays = report.days.filter((d) => !d.closedReason);
  const gapCount = report.days.reduce((n, d) => n + d.gaps.length, 0);
  const ok = gapCount === 0;
  const maxLoad = Math.max(1, ...report.workload.map((w) => w.minutes));

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
             className={`rounded-xl border px-2.5 py-1.5 ${ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/40'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={`flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-800' : 'text-red-800'}`}
            title={ok ? undefined : `Tổng thời gian thiếu: ${formatDuration(report.totalGapMinutes)}`}>
          {ok ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
          {ok ? 'Đủ thợ mọi khung giờ' : `Thiếu thợ: ${gapCount} khung · ${report.understaffedDays}/${openDays.length} ngày`}
        </h3>
        {!open && (
          <ul className="flex flex-wrap gap-1" aria-label="Độ phủ từng ngày">
            {report.days.map((d) => (
              <li key={d.date} title={d.closedReason ?? `${d.openTime}–${d.closeTime} · ${d.staffCount} thợ`}
                  className={`rounded px-1.5 text-[11px] leading-5 tabular-nums ${d.closedReason ? 'bg-slate-100 text-slate-400'
                    : d.gaps.length ? 'bg-red-100 font-semibold text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()]} {d.closedReason ? 'nghỉ' : `${d.coveragePercent}%`}
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
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
          <div className="min-w-0 space-y-2">
            <div className="grid gap-x-4 gap-y-1.5 md:grid-cols-2">
              {report.days.map((d) => {
                const dow = DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                const o = d.openTime ? timeToMinutes(d.openTime) : 0;
                const c = d.closeTime ? timeToMinutes(d.closeTime) : 1;
                const pct = (m: number) => `${((m - o) / Math.max(1, c - o)) * 100}%`;
                return (
                  <div key={d.date} className="grid grid-cols-[96px_1fr_64px] items-center gap-2 text-xs">
                    <span className="whitespace-nowrap font-medium text-ink">{dow} {d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                    {d.closedReason ? (
                      <span className="col-span-2 truncate rounded bg-stripes px-2 py-0.5 text-slate-500">{d.closedReason}</span>
                    ) : (
                      <>
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-emerald-400/80"
                             title={`${d.openTime}–${d.closeTime} · phủ ${d.coveragePercent}% · ${d.gaps.map((g) => `${g.startTime}–${g.endTime}`).join(', ') || 'đủ thợ'}`}>
                          {d.gaps.map((g) => (
                            <span key={g.startTime} className={`absolute inset-y-0 ${g.minCount === 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                                  style={{ left: pct(timeToMinutes(g.startTime)), width: `calc(${pct(timeToMinutes(g.endTime))} - ${pct(timeToMinutes(g.startTime))})` }} />
                          ))}
                        </div>
                        <span className={`text-right tabular-nums ${d.gaps.length ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{d.coveragePercent}% · {d.staffCount}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {gapCount > 0 && (
              <button type="button" onClick={() => setShowGaps((v) => !v)} aria-expanded={showGaps}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 hover:underline">
                {showGaps ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showGaps ? 'Ẩn' : 'Xem'} {gapCount} khoảng trống & gợi ý xếp thợ
              </button>
            )}
            {showGaps && (
              <ul className="thin-scroll max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                {report.days.flatMap((d) => d.gaps.map((g) => {
                  const dow = DOW_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                  return (
                    <li key={`${d.date}-${g.startTime}`} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1">
                      <span className={`w-44 shrink-0 font-semibold ${g.minCount === 0 ? 'text-red-700' : 'text-amber-800'}`}>
                        {dow} {d.date.slice(8)}/{d.date.slice(5, 7)} · {g.startTime}–{g.endTime}
                      </span>
                      {g.hint && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">{g.hint}</span>}
                      {canEdit && g.candidates.slice(0, 2).map((cand) => {
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
                      {!g.candidates.length && !g.hint && <span className="text-ink-muted">Không còn thợ rảnh — cân nhắc tuyển thêm hoặc rút giờ mở cửa.</span>}
                    </li>
                  );
                }))}
              </ul>
            )}
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
