import { useCallback, useEffect, useState } from 'react';
import { History, Search, Users } from 'lucide-react';
import { customersApi, getErrorMessage } from '@/api';
import type { Customer, VisitHistoryItem } from '@/types';
import { Button, EmptyState, Field, Input, Modal, Pagination, SectionTitle, Textarea, TableSkeleton } from '@/components';
import { formatDate } from '@/utils/format';
import { STATUS_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/** S3-10 + S4-03: hồ sơ khách gộp theo số điện thoại và lịch sử dịch vụ. */
export function CustomersPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Customer[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [note, setNote] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await customersApi.search({ q: q.trim() || undefined, page, limit: 20 }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [q, page, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const open = async (c: Customer) => {
    setDetail(c);
    setNote(c.note ?? '');
    try { setHistory(await customersApi.history(c.id)); } catch { setHistory([]); }
  };

  const saveNote = async () => {
    if (!detail) return;
    try {
      await customersApi.update(detail.id, { note });
      toast.success('Đã lưu ghi chú');
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <SectionTitle title="Hồ sơ khách hàng" description="Các lần đến của cùng một số điện thoại được gộp vào một hồ sơ." />

      <div className="relative max-w-md">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
               placeholder="Tìm theo tên hoặc số điện thoại" className="pl-11" />
      </div>

      {loading ? <TableSkeleton cols={5} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<Users size={30} />} title="Không tìm thấy hồ sơ khách" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Số điện thoại</th><th className="text-right">Lượt đến</th>
                  <th className="text-right">Không đến</th><th>Ghi chú</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-medium">{c.fullName}</span>
                      {c.isNew && <span className="ml-2 chip border border-blue-300 bg-blue-50 text-blue-700">Khách mới</span>}
                    </td>
                    <td className="font-mono text-xs">{c.phone}</td>
                    <td className="text-right">{c.totalVisits}</td>
                    <td className={`text-right ${c.noShowCount >= 2 ? 'font-bold text-red-600' : ''}`}>{c.noShowCount}</td>
                    <td className="max-w-[240px] truncate text-xs text-ink-muted">{c.note}</td>
                    <td><Button size="sm" variant="ghost" onClick={() => open(c)}>Xem</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <Modal
        open={!!detail}
        title={detail ? `Hồ sơ ${detail.fullName}` : ''}
        onClose={() => setDetail(null)}
        size="lg"
        footer={<div className="flex justify-end"><Button onClick={saveNote}>Lưu ghi chú</Button></div>}
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-ink-muted">Số điện thoại</dt><dd className="font-semibold">{detail.phone}</dd></div>
              <div><dt className="text-ink-muted">Email</dt><dd className="font-semibold">{detail.email ?? '—'}</dd></div>
              <div><dt className="text-ink-muted">Lượt đến</dt><dd className="font-semibold">{detail.totalVisits}</dd></div>
              <div><dt className="text-ink-muted">Không đến</dt>
                   <dd className={`font-semibold ${detail.noShowCount >= 2 ? 'text-red-600' : ''}`}>{detail.noShowCount}</dd></div>
            </dl>

            <Field label="Ghi chú riêng của tiệm" hint="Chỉ nhân sự của tiệm nhìn thấy">
              <Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </Field>

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <History size={16} /> Lịch sử dịch vụ ({history.length})
              </p>
              {history.length === 0 ? (
                <p className="rounded-xl bg-surface-alt px-3.5 py-3 text-sm text-ink-muted">
                  Khách mới, chưa có lịch sử dịch vụ.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Ngày</th><th>Dịch vụ</th><th>Thợ</th><th>Trạng thái</th><th>Ghi chú kỹ thuật</th></tr></thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.appointmentId}>
                          <td className="whitespace-nowrap">{formatDate(h.date)}</td>
                          <td>{h.services.join(', ')}</td>
                          <td>{h.stylistName}</td>
                          <td>{STATUS_LABELS[h.status]}</td>
                          <td className="text-xs text-ink-muted">{h.technicalNote ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
