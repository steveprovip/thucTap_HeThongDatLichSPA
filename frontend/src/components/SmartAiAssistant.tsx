import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Bot, CalendarHeart, Clock3, Loader2, Send, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { assistantApi, getErrorMessage, stylistsApi, workingHoursApi } from '@/api';
import type { AssistantChatReply, AssistantInsights, AssistantShiftGap, HolidaySuggestion } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'chat' | 'shifts' | 'holidays' | 'golden';
interface ChatLine { from: 'me' | 'bot'; text: string; meta?: string }

const QUICK = [
  'Giờ vàng tuần này là khi nào?',
  'Khách gọi đặt cắt tóc, nên gợi ý combo gì?',
  '7 ngày tới thiếu thợ ca nào?',
  'Còn ngày lễ nào chưa thêm vào lịch nghỉ?',
];

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Part 5 — Trợ lý AI nổi góc phải dưới cho Chủ tiệm & Lễ tân:
 *  - Hỏi nhanh: hỏi bằng tiếng Việt; máy chủ trả lời bằng mô hình nhỏ (Qwen 2.5 qua Ollama / API tương thích OpenAI)
 *    hoặc bằng luật dựa trên số liệu khi chưa cấu hình mô hình — nhãn dưới câu trả lời cho biết nguồn.
 *  - Ca thiếu thợ: TỰ kiểm tra 7 ngày tới khi mở trang quản lý; có khoảng trống thì nút trợ lý hiện số đỏ.
 *    Chủ tiệm bấm "Xếp …" là tạo ca ngay cho thợ rảnh, ít giờ nhất tuần.
 *  - Ngày lễ: sinh toàn bộ ngày lễ Việt Nam của năm (dương + âm lịch), thêm tất cả bằng một chạm (chỉ ngày "sẵn sàng").
 *  - Giờ vàng & combo: lễ tân xem nhanh khi đang nghe điện thoại để tư vấn khung giờ / gói dịch vụ.
 */
export function SmartAiAssistant() {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'owner';
  const allowed = user?.role === 'owner' || user?.role === 'receptionist';

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [gaps, setGaps] = useState<AssistantShiftGap[] | null>(null);
  const [insights, setInsights] = useState<AssistantInsights | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<HolidaySuggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const loadGaps = useCallback(async () => {
    try { setGaps((await assistantApi.shiftSuggestions({ days: 7 })).gaps); } catch { setGaps([]); }
  }, []);

  // Tự gợi ý khi thiếu nhân sự: kiểm tra một lần khi vào trang quản lý (nhẹ, ~1 truy vấn tổng hợp)
  useEffect(() => { if (allowed) void loadGaps(); }, [allowed, loadGaps]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (tab === 'golden' && !insights) {
      assistantApi.insights().then(setInsights).catch((e: unknown) => setError(getErrorMessage(e)));
    }
    if (tab === 'holidays') {
      setHolidays(null);
      workingHoursApi.holidaySuggestions(year).then(setHolidays).catch((e: unknown) => setError(getErrorMessage(e)));
    }
  }, [open, tab, year, insights]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines, asking]);

  if (!allowed) return null;

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || asking) return;
    setLines((l) => [...l, { from: 'me', text: q }]);
    setDraft('');
    setAsking(true);
    try {
      const r: AssistantChatReply = await assistantApi.chat(q);
      setLines((l) => [...l, { from: 'bot', text: r.answer, meta: r.source === 'llm' ? `AI · ${r.model}` : 'Theo số liệu của tiệm' }]);
    } catch (e) {
      setLines((l) => [...l, { from: 'bot', text: getErrorMessage(e), meta: 'Lỗi' }]);
    } finally {
      setAsking(false);
    }
  };

  const fillGap = async (g: AssistantShiftGap, stylistId: string, name: string) => {
    const key = `${g.date}|${g.startTime}|${stylistId}`;
    setBusy(key);
    try {
      await stylistsApi.createShifts(stylistId, [{ workDate: g.date, startTime: g.startTime, endTime: g.endTime }]);
      toast.success(`Đã xếp ${name} ${fmtDay(g.date)} ${g.startTime}–${g.endTime}`);
      await loadGaps();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = holidays?.filter((h) => h.status === 'ready') ?? [];
  const addAllHolidays = async () => {
    setBusy('holidays');
    try {
      const r = await workingHoursApi.generateHolidays({ year, keys: ready.map((h) => h.key) });
      toast.success(`Đã thêm ${r.created.length} ngày lễ vào lịch nghỉ${r.skipped.length ? `, bỏ qua ${r.skipped.length}` : ''}`);
      setHolidays(await workingHoursApi.holidaySuggestions(year));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(draft); };
  const gapCount = gaps?.length ?? 0;
  const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'chat', label: 'Hỏi nhanh', icon: <Bot size={14} /> },
    { id: 'shifts', label: `Ca thiếu${gapCount ? ` (${gapCount})` : ''}`, icon: <Users size={14} /> },
    { id: 'holidays', label: 'Ngày lễ', icon: <CalendarHeart size={14} /> },
    { id: 'golden', label: 'Giờ vàng', icon: <Clock3 size={14} /> },
  ];

  return (
    <div className="no-print">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Mở trợ lý AI"
              className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-110">
        {open ? <X size={18} /> : <Sparkles size={18} />}
        <span className="hidden sm:inline">Trợ lý AI</span>
        {!open && gapCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px]"
                title={`${gapCount} khung giờ thiếu thợ 7 ngày tới`}>{gapCount}</span>
        )}
      </button>

      {open && (
        <section role="dialog" aria-label="Trợ lý AI"
                 className="fixed bottom-20 right-4 z-40 flex h-[min(560px,72vh)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center gap-2 border-b border-slate-100 bg-teal-50/60 px-3 py-2">
            <Sparkles size={16} className="text-teal-700" />
            <p className="text-sm font-semibold text-ink">Trợ lý vận hành</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý"
                    className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white"><X size={15} /></button>
          </header>
          <nav className="flex gap-1 border-b border-slate-100 px-2 py-1.5" aria-label="Chức năng trợ lý">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${tab === t.id ? 'bg-teal-600 text-white' : 'text-ink-soft hover:bg-slate-100'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm thin-scroll" ref={tab === 'chat' ? logRef : undefined}>
            {error && <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{error}</p>}

            {tab === 'chat' && (
              <div className="space-y-2">
                {!lines.length && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-ink-muted">Hỏi về giờ vàng, combo dịch vụ, ca thiếu thợ, ngày lễ… Chọn nhanh:</p>
                    {QUICK.map((q) => (
                      <button key={q} type="button" onClick={() => void ask(q)}
                              className="block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs hover:border-teal-400 hover:bg-teal-50">{q}</button>
                    ))}
                  </div>
                )}
                {lines.map((l, i) => (
                  <div key={i} className={l.from === 'me' ? 'flex justify-end' : ''}>
                    <div className={`max-w-[88%] whitespace-pre-line rounded-xl px-2.5 py-1.5 text-[13px] ${l.from === 'me' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-ink'}`}>
                      {l.text}
                      {l.meta && <span className="mt-1 block text-[10px] opacity-60">{l.meta}</span>}
                    </div>
                  </div>
                ))}
                {asking && <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 size={13} className="animate-spin" /> Đang phân tích số liệu…</p>}
              </div>
            )}

            {tab === 'shifts' && (
              gaps === null ? <p className="text-xs text-ink-muted">Đang kiểm tra…</p>
                : !gaps.length ? <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">7 ngày tới mọi khung giờ mở cửa đều có thợ trực.</p>
                  : (
                    <ul className="space-y-1.5">
                      {gaps.map((g) => (
                        <li key={`${g.date}-${g.startTime}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
                          <p className={`text-xs font-semibold ${g.minCount === 0 ? 'text-red-700' : 'text-amber-800'}`}>
                            {g.dayText} · {g.startTime}–{g.endTime} · {g.minCount === 0 ? 'không có thợ' : `chỉ ${g.minCount} thợ`}
                          </p>
                          {g.hint && <p className="text-[11px] text-amber-800">{g.hint}</p>}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {g.candidates.slice(0, 2).map((c) => {
                              const key = `${g.date}|${g.startTime}|${c.stylistId}`;
                              return isOwner ? (
                                <button key={c.stylistId} type="button" disabled={!!busy} onClick={() => void fillGap(g, c.stylistId, c.fullName)}
                                        className="inline-flex items-center gap-1 rounded-full border border-teal-300 px-2 py-0.5 text-[11px] text-teal-800 hover:bg-teal-50 disabled:opacity-50">
                                  <UserPlus size={11} /> {busy === key ? 'Đang xếp…' : `Xếp ${c.fullName}`} <span className="text-ink-muted">({Math.round(c.weekMinutes / 60)}h)</span>
                                </button>
                              ) : (
                                <span key={c.stylistId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px]">Gợi ý: {c.fullName}</span>
                              );
                            })}
                            {!g.candidates.length && !g.hint && <span className="text-[11px] text-ink-muted">Không còn thợ rảnh.</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
            )}

            {tab === 'holidays' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select aria-label="Năm" value={year} onChange={(e) => setYear(Number(e.target.value))}
                          className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs">
                    {[0, 1].map((d) => { const y = new Date().getFullYear() + d; return <option key={y} value={y}>{y}</option>; })}
                  </select>
                  {isOwner && ready.length > 0 && (
                    <button type="button" disabled={busy === 'holidays'} onClick={() => void addAllHolidays()}
                            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
                      {busy === 'holidays' ? <Loader2 size={12} className="animate-spin" /> : <CalendarHeart size={12} />}
                      Thêm {ready.length} ngày lễ
                    </button>
                  )}
                </div>
                {holidays === null ? <p className="text-xs text-ink-muted">Đang sinh ngày lễ…</p> : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {holidays.map((h) => (
                      <li key={h.key} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{h.name}</span>
                          <span className="text-ink-muted">{fmtDay(h.startDate)}{h.days > 1 ? `–${fmtDay(h.endDate)}` : ''} · {h.calendar === 'lunar' ? 'âm lịch' : 'dương lịch'}</span>
                        </span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          h.status === 'ready' ? 'bg-teal-50 text-teal-800' : h.status === 'conflict' ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-500'}`}
                              title={h.status === 'conflict' ? `${h.affectedAppointments} lịch hẹn bị ảnh hưởng: ${h.affectedCodes.join(', ')}` : h.existingReason ?? undefined}>
                          {h.status === 'ready' ? 'Sẵn sàng' : h.status === 'exists' ? 'Đã có' : h.status === 'conflict' ? `${h.affectedAppointments} lịch hẹn` : 'Đã qua'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {!isOwner && <p className="text-[11px] text-ink-muted">Chỉ Chủ tiệm được thêm ngày nghỉ lễ.</p>}
              </div>
            )}

            {tab === 'golden' && (
              !insights ? <p className="text-xs text-ink-muted">Đang tính giờ vàng…</p> : (
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="mb-1 font-semibold text-ink">Giờ vàng ({insights.windowDays} ngày qua) — ưu tiên khách chỉ rảnh khung này</p>
                    {insights.goldenHours.length ? (
                      <ol className="space-y-0.5">
                        {insights.goldenHours.map((g, i) => (
                          <li key={g.label} className="flex justify-between rounded bg-amber-50 px-2 py-0.5"><span>{i + 1}. {g.label}</span><span className="tabular-nums text-ink-muted">{g.bookings} lượt</span></li>
                        ))}
                      </ol>
                    ) : <p className="text-ink-muted">Chưa đủ dữ liệu.</p>}
                  </div>
                  {insights.quietHours.length > 0 && (
                    <div>
                      <p className="mb-1 font-semibold text-ink">Giờ vắng — mời khách linh hoạt</p>
                      <p className="flex flex-wrap gap-1">{insights.quietHours.map((g) => <span key={g.label} className="rounded bg-sky-50 px-1.5 py-0.5">{g.label}</span>)}</p>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-semibold text-ink">Combo khách hay đặt cùng</p>
                    {insights.combos.length ? (
                      <ul className="space-y-0.5">
                        {insights.combos.map((c) => (
                          <li key={c.names.join('+')} className="rounded bg-teal-50 px-2 py-0.5">
                            {c.names.join(' + ')} <span className="text-ink-muted">· {c.totalDuration}′ · {c.priceText} · {c.count} lượt</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ink-muted">
                        Chưa đủ dữ liệu combo.{insights.topServices.length ? ` Dịch vụ đặt nhiều: ${insights.topServices.slice(0, 3).map((s) => s.name).join(', ')}.` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {tab === 'chat' && (
            <form onSubmit={onSubmit} className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Hỏi trợ lý…"
                     aria-label="Câu hỏi cho trợ lý" className="field-input min-h-[36px] flex-1 py-1 text-sm" />
              <button type="submit" disabled={asking || !draft.trim()} aria-label="Gửi"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white disabled:opacity-40"><Send size={15} /></button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
