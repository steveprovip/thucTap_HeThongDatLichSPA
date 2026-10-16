import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { History, Search, Trash2, Users } from 'lucide-react';
import { customersApi, getErrorMessage } from '@/api';
import type { Customer, VisitHistoryItem } from '@/types';
import {
  Button, ConfirmDialog, EmailText, EmptyState, Field, Input, Modal, Pagination, SectionTitle, Textarea, TableSkeleton,
} from '@/components';
import { formatDate } from '@/utils/format';
import { CUSTOMER_METRIC_LABELS, historyCaption } from '@/utils/customerMetrics';
import { STATUS_LABELS } from '@/utils/constants';
import { emailError } from '@/utils/validators';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** S3-10 + S4-03: hồ sơ khách gộp theo số điện thoại và lịch sử dịch vụ. */
export function CustomersPage() {
  // Bảng lệnh (Ctrl + K) mở thẳng hồ sơ khách qua ?q=<SĐT / tên>
  const [params] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const navKey = useLocation().key;
  const [q, setQ] = useState(urlQ);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<{ items: Customer[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [history, setHistory] = useState<VisitHistoryItem[]>([]);
  const [note, setNote] = useState('');
  /** QA Sprint 3 · đề xuất 5: sửa tên / email ngay trong hồ sơ; Chủ tiệm xoá được hồ sơ chưa có lịch hẹn. */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwner = useAuth().user?.role === 'owner';
  const toast = useToast();

  // Đang ở sẵn trang này mà chọn khách trong bảng lệnh: chỉ ?q= đổi nên trang KHÔNG dựng lại — theo URL mỗi lần điều hướng
  // (kể cả chọn lại đúng khách cũ sau khi đã gõ ô tìm khác: cùng URL nhưng `key` điều hướng mới).
  useEffect(() => { setQ(urlQ); setPage(1); }, [urlQ, navKey]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await customersApi.search({ q: q.trim() || undefined, page, limit }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [q, page, limit, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const open = async (c: Customer) => {
    setDetail(c);
    setNote(c.note ?? '');
    setName(c.fullName);
    setEmail(c.email ?? '');
    try { setHistory(await customersApi.history(c.id)); } catch { setHistory([]); }
  };

  const nameError = !name.trim() ? 'Tên khách không được để trống' : undefined;
  const mailError = emailError(email, false);
  const save = async () => {
    if (!detail || nameError || mailError) return;
    try {
      const updated = await customersApi.update(detail.id, { fullName: name.trim(), email: email.trim() || null, note });
      toast.success('Đã lưu hồ sơ khách');
      setDetail({ ...detail, ...updated });
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const remove = async () => {
    if (!detail) return;
    try {
      const r = await customersApi.remove(detail.id);
      toast.success(r.mode === 'anonymized'
        ? 'Đã xoá dữ liệu cá nhân (giữ lịch hẹn & doanh thu ở dạng ẩn danh)'
        : 'Đã xoá hồ sơ khách');
      setDetail(null);
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

      {loading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<Users size={30} />} title="Không tìm thấy hồ sơ khách" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Số điện thoại</th>
                  <th className="text-right">{CUSTOMER_METRIC_LABELS.visits}</th>
                  <th className="text-right">{CUSTOMER_METRIC_LABELS.noShows}</th>
                  <th className="text-right">{CUSTOMER_METRIC_LABELS.total}</th><th>Ghi chú</th><th></th>
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
                    <td className="text-right">{c.totalAppointments}</td>
                    <td className="max-w-[240px] truncate text-xs text-ink-muted">{c.note}</td>
                    <td><Button size="sm" variant="ghost" onClick={() => open(c)}>Xem</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage}
                      limit={limit} onLimitChange={(n) => { setLimit(n); setPage(1); }} />
        </>
      )}

      <Modal
        open={!!detail}
        title={detail ? `Hồ sơ ${detail.fullName}` : ''}
        onClose={() => setDetail(null)}
        size="lg"
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isOwner ? (
              <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}
                      title="Xoá dữ liệu cá nhân khi khách yêu cầu">
                Xoá dữ liệu khách
              </Button>
            ) : <span />}
            <Button onClick={save} disabled={!!nameError || !!mailError}>Lưu thay đổi</Button>
          </div>
        )}
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-muted">Số điện thoại</dt><dd className="font-semibold">{detail.phone}</dd></div>
              <div className="min-w-0"><dt className="text-ink-muted">Email</dt><dd><EmailText email={detail.email} /></dd></div>
              <div><dt className="text-ink-muted">{CUSTOMER_METRIC_LABELS.visits}</dt><dd className="font-semibold">{detail.totalVisits}</dd></div>
              <div><dt className="text-ink-muted">{CUSTOMER_METRIC_LABELS.noShows}</dt>
                   <dd className={`font-semibold ${detail.noShowCount >= 2 ? 'text-red-600' : ''}`}>{detail.noShowCount}</dd></div>
              <div><dt className="text-ink-muted">{CUSTOMER_METRIC_LABELS.total}</dt><dd className="font-semibold">{detail.totalAppointments}</dd></div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Họ tên" required error={nameError}>
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} invalid={!!nameError} />
              </Field>
              <Field label="Email" error={mailError} hint="Để trống nếu khách không dùng email">
                <Input type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} invalid={!!mailError} />
              </Field>
            </div>

            <Field label="Ghi chú riêng của tiệm" hint="Chỉ nhân sự của tiệm nhìn thấy">
              <Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </Field>

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <History size={16} /> Lịch sử đặt lịch ({historyCaption(history.length, detail.totalAppointments)})
              </p>
              {history.length === 0 ? (
                <p className="rounded-xl bg-surface-alt px-3.5 py-3 text-sm text-ink-muted">
                  Khách mới, chưa có lịch sử đặt lịch.
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

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Xoá dữ liệu khách theo yêu cầu"
        confirmLabel="Xoá dữ liệu"
        message={detail && detail.totalAppointments > 0
          ? `${detail.fullName} (${detail.phone}) đã có ${detail.totalAppointments} lịch hẹn: hệ thống XOÁ tên, SĐT, email, ghi chú, nhận xét `
            + 'nhưng giữ lịch hẹn / phiếu ở dạng ẩn danh để doanh thu không đổi. Không hoàn tác được.'
          : `Xoá hẳn hồ sơ ${detail?.fullName ?? ''} (${detail?.phone ?? ''})? Không hoàn tác được.`}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
