import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, RefreshCw } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment } from '@/types';
import { Button, Card, EmptyState, Pagination, SectionTitle, Select, Spinner, StatusBadge } from '@/components';
import { formatDuration } from '@/utils/format';
import type { PendingSort } from '@/utils/opsHelpers';
import { useToast } from '@/contexts/ToastContext';
import { useAppointmentsSync } from '@/utils/liveSync';
import { AppointmentDrawer } from './AppointmentDrawer';

/** S3-02: danh sách riêng các lịch đặt online đang chờ xác nhận. */
export function PendingPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  /** TASK v3 · NV2: phân trang ở máy chủ (5.000+ lịch), quá hạn 12 giờ luôn ở đầu trang 1. */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, overdueCount: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [sort, setSort] = useState<PendingSort>('start_asc');
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await appointmentsApi.pendingPage({ page, limit, sort });
      setItems(r.items);
      setMeta({ total: r.total, totalPages: r.totalPages, overdueCount: r.overdueCount });
      if (r.items.length === 0 && page > 1) setPage(Math.max(1, r.totalPages)); // xử lý hết trang cuối → lùi trang
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast, page, limit, sort]);

  useEffect(() => { void load(); }, [load]);
  useAppointmentsSync(() => { void load(); });

  const sorted = items; // máy chủ đã sắp: quá hạn trước, rồi theo lựa chọn
  const confirm = async (a: Appointment) => {
    try { await appointmentsApi.confirm(a.id); toast.success(`Đã xác nhận lịch ${a.code}`); void load(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Lịch chờ xác nhận"
        description="Lịch khách đặt online vào đây trước, tiệm chủ động xác nhận hoặc từ chối."
        action={
          <div className="flex items-center gap-2">
            <Select aria-label="Sắp xếp lịch chờ" value={sort} onChange={(e) => { setSort(e.target.value as PendingSort); setPage(1); }} className="h-9 w-auto text-sm">
              <option value="start_asc">Giờ hẹn: cũ nhất trước</option>
              <option value="start_desc">Giờ hẹn: mới nhất trước</option>
              <option value="name_asc">Tên khách hàng (A–Z)</option>
            </Select>
            <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={load}>Làm mới</Button>
          </div>
        }
      />

      {meta.overdueCount > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <AlertTriangle size={16} /> Có {meta.overdueCount} lịch chưa xử lý quá 12 giờ — luôn xếp đầu danh sách (trang 1).
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={32} />}
          title="Không còn lịch nào chờ xác nhận"
          description="Mọi lịch đặt online đã được xử lý."
        />
      ) : (
        <>
        <div className="table-wrap hidden md:block">
          <table className="table">
            <thead><tr><th>Mã / thời gian</th><th>Khách hàng</th><th>Dịch vụ</th><th>Chuyên viên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{sorted.map(a => <tr key={a.id} className={a.pendingOverdue ? 'bg-amber-50/70' : undefined}>
              <td><span className="flex items-center gap-1 font-semibold">{a.pendingOverdue && <AlertTriangle size={13} className="text-amber-600" aria-label="Quá hạn 12 giờ" />}{a.code}</span><span className="text-xs text-ink-muted">{a.startAtText}</span></td>
              <td>{a.customer.fullName}<span className="block text-xs text-ink-muted">{a.customer.phone}</span></td>
              <td>{a.services.map(s => s.name).join(', ')}<span className="block text-xs text-ink-muted">{formatDuration(a.totalDurationMinutes)}</span></td>
              <td>{a.stylist.fullName}</td><td><StatusBadge status={a.status} /></td>
              <td><div className="flex gap-1"><Button size="sm" onClick={() => setSelected(a)}>Xử lý</Button><Button size="sm" variant="outline" onClick={() => confirm(a)}>Xác nhận</Button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-2.5 md:hidden">
          {sorted.map((a) => (
            <Card key={a.id} className={`p-4 ${a.pendingOverdue ? 'ring-2 ring-amber-300' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs tracking-widest text-ink-muted">{a.code}</p>
                  <p className="mt-0.5 font-bold">{a.startAtText}</p>
                  <p className="text-sm text-ink-soft">
                    {a.customer.fullName} · {a.customer.phone}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {a.services.map((s) => s.name).join(', ')} · {formatDuration(a.totalDurationMinutes)} · thợ {a.stylist.fullName}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setSelected(a)}>Xử lý</Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => confirm(a)}
                >
                  Xác nhận nhanh
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <Pagination page={page} totalPages={meta.totalPages} total={meta.total} onChange={setPage}
                    limit={limit} onLimitChange={(n) => { setLimit(n); setPage(1); }} />
        </>
      )}

      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
