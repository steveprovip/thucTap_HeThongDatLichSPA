import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brush, CalendarCheck, Check, Clock3, Flower2, Gem, Plus, Scissors, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { assistantApi, getErrorMessage } from '@/api';
import type { ChatTurn, CustomerAssistantService, CustomerDialogState } from '@/types';
import { formatVnd } from '@/utils/format';
import { serviceImage, serviceMediaKind } from '@/utils/images';
import { SmartImage } from './Media';
import { LotusMark } from './LotusMark';

interface Line {
  from: 'me' | 'bot'; text: string; suggestions?: CustomerAssistantService[]; meta?: string; bookDate?: string; bookTime?: string;
  /** Câu khách + ý định — để gửi 👍 / 👎; `understoodAs`: trợ lý đã viết lại câu khó hiểu thành câu này. */
  q?: string; intent?: string; understoodAs?: string; rated?: 'up' | 'down';
}

const QUICK = ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay'];
/** TASK v4 · NV4: chủ đề tư vấn nhanh như quầy lễ tân spa — bấm là hỏi ngay. */
const TOPICS: [string, string, typeof Scissors][] = [
  ['Tóc', 'Tư vấn chăm sóc tóc', Scissors], ['Da mặt', 'Tư vấn chăm sóc da', Sparkles], ['Massage', 'Massage thư giãn', Flower2],
  ['Nail', 'Tư vấn làm móng', Gem], ['Trang điểm', 'Tư vấn trang điểm dự tiệc', Brush],
];
const partOfDay = (): string => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  return h >= 4 && h < 11 ? 'sáng' : h < 13 ? 'trưa' : h < 18 ? 'chiều' : 'tối';
};
const greeting = (): string => `Chào bạn, chúc bạn buổi ${partOfDay()} thật thư thái! 🌿 Mình là trợ lý tư vấn sắc đẹp của tiệm. `
  + 'Bạn muốn chăm sóc tóc, da, massage thư giãn hay làm móng? Kể mình nghe nhu cầu, mình gợi ý dịch vụ kèm giá và thời lượng '
  + '— ưng thì bấm "Đặt lịch ngay" là phiếu đặt lịch được điền sẵn.';

/**
 * TASK v3 · NV1 — AI tư vấn khách, nút nổi góc phải dưới ở Trang chủ và trang Đặt lịch.
 *  - Chào hỏi, tư vấn theo nhu cầu, báo giá + thời lượng lấy từ DANH MỤC THẬT của tiệm (máy chủ), không bịa.
 *  - Nút nhanh: Xem bảng giá / Dịch vụ hot / Đặt lịch ngay; mỗi dịch vụ gợi ý có "Chọn" và "Đặt lịch".
 *  - `onBook` (trang Đặt lịch) điền thẳng vào wizard; mặc định chuyển tới /dat-lich?services=… để wizard tự điền.
 *  - `liftPx`: nâng nút lên trên thanh thao tác dính đáy của wizard trên điện thoại.
 */
export function CustomerAiAssistant({ onBook, liftPx = 0 }: {
  onBook?: (services: CustomerAssistantService[], date?: string, time?: string) => void;
  liftPx?: number;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [{ from: 'bot', text: greeting() }]);
  const [quick, setQuick] = useState<string[]>(QUICK);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<CustomerAssistantService[]>([]);
  /** Trạng thái hội thoại server trả về (ngày / buổi / dịch vụ đang hỏi) — để "cắt tóc nữ ?" nối tiếp "sáng mai có giờ trống?". */
  const dialog = useRef<CustomerDialogState | undefined>(undefined);
  const logRef = useRef<HTMLDivElement>(null);
  const lastBotRef = useRef<HTMLDivElement>(null);

  // QA 12/10: câu trả lời mới → cuộn tới ĐẦU câu trả lời (đọc được ngay), không cuộn tuột xuống đáy danh sách thẻ dịch vụ
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = lines[lines.length - 1];
    const bot = lastBotRef.current;
    if (!busy && last?.from === 'bot' && bot && lines.length > 1) {
      log.scrollTo({ top: Math.max(0, bot.offsetTop - log.offsetTop - 8), behavior: 'smooth' });
    } else {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    }
  }, [lines, busy, open]);

  const history = (): ChatTurn[] => lines.slice(1).map((l) => ({ role: l.from === 'me' ? 'user' : 'assistant', content: l.text.slice(0, 1500) }));

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const past = history();
    setLines((l) => [...l, { from: 'me', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const r = await assistantApi.customerChat(q, past, dialog.current);
      dialog.current = r.state;
      setLines((l) => [...l, {
        from: 'bot', text: r.answer, suggestions: r.suggestions, meta: r.source === 'llm' ? 'AI tư vấn' : undefined, bookDate: r.bookDate,
        bookTime: r.bookTime,
        q, intent: r.intent, understoodAs: r.understoodAs,
      }]);
      if (r.quickReplies?.length) setQuick(r.quickReplies);
    } catch (e) {
      setLines((l) => [...l, { from: 'bot', text: getErrorMessage(e, 'Mình đang bận một chút, bạn thử lại sau ít phút nhé.') }]);
    } finally {
      setBusy(false);
    }
  };

  /** `date` / `time`: ngày + giờ trợ lý vừa TRA THẬT còn trống → phiếu đặt lịch mở sẵn đúng ngày giờ đó. */
  const book = (services: CustomerAssistantService[], date?: string, time?: string) => {
    if (!services.length) return;
    setOpen(false);
    setPicked([]);
    if (onBook) onBook(services, date, time);
    else navigate(`/dat-lich?services=${services.map((s) => encodeURIComponent(s.id)).join(',')}${date ? `&date=${date}` : ''}${date && time ? `&time=${time}` : ''}`);
  };
  /** 👍 / 👎: câu bị chê vào báo cáo "Cải tiến AI" của chủ tiệm (phân tích lỗi trên hội thoại thật). */
  const rate = (i: number, helpful: boolean) => {
    const l = lines[i];
    if (!l?.q || l.rated) return;
    setLines((all) => all.map((x, k) => (k === i ? { ...x, rated: helpful ? 'up' : 'down' } : x)));
    void assistantApi.customerFeedback(l.q, l.intent ?? 'unknown', helpful).catch(() => undefined);
  };
  const toggle = (s: CustomerAssistantService) =>
    setPicked((p) => (p.some((x) => x.id === s.id) ? p.filter((x) => x.id !== s.id) : p.length >= 5 ? p : [...p, s]));

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(draft); };
  const bottom = `calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + ${12 + liftPx}px)`;
  // Khung chat phủ lên thanh "Tiếp tục" nên không cần nâng; cao theo 100dvh để không tràn mép trên ở điện thoại thấp
  // Trang đặt lịch (nút nâng trên thanh "Tiếp tục"): điện thoại chỉ hiện icon tròn để không che ô khung giờ
  const compact = liftPx > 0;
  const panelBottom ='calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + 12px)';
  const panelHeight = 'min(600px, calc(100dvh - var(--bottom-nav-h, 0px) - env(safe-area-inset-bottom) - 84px))';

  return (
    <div className="no-print">
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Mở trợ lý tư vấn sắc đẹp"
                style={{ bottom }}
                className={`glass group fixed right-4 z-40 inline-flex min-h-[52px] items-center gap-3 rounded-full py-1.5 pl-1.5 ${compact ? 'pr-1.5 sm:pr-5' : 'pr-5'} text-sm font-medium text-slate-800 transition-[transform,box-shadow] duration-spring ease-spring animate-spring-in hover:-translate-y-0.5 active:scale-[0.97] sm:!bottom-6`}>
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-teal-700 text-white shadow-glow">
            <LotusMark className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-jade ring-2 ring-canvas" aria-hidden />
          </span>
          <span className={`text-left leading-tight ${compact ? 'hidden sm:inline' : ''}`}>
            <span className="block">Tư vấn sắc đẹp</span>
            <span className="hidden text-[11px] font-normal text-slate-500 sm:block">Gợi ý dịch vụ · giờ trống thật</span>
          </span>
        </button>
      )}

      {open && (
        <section role="dialog" aria-label="Trợ lý tư vấn dịch vụ"
                 style={{ bottom: panelBottom, height: panelHeight }}
                 onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                 className="glass animate-pop-in fixed inset-x-3 z-50 flex flex-col overflow-hidden rounded-[26px] sm:inset-x-auto sm:right-6 sm:!bottom-6 sm:w-[410px]">
          <header className="relative flex items-center gap-3 border-b border-slate-200/60 px-4 py-3.5">
            <div aria-hidden className="gold-rule absolute inset-x-8 bottom-0" />
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-700/20">
              <LotusMark className="h-6 w-6" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-jade ring-2 ring-canvas" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="font-display text-xl font-semibold italic leading-none text-slate-900">Trợ lý Hương Sen</p>
              <p className="mt-1 truncate text-[11px] text-slate-500">Giá đúng bảng giá · giờ trống tra trên lịch thật</p>
            </div>
            <button type="button"
                    onClick={() => { if (picked.length) book(picked); else { setOpen(false); if (!onBook) navigate('/dat-lich'); } }}
                    title={picked.length ? 'Điền các dịch vụ đã chọn vào phiếu đặt lịch' : 'Mở phiếu đặt lịch'}
                    className="ml-auto hidden min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border border-gold/40 px-3.5 text-xs font-semibold text-slate-900 transition-[background-color,color,transform] duration-spring ease-spring hover:border-transparent hover:bg-teal-700 hover:text-white active:scale-[0.97] sm:inline-flex">
              Đặt lịch ngay
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý"
                    className="hit-44 ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:ml-1"><X size={18} /></button>
          </header>

          <div ref={logRef} className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-4 text-[13.5px] leading-relaxed">
            {lines.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pb-1" aria-label="Chủ đề tư vấn">
                {TOPICS.map(([label, q, Icon]) => (
                  <button key={label} type="button" disabled={busy} onClick={() => void ask(q)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-[color,border-color,transform] duration-spring ease-spring hover:border-gold/60 hover:text-slate-900 active:scale-[0.96] disabled:opacity-50">
                    <Icon size={13} className="text-gold" /> {label}
                  </button>
                ))}
              </div>
            )}
            {lines.map((l, i) => (
              <div key={i} ref={i === lines.length - 1 && l.from === 'bot' ? lastBotRef : undefined}
                   className={`animate-bubble-in ${l.from === 'me' ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[88%] whitespace-pre-line break-words px-3.5 py-2.5 ${l.from === 'me' ? 'rounded-[18px] rounded-br-md bg-teal-700 text-white' : 'rounded-[18px] rounded-bl-md border border-slate-200/70 bg-white/70 text-slate-800'}`}>
                  {l.understoodAs && <span className="mb-1 block text-[11px] italic text-slate-500">Mình hiểu là: “{l.understoodAs}”</span>}
                  {l.text}
                  {l.meta && <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] opacity-50">{l.meta}</span>}
                  {l.from === 'bot' && l.q && (
                    <span className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
                      {l.rated ? (l.rated === 'up' ? 'Cảm ơn bạn!' : 'Cảm ơn bạn — tiệm sẽ cải thiện câu này.') : (
                        <>
                          <span>Câu trả lời có giúp ích?</span>
                          <button type="button" onClick={() => rate(i, true)} aria-label="Hữu ích" className="hit-44 rounded p-1 transition-colors hover:text-gold"><ThumbsUp size={12} /></button>
                          <button type="button" onClick={() => rate(i, false)} aria-label="Chưa đúng ý" className="hit-44 rounded p-1 transition-colors hover:text-rose-600"><ThumbsDown size={12} /></button>
                        </>
                      )}
                    </span>
                  )}
                </div>
                {l.from === 'bot' && l.bookDate && l.bookTime && !!l.suggestions?.length && (
                  <button type="button" onClick={() => book(l.suggestions!.slice(0, 1), l.bookDate, l.bookTime)}
                          className="animate-spring-in mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-full bg-teal-700 px-4 text-xs font-semibold text-white shadow-glow transition-transform duration-spring ease-spring active:scale-[0.96]">
                    <CalendarCheck size={14} /> Đặt lúc <span className="tnum">{l.bookTime} · {l.bookDate.slice(8, 10)}/{l.bookDate.slice(5, 7)}</span>
                  </button>
                )}
                {!!l.suggestions?.length && (
                  // Gợi ý GỌN: mỗi dịch vụ một dòng (ảnh nhỏ · tên · giá · Chọn / Đặt), tối đa 3 — không lấn át câu trả lời
                  <ul className="mt-2 max-w-[92%] divide-y divide-slate-200/60 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/50" aria-label="Dịch vụ liên quan">
                    {l.suggestions.slice(0, 3).map((s) => {
                      const on = picked.some((x) => x.id === s.id);
                      return (
                        <li key={s.id} className={`flex items-center gap-2.5 px-2.5 py-2 transition-colors ${on ? 'bg-gold/[0.08]' : ''}`}>
                          <SmartImage src={serviceImage({ id: s.id, name: s.name, categoryName: s.categoryName, imageUrl: s.imageUrl })}
                                      alt="" loading="lazy" seed={s.id} sizes="40px" className="h-9 w-9 shrink-0 rounded-xl"
                                      kind={serviceMediaKind({ name: s.name, categoryName: s.categoryName })} />
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate text-[12.5px] font-medium text-slate-900" title={s.name}>{s.name}</p>
                            <p className="tnum mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                              <span className="font-semibold text-gold">{s.priceText}</span> · <Clock3 size={10} /> {s.durationMinutes}′
                            </p>
                          </div>
                          <button type="button" onClick={() => toggle(s)} aria-pressed={on}
                                  aria-label={on ? `Bỏ chọn ${s.name}` : `Chọn thêm ${s.name}`} title={on ? 'Bỏ chọn' : 'Chọn thêm để đặt chung'}
                                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,transform] duration-spring ease-spring active:scale-[0.9] sm:h-8 sm:w-8 ${on ? 'border-transparent bg-teal-700 text-white' : 'border-slate-200 text-slate-500 hover:border-gold/60 hover:text-gold'}`}>
                            {on ? <Check size={14} /> : <Plus size={14} />}
                          </button>
                          <button type="button" onClick={() => book([s], l.bookDate, l.bookTime)}
                                  title={`Đặt lịch ${s.name}${l.bookDate ? ` ngày ${l.bookDate.slice(8, 10)}/${l.bookDate.slice(5, 7)}` : ''}${l.bookTime ? ` lúc ${l.bookTime}` : ''}`}
                                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-gold/40 px-3 text-[11px] font-semibold text-slate-900 transition-[background-color,color,border-color,transform] duration-spring ease-spring hover:border-transparent hover:bg-teal-700 hover:text-white active:scale-[0.95] sm:h-8">
                            <CalendarCheck size={12} /> Đặt
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
            {busy && (
              <p role="status" className="animate-bubble-in inline-flex items-center gap-1 rounded-[18px] rounded-bl-md border border-slate-200/70 bg-white/70 px-3.5 py-3">
                <span className="sr-only">Đang trả lời…</span>
                {[0, 1, 2].map((d) => <span key={d} aria-hidden className="typing-dot h-1.5 w-1.5 rounded-full bg-gold" />)}
              </p>
            )}
          </div>

          {picked.length > 0 && (
            <div className="animate-fade-in flex items-center gap-2 border-t border-gold/20 bg-gold/[0.06] px-3.5 py-2.5 text-xs">
              <span className="min-w-0 flex-1 leading-tight text-slate-800">
                <span className="tnum block truncate font-semibold">Đã chọn {picked.length} dịch vụ · {picked.reduce((a, p) => a + p.durationMinutes, 0)} phút</span>
                <span className="tnum block truncate text-slate-500">{formatVnd(picked.reduce((a, p) => a + p.price, 0))} · {picked.map((p) => p.name).join(', ')}</span>
              </span>
              <button type="button" onClick={() => book(picked)}
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-teal-700 px-4 font-semibold text-white transition-transform duration-spring ease-spring active:scale-[0.96]">
                <CalendarCheck size={14} /> Đặt lịch ngay
              </button>
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-200/60 px-3 pt-2.5 thin-scroll [scrollbar-width:none]" aria-label="Câu hỏi nhanh">
            {quick.map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => void ask(q)}
                      className="min-h-[34px] shrink-0 rounded-full border border-gold/30 px-3 text-xs font-medium text-slate-800 transition-[background-color,border-color,transform] duration-spring ease-spring hover:border-gold/60 hover:bg-gold/10 active:scale-[0.96] disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 pb-3 pt-2.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="VD: tóc khô xơ, muốn phục hồi…"
                   aria-label="Câu hỏi cho trợ lý" className="field-input min-h-[42px] flex-1 rounded-full py-1.5 pl-4 text-sm" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Gửi"
                    className="tap-44 inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-teal-700 text-white transition-[transform,opacity] duration-spring ease-spring active:scale-[0.9] disabled:opacity-40"><Send size={16} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
