import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Check, Clock3, Flower2, Loader2, MessageCircleHeart, Plus, Send, X } from 'lucide-react';
import { assistantApi, getErrorMessage } from '@/api';
import type { ChatTurn, CustomerAssistantService } from '@/types';
import { formatVnd } from '@/utils/format';
import { serviceImage, serviceMediaKind } from '@/utils/images';
import { SmartImage } from './Media';

interface Line { from: 'me' | 'bot'; text: string; suggestions?: CustomerAssistantService[]; meta?: string }

const QUICK = ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay'];
/** TASK v4 · NV4: chủ đề tư vấn nhanh như quầy lễ tân spa — bấm là hỏi ngay. */
const TOPICS: [string, string][] = [
  ['💇‍♀️ Tóc', 'Tư vấn chăm sóc tóc'], ['✨ Da mặt', 'Tư vấn chăm sóc da'], ['💆 Massage', 'Massage thư giãn'],
  ['💅 Nail', 'Tư vấn làm móng'], ['💄 Trang điểm', 'Tư vấn trang điểm dự tiệc'],
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
  onBook?: (services: CustomerAssistantService[]) => void;
  liftPx?: number;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [{ from: 'bot', text: greeting() }]);
  const [quick, setQuick] = useState<string[]>(QUICK);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<CustomerAssistantService[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [lines, busy, open]);

  const history = (): ChatTurn[] => lines.slice(1).map((l) => ({ role: l.from === 'me' ? 'user' : 'assistant', content: l.text.slice(0, 1500) }));

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const past = history();
    setLines((l) => [...l, { from: 'me', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const r = await assistantApi.customerChat(q, past);
      setLines((l) => [...l, { from: 'bot', text: r.answer, suggestions: r.suggestions, meta: r.source === 'llm' ? 'AI tư vấn' : undefined }]);
      if (r.quickReplies?.length) setQuick(r.quickReplies);
    } catch (e) {
      setLines((l) => [...l, { from: 'bot', text: getErrorMessage(e, 'Mình đang bận một chút, bạn thử lại sau ít phút nhé.') }]);
    } finally {
      setBusy(false);
    }
  };

  const book = (services: CustomerAssistantService[]) => {
    if (!services.length) return;
    setOpen(false);
    setPicked([]);
    if (onBook) onBook(services);
    else navigate(`/dat-lich?services=${services.map((s) => encodeURIComponent(s.id)).join(',')}`);
  };
  const toggle = (s: CustomerAssistantService) =>
    setPicked((p) => (p.some((x) => x.id === s.id) ? p.filter((x) => x.id !== s.id) : p.length >= 5 ? p : [...p, s]));

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(draft); };
  const bottom = `calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + ${12 + liftPx}px)`;

  return (
    <div className="no-print">
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Mở trợ lý tư vấn sắc đẹp"
                style={{ bottom }}
                className="group fixed right-4 z-40 inline-flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold text-slate-800 shadow-lg ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-xl sm:!bottom-6">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <MessageCircleHeart size={18} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block">Tư vấn sắc đẹp</span>
            <span className="hidden text-[11px] font-normal text-slate-500 sm:block">Gợi ý dịch vụ · báo giá ngay</span>
          </span>
        </button>
      )}

      {open && (
        <section role="dialog" aria-label="Trợ lý tư vấn dịch vụ"
                 style={{ bottom }}
                 className="fixed inset-x-3 z-50 flex h-[min(600px,78vh)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:!bottom-6 sm:w-[390px]">
          <header className="flex items-center gap-2.5 bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 px-3.5 py-3 text-white">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40">
              <Flower2 size={20} />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-teal-700" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold">Trợ lý tư vấn sắc đẹp</p>
              <p className="text-[11px] opacity-85">Trợ lý tự động · trả lời ngay · giá đúng bảng giá tiệm</p>
            </div>
            <button type="button"
                    onClick={() => { if (picked.length) book(picked); else { setOpen(false); if (!onBook) navigate('/dat-lich'); } }}
                    title={picked.length ? 'Điền các dịch vụ đã chọn vào phiếu đặt lịch' : 'Mở phiếu đặt lịch'}
                    className="ml-auto hidden rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 sm:inline-flex">
              Đặt lịch ngay
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 sm:ml-1"><X size={17} /></button>
          </header>

          <div ref={logRef} className="thin-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50/60 px-3 py-3 text-[13px]">
            {lines.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pb-1" aria-label="Chủ đề tư vấn">
                {TOPICS.map(([label, q]) => (
                  <button key={label} type="button" disabled={busy} onClick={() => void ask(q)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-teal-400 hover:text-teal-800 disabled:opacity-50">
                    {label}
                  </button>
                ))}
              </div>
            )}
            {lines.map((l, i) => (
              <div key={i} className={l.from === 'me' ? 'flex justify-end' : ''}>
                <div className={`max-w-[90%] whitespace-pre-line rounded-2xl px-3 py-2 ${l.from === 'me' ? 'rounded-br-md bg-teal-600 text-white' : 'rounded-bl-md bg-white text-slate-800 shadow-sm'}`}>
                  {l.text}
                  {l.meta && <span className="mt-1 block text-[10px] opacity-50">{l.meta}</span>}
                </div>
                {!!l.suggestions?.length && (
                  <ul className="mt-1.5 space-y-1.5">
                    {l.suggestions.map((s) => {
                      const on = picked.some((x) => x.id === s.id);
                      return (
                        <li key={s.id} className={`flex gap-2.5 rounded-2xl border bg-white p-2 shadow-sm transition ${on ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-100 hover:shadow-md'}`}>
                          <SmartImage src={serviceImage({ id: s.id, name: s.name, categoryName: s.categoryName, imageUrl: s.imageUrl })}
                                      alt={s.name} loading="lazy" seed={s.id} className="h-[72px] w-[72px] shrink-0 rounded-xl"
                                      kind={serviceMediaKind({ name: s.name, categoryName: s.categoryName })} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 font-semibold leading-snug text-slate-900">{s.name}</p>
                              <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">{s.priceText}</span>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                              <Clock3 size={11} /> {s.durationMinutes} phút · {s.categoryName}
                            </p>
                            <div className="mt-1.5 flex gap-1.5">
                              <button type="button" onClick={() => toggle(s)} aria-pressed={on}
                                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${on ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-teal-400'}`}>
                                {on ? <Check size={12} /> : <Plus size={12} />} {on ? 'Đã chọn' : 'Chọn thêm'}
                              </button>
                              <button type="button" onClick={() => book([s])}
                                      className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-teal-700">
                                <CalendarCheck size={12} /> Đặt lịch ngay
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
            {busy && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> Đang tìm dịch vụ phù hợp…</p>}
          </div>

          {picked.length > 0 && (
            <div className="flex items-center gap-2 border-t border-teal-100 bg-teal-50 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 leading-tight text-teal-900">
                <span className="block truncate font-semibold">Đã chọn {picked.length} dịch vụ · {picked.reduce((a, p) => a + p.durationMinutes, 0)} phút</span>
                <span className="block truncate">{formatVnd(picked.reduce((a, p) => a + p.price, 0))} · {picked.map((p) => p.name).join(', ')}</span>
              </span>
              <button type="button" onClick={() => book(picked)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 font-semibold text-white shadow-sm hover:bg-teal-700">
                <CalendarCheck size={14} /> Đặt lịch ngay
              </button>
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-2.5 pt-2 thin-scroll" aria-label="Câu hỏi nhanh">
            {quick.map((q) => (
              <button key={q} type="button" disabled={busy} onClick={() => void ask(q)}
                      className="shrink-0 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-1.5 px-2.5 py-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="VD: tóc khô xơ, muốn phục hồi…"
                   aria-label="Câu hỏi cho trợ lý" className="field-input min-h-[38px] flex-1 py-1.5 text-sm" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Gửi"
                    className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-teal-600 text-white disabled:opacity-40"><Send size={16} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
