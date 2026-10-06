import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Wand2 } from 'lucide-react';
import { appointmentsApi } from '@/api';
import type { SmartSlot, SmartSlotsResult } from '@/types';
import { formatDuration } from '@/utils/format';
import { DOW_LABELS } from '@/utils/constants';

const dayLabel = (date: string, today: string): string => {
  if (date === today) return 'Hôm nay';
  const d = new Date(`${date}T12:00:00Z`);
  return `${DOW_LABELS[d.getUTCDay()]} ${date.slice(8)}/${date.slice(5, 7)}`;
};

/**
 * Mentor Sprint 2 · mục 4 — "Trợ lý AI xếp lịch" nhúng ngay trong màn hình tạo lịch của nhân viên:
 * phân tích mọi khung giờ còn trống của các thợ trong vài ngày tới, xếp hạng theo sớm · vừa khít · cân bằng thợ
 * và giải thích lý do; bấm một gợi ý là điền sẵn ngày, giờ, thợ. Không cần thoát ra lịch ngày / bảng ca để dò.
 */
export function SmartSlotAssistant({ serviceIds, date, today, selected, onPick }: {
  serviceIds: string[];
  date: string;
  today: string;
  selected?: { date: string; time: string; stylistId: string };
  onPick: (slot: SmartSlot) => void;
}) {
  const [days, setDays] = useState(3);
  const [data, setData] = useState<SmartSlotsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showWindows, setShowWindows] = useState(false);
  const key = serviceIds.join(',');

  useEffect(() => {
    if (!key) { setData(null); return undefined; }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      appointmentsApi.smartSlots({ date, serviceIds: key.split(','), days, limit: 6 })
        .then((res) => { if (alive) { setData(res); setFailed(false); } })
        .catch(() => { if (alive) { setData(null); setFailed(true); } })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [key, date, days]);

  if (!key || failed) return null;

  return (
    <section aria-label="Trợ lý AI xếp lịch" className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-violet-800">
          <Sparkles size={15} /> Trợ lý AI xếp lịch
          {data && <span className="font-normal text-violet-600">· gói {formatDuration(data.totalDurationMinutes)}</span>}
        </h4>
        <div className="flex rounded-lg border border-violet-200 bg-white p-0.5 text-xs" role="tablist" aria-label="Phạm vi phân tích">
          {[1, 3, 7].map((n) => (
            <button key={n} type="button" role="tab" aria-selected={days === n} onClick={() => setDays(n)}
                    className={`rounded-md px-2 py-0.5 ${days === n ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-50'}`}>
              {n === 1 ? 'Ngày này' : `${n} ngày`}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <p className="py-3 text-center text-xs text-violet-700">Đang phân tích lịch của các thợ…</p>
      ) : !data?.suggestions.length ? (
        <p className="py-2 text-xs text-ink-muted">Không còn khung giờ phù hợp trong {days} ngày — thử mở rộng phạm vi hoặc bớt dịch vụ.</p>
      ) : (
        <ul className={`grid gap-1.5 sm:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
          {data.suggestions.map((s, i) => {
            const active = selected && selected.date === s.date && selected.time === s.time && selected.stylistId === s.stylistId;
            return (
              <li key={`${s.date}-${s.time}-${s.stylistId}`}>
                <button type="button" onClick={() => onPick(s)} aria-pressed={!!active}
                        className={`w-full rounded-xl border px-2.5 py-2 text-left transition
                          ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-white hover:border-violet-400'}`}>
                  <span className="flex items-start justify-between gap-2 text-sm font-semibold">
                    <span>{i === 0 && <Wand2 size={13} className="mr-1 inline" />}{dayLabel(s.date, today)} · {s.time}–{s.endTime}</span>
                    <span title="Điểm phù hợp do trợ lý chấm"
                          className={`shrink-0 whitespace-nowrap text-[11px] font-medium ${active ? 'text-violet-100' : 'text-violet-600'}`}>
                      {Math.round(s.score)} điểm
                    </span>
                  </span>
                  <span className={`block truncate text-xs ${active ? 'text-violet-50' : 'text-ink-soft'}`}>Thợ {s.stylistName}</span>
                  <span className={`mt-0.5 block text-[11px] leading-snug ${active ? 'text-violet-100' : 'text-ink-muted'}`}>
                    {s.reasons.slice(0, 2).join(' · ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.windows.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowWindows((v) => !v)} aria-expanded={showWindows}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline">
            {showWindows ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Khoảng rảnh của từng thợ
          </button>
          {showWindows && (
            <div className="thin-scroll mt-1.5 max-h-48 space-y-2 overflow-y-auto pr-1 text-xs">
              {data.windows.map((w) => (
                <div key={w.date}>
                  <p className="font-semibold text-ink">{dayLabel(w.date, today)}{w.closedReason ? ` — ${w.closedReason}` : ''}</p>
                  {!w.closedReason && w.stylists.map((st) => (
                    <p key={st.stylistId} className="flex flex-wrap items-center gap-1 text-ink-soft">
                      <span className="w-28 truncate">{st.stylistName}</span>
                      {st.free.length ? st.free.map((f) => (
                        <span key={f.start} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{f.start}–{f.end}</span>
                      )) : <span className="text-ink-muted">kín lịch</span>}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
