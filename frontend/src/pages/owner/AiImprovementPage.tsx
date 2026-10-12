import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, GraduationCap, MessageCircleQuestion, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { assistantApi, getErrorMessage } from '@/api';
import type { AssistantImprovementReport, AssistantLearnedPhrase } from '@/types';
import { Button, Card, EmptyState, SectionTitle, Skeleton } from '@/components';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';

const SOURCE: Record<AssistantLearnedPhrase['source'], string> = { llm: 'AI viết lại', rephrase: 'Khách hỏi lại', owner: 'Chủ tiệm dạy' };
const INTENT: Record<string, string> = {
  unknown: 'Chưa hiểu', handoff: 'Chuyển người thật', not_offered: 'Tiệm không làm', availability: 'Giờ trống', service_price: 'Giá',
  stylists: 'Thợ', promotion: 'Ưu đãi', open_now: 'Giờ mở cửa', hours: 'Giờ mở cửa', need: 'Tư vấn', budget: 'Ngân sách',
};
const intentLabel = (i: string | null) => {
  if (!i) return '—';
  if (i.startsWith('dislike:')) return `👎 ${INTENT[i.slice(8)] ?? i.slice(8)}`;
  if (i.startsWith('repeat:')) return `Khách hỏi lại · ${INTENT[i.slice(7)] ?? i.slice(7)}`;
  return INTENT[i] ?? i;
};
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Vòng tự cải tiến của Trợ lý tư vấn khách (kiểu "Recommendations" của Intercom Fin + data engine):
 * câu khách hỏi mà trợ lý chưa hiểu → AI viết lại / khách tự hỏi lại → ĐỀ XUẤT; chủ tiệm duyệt thì trợ lý hiểu câu đó ngay,
 * không cần mô hình, và câu đã duyệt thành ví dụ mẫu giúp AI viết lại chuẩn hơn.
 */
export function AiImprovementPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('owner', 'admin');
  const toast = useToast();
  const [report, setReport] = useState<AssistantImprovementReport | null>(null);
  const [learned, setLearned] = useState<AssistantLearnedPhrase[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: AssistantLearnedPhrase['kind']; phrase: string; rewrite: string }>({ kind: 'question', phrase: '', rewrite: '' });

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([assistantApi.improvement(), assistantApi.learning('approved')]);
      setReport(r);
      setLearned(a);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (row: AssistantLearnedPhrase, status: 'approved' | 'rejected') => {
    setBusy(row.id);
    try {
      await assistantApi.learningUpdate(row.id, { status, rewrite: edits[row.id] });
      toast.success(status === 'approved' ? 'Đã duyệt — trợ lý hiểu câu này ngay' : 'Đã bỏ đề xuất');
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const teach = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('form');
    try {
      await assistantApi.learningAdd(form.kind, form.phrase, form.rewrite);
      toast.success('Đã dạy trợ lý');
      setForm({ kind: form.kind, phrase: '', rewrite: '' });
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!report) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>;
  const stats = [
    { label: 'Câu chưa trả lời được (30 ngày)', value: report.gaps.total, icon: <MessageCircleQuestion size={18} /> },
    { label: 'Đề xuất chờ duyệt', value: report.suggestions.length, icon: <GraduationCap size={18} /> },
    { label: 'Câu / cụm từ đã học', value: report.approved, icon: <Check size={18} /> },
    { label: 'Khách 👍 / 👎 (từ lúc bật máy chủ)', value: `${report.feedback.up} / ${report.feedback.down}`, icon: <ThumbsUp size={18} /> },
    { label: 'Câu AI bịa số liệu bị chặn', value: report.ungroundedBlocked, icon: <ShieldCheck size={18} /> },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle title="Cải tiến Trợ lý AI"
        description="Trợ lý tự ghi lại câu khách hỏi mà nó chưa hiểu và đề xuất cách hiểu; bạn duyệt là trợ lý hiểu ngay lần sau. Câu trả lời luôn lấy từ dữ liệu thật của tiệm." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-3">
            <div className="flex items-center gap-2 text-slate-500">{s.icon}<span className="text-xs">{s.label}</span></div>
            <p className="mt-1 text-xl font-semibold text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Đề xuất học chờ duyệt</h3>
        {!report.suggestions.length ? (
          <EmptyState title="Chưa có đề xuất mới" description="Khi khách hỏi câu trợ lý chưa hiểu và AI / khách diễn đạt lại được, đề xuất sẽ hiện ở đây." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className="p-2">Khách gõ</th><th className="p-2">Trợ lý sẽ hiểu là</th><th className="p-2">Ý định</th><th className="p-2">Nguồn</th><th className="p-2">Lượt</th><th className="p-2" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.suggestions.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 text-slate-700">{r.phrase}</td>
                    <td className="p-2">
                      <input className="field-input" value={edits[r.id] ?? r.rewrite} disabled={!canEdit} aria-label={`Câu viết lại cho "${r.phrase}"`}
                             onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))} />
                    </td>
                    <td className="p-2 text-xs text-slate-500">{intentLabel(r.intent)}</td>
                    <td className="p-2 text-xs text-slate-500">{SOURCE[r.source]}</td>
                    <td className="p-2 text-xs">{r.hits}</td>
                    <td className="p-2">
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button size="sm" icon={<Check size={14} />} loading={busy === r.id} onClick={() => decide(r, 'approved')}>Duyệt</Button>
                          <Button size="sm" variant="ghost" icon={<X size={14} />} disabled={busy === r.id} onClick={() => decide(r, 'rejected')}>Bỏ</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Dạy trợ lý</h3>
          <p className="mb-3 text-xs text-slate-500">
            Cụm từ: khách hay gõ "mát xoa" → hiểu là "massage". Cả câu: "tiệm còn nhận k" → "Bây giờ tiệm còn mở cửa không?".
            Câu trả lời: câu hỏi ngoài dữ liệu như "chỗ để xe" → bạn soạn câu trả lời (khớp khi câu khách chứa đủ các từ đó).
            Trợ lý chạy thử câu viết lại trước khi lưu; câu nó vẫn không hiểu thì không lưu.
          </p>
          <form onSubmit={teach} className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto] md:items-end">
            <label className="text-sm"><span className="field-label">Loại</span>
              <select className="field-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AssistantLearnedPhrase['kind'] })}>
                <option value="question">Cả câu</option><option value="alias">Cụm từ</option><option value="answer">Câu trả lời</option>
              </select>
            </label>
            <label className="text-sm"><span className="field-label">Khách gõ</span>
              <input className="field-input" required minLength={2} maxLength={200} value={form.phrase} onChange={(e) => setForm({ ...form, phrase: e.target.value })} />
            </label>
            <label className="text-sm"><span className="field-label">{form.kind === 'answer' ? 'Trợ lý trả lời' : 'Trợ lý hiểu là'}</span>
              <input className="field-input" required maxLength={form.kind === 'answer' ? 1000 : 300} value={form.rewrite} onChange={(e) => setForm({ ...form, rewrite: e.target.value })} />
            </label>
            <Button type="submit" loading={busy === 'form'} icon={<GraduationCap size={16} />}>Dạy</Button>
          </form>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Câu khách hỏi mà trợ lý chưa trả lời tốt (30 ngày, đã che SĐT / email)</h3>
        {!report.gaps.items.length ? <EmptyState title="Chưa có câu nào" /> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {report.gaps.items.map((g) => (
              <li key={`${g.question}-${g.intent}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-slate-800">{g.question}</span>
                <span className="text-xs text-slate-500">{intentLabel(g.intent)}</span>
                <span className="text-xs text-slate-500">{g.count} lần · {when(g.lastAt)}</span>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setForm({ kind: 'question', phrase: g.question, rewrite: '' })}>Dạy câu này</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Trợ lý đã học ({learned.length})</h3>
        {!learned.length ? <EmptyState title="Chưa học câu nào" /> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {learned.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-slate-700">{r.phrase}</span>
                <span className="text-slate-400">{r.kind === 'answer' ? '💬' : '→'}</span>
                <span className="min-w-0 flex-1 font-medium text-slate-900">{r.rewrite}</span>
                <span className="text-xs text-slate-500">{SOURCE[r.source]} · {r.hits} lượt</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" icon={<ThumbsDown size={14} />} disabled={busy === r.id} onClick={() => decide(r, 'rejected')}>Bỏ</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
