import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, CalendarHeart, ClipboardList, Clock3, Gauge, Loader2, MessageCircle, RotateCcw, Send, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { assistantApi, getErrorMessage, stylistsApi, workingHoursApi } from '@/api';
import type {
  AppointmentStatus, AssistantChatReply, AssistantInsights, AssistantShiftGap, AssistantStatus, AssistantToday, HolidaySuggestion,
} from '@/types';
import { STATUS_LABELS } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** TASK v4 · NV1: hai chế độ rõ ràng — trò chuyện tự nhiên, hoặc xem bảng phân tích (giờ vàng, số liệu, ca, ngày lễ). */
type Mode = 'chat' | 'insights';
type Panel = 'today' | 'golden' | 'shifts' | 'holidays';
type Tab = 'chat' | Panel;
interface ChatLine { from: 'me' | 'bot'; text: string; meta?: string }

const QUICK = [
  'Tình hình hôm nay thế nào?',
  'Bạn là ai?',
  'Hướng dẫn tôi dùng trợ lý',
  'Giờ vàng tuần này là khi nào?',
  '7 ngày tới thiếu thợ ca nào?',
];

const firstName = (full?: string | null) => (full ?? '').trim().split(/\s+/).pop() ?? '';

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
  const [mode, setMode] = useState<Mode>('chat');
  const [panel, setPanel] = useState<Panel>('today');
  const tab: Tab = mode === 'chat' ? 'chat' : panel;
  /** TASK v4 · NV5: đang trả lời bằng AI local (Spark-X2.5-4B) hay Smart Rule Assistant. */
  const [aiStatus, setAiStatus] = useState<AssistantStatus | null>(null);
  const [today, setToday] = useState<AssistantToday | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  /** TASK v3: câu hỏi gợi ý tiếp theo do máy chủ trả về sau mỗi câu trả lời. */
  const [followUps, setFollowUps] = useState<string[]>([]);
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

  // Mỗi lần mở trợ lý: hỏi máy chủ đang dùng AI local hay luật (bật / tắt model là chip trạng thái đổi theo)
  useEffect(() => {
    if (!open) return;
    assistantApi.status().then(setAiStatus).catch(() => setAiStatus(null));
  }, [open]);

  // Zero-touch: máy chủ tự bật AI local — giao diện chỉ theo dõi trạng thái (10 giây khi đang nạp model, 30 giây khi đã ổn)
  const starting = !!aiStatus?.localStarting && aiStatus.mode !== 'llm';
  const lost = !!aiStatus?.localLost && aiStatus.mode !== 'llm';
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => { assistantApi.status().then(setAiStatus).catch(() => undefined); }, starting ? 10_000 : 30_000);
    return () => window.clearInterval(id);
  }, [open, starting]);

  const startLocalAi = async () => {
    setBusy('ai-local');
    try {
      const r = await assistantApi.startLocal();
      if (r.started || r.starting) toast.toast(r.message, 'info'); else toast.warning(r.message);
      setAiStatus(await assistantApi.status());
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (tab === 'today') {
      assistantApi.today().then(setToday).catch((e: unknown) => setError(getErrorMessage(e)));
    }
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
    const past = lines.map((l) => ({ role: l.from === 'me' ? 'user' as const : 'assistant' as const, content: l.text.slice(0, 1500) }));
    setLines((l) => [...l, { from: 'me', text: q }]);
    setDraft('');
    setAsking(true);
    try {
      const r: AssistantChatReply = await assistantApi.chat(q, past);
      setLines((l) => [...l, { from: 'bot', text: r.answer, meta: r.source === 'llm' ? `AI local · ${r.model}` : 'Trợ lý thông minh' }]);
      if (r.quickReplies?.length) setFollowUps(r.quickReplies);
      // AI local vừa bật / tắt giữa chừng → cập nhật chip trạng thái cho khớp nguồn câu trả lời
      if ((r.source === 'llm') !== (aiStatus?.mode === 'llm')) assistantApi.status().then(setAiStatus).catch(() => undefined);
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
  const PANELS: { id: Panel; label: string; icon: JSX.Element }[] = [
    { id: 'today', label: 'Hôm nay', icon: <Gauge size={13} /> },
    { id: 'golden', label: 'Giờ vàng & combo', icon: <Clock3 size={13} /> },
    { id: 'shifts', label: `Ca thiếu${gapCount ? ` (${gapCount})` : ''}`, icon: <Users size={13} /> },
    { id: 'holidays', label: 'Ngày lễ', icon: <CalendarHeart size={13} /> },
  ];
  const usingLlm = aiStatus?.mode === 'llm';
  const chip = usingLlm
    ? { dot: 'bg-emerald-500', text: `Đang chạy · ${aiStatus?.model ?? 'AI local'}`, title: 'Câu hỏi đang được trả lời bởi mô hình AI chạy ngay trên máy này' }
    : starting
      ? { dot: 'bg-amber-400 animate-pulse', text: 'Đang kết nối AI local…', title: 'Máy chủ tự bật AI local, model đang nạp lên card đồ hoạ — trong lúc chờ, trợ lý vẫn trả lời theo số liệu thật' }
      : lost
        ? { dot: 'bg-red-500', text: 'Mất kết nối AI local', title: 'AI local không phản hồi — trợ lý tạm trả lời theo số liệu thật. Bấm "Khởi động lại AI" để bật lại.' }
        : { dot: 'bg-slate-400', text: 'Trợ lý thông minh', title: 'Trợ lý trả lời theo luật dựa trên số liệu thật của tiệm' };

  return (
    <div className="no-print">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Mở trợ lý AI"
              className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 [html[data-theme=noir]_&]:to-teal-800 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-110">
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
          <header className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm"><Sparkles size={16} /></span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-ink">Trợ lý vận hành</p>
              <p className="flex items-center gap-1 text-[11px] text-ink-muted" title={chip.title}>
                <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} aria-hidden /> <span className="truncate">{chip.text}</span>
              </p>
            </div>
            {lost && (
              <button type="button" onClick={() => void startLocalAi()} disabled={busy === 'ai-local'}
                      title="Bật lại máy chủ AI local (Spark-X2.5-4B) trên máy này — không cần mở cửa sổ dòng lệnh"
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                {busy === 'ai-local' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Khởi động lại AI
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý"
                    className={`${lost ? '' : 'ml-auto '}inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white`}><X size={15} /></button>
          </header>
          <div className="border-b border-slate-100 px-2.5 py-2">
            <div role="tablist" aria-label="Chế độ trợ lý" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([['chat', 'Tư vấn đàm thoại', <MessageCircle key="c" size={14} />], ['insights', 'Phân tích & số liệu', <BarChart3 key="i" size={14} />]] as const)
                .map(([id, label, icon]) => (
                  <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition
                            ${mode === id ? 'bg-white text-teal-800 shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
                    {icon}{label}
                  </button>
                ))}
            </div>
            {mode === 'insights' && (
              <nav className="mt-2 flex gap-1 overflow-x-auto thin-scroll" aria-label="Bảng phân tích">
                {PANELS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPanel(p.id)} aria-pressed={panel === p.id}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition
                            ${panel === p.id ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 text-ink-soft hover:border-teal-300'}`}>
                    {p.icon}{p.label}
                  </button>
                ))}
              </nav>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm thin-scroll" ref={tab === 'chat' ? logRef : undefined}>
            {error && <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{error}</p>}

            {tab === 'chat' && (
              <div className="space-y-2">
                {!lines.length && (
                  <div className="space-y-1.5">
                    <div className="max-w-[92%] rounded-xl rounded-bl-md bg-slate-100 px-2.5 py-2 text-[13px] text-ink">
                      Chào {firstName(user?.fullName) || 'bạn'}! Mình là trợ lý vận hành của tiệm 👋 Bạn cứ hỏi tự nhiên như nói chuyện với
                      đồng nghiệp — chào hỏi, nhờ hướng dẫn, hay hỏi tình hình hôm nay, giờ vàng, ca thiếu thợ đều được.
                      <span className="mt-1 block text-[10px] opacity-60">{chip.text}</span>
                    </div>
                    <p className="pt-1 text-xs text-ink-muted">Gợi ý nhanh:</p>
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
                {!asking && lines.length > 0 && followUps.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {followUps.map((q) => (
                      <button key={q} type="button" onClick={() => void ask(q)}
                              className="rounded-full border border-teal-200 px-2 py-0.5 text-[11px] text-teal-800 hover:bg-teal-50">{q}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'today' && (
              !today ? <p className="text-xs text-ink-muted">Đang tải số liệu hôm nay…</p> : (
                <div className="space-y-3 text-xs">
                  <p className="font-semibold text-ink">Hôm nay · {today.dayText}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[['Lịch hẹn', String(today.total)], ['Đã thu', today.revenueText], ['Chờ xác nhận', String(today.pendingTotal)]].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/70 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-ink-muted">{k}</p>
                        <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-ink" title={v}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(today.byStatus).filter(([, n]) => n > 0).map(([s, n]) => (
                      <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5">{STATUS_LABELS[s as AppointmentStatus] ?? s}: <strong>{n}</strong></span>
                    ))}
                    {!today.total && <span className="text-ink-muted">Chưa có lịch hẹn nào hôm nay.</span>}
                  </div>
                  {today.pendingTotal > 0 && (
                    <Link to="/quan-ly/cho-xac-nhan" onClick={() => setOpen(false)}
                          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-semibold ${today.pendingOverdue ? 'bg-amber-50 text-amber-900' : 'bg-teal-50 text-teal-800'}`}>
                      <ClipboardList size={14} /> Xử lý {today.pendingTotal} lịch chờ xác nhận
                      {today.pendingOverdue > 0 && <span className="font-normal">({today.pendingOverdue} lịch đã chờ quá 12 giờ)</span>}
                    </Link>
                  )}
                </div>
              )
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
