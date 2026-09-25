import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, RefreshCw } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment } from '@/types';
import { Button, Card, EmptyState, SectionTitle, Spinner, StatusBadge } from '@/components';
import { formatDuration } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { AppointmentDrawer } from './AppointmentDrawer';

/** S3-02: danh sách riêng các lịch đặt online đang chờ xác nhận. */
export function PendingPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await appointmentsApi.pending());
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const overdue = items.filter((i) => i.pendingOverdue);
  const confirm = async (a: Appointment) => {
    try { await appointmentsApi.confirm(a.id); toast.success(`Đã xác nhận lịch ${a.code}`); void load(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Lịch chờ xác nhận"
        description="Lịch khách đặt online vào đây trước, tiệm chủ động xác nhận hoặc từ chối."
        action={<Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={load}>Làm mới</Button>}
      />

      {overdue.length > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <AlertTriangle size={16} /> Có {overdue.length} lịch chưa xử lý quá 12 giờ.
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
            <tbody>{items.map(a => <tr key={a.id}>
              <td><span className="block font-semibold">{a.code}</span><span className="text-xs text-ink-muted">{a.startAtText}</span></td>
              <td>{a.customer.fullName}<span className="block text-xs text-ink-muted">{a.customer.phone}</span></td>
              <td>{a.services.map(s => s.name).join(', ')}<span className="block text-xs text-ink-muted">{formatDuration(a.totalDurationMinutes)}</span></td>
              <td>{a.stylist.fullName}</td><td><StatusBadge status={a.status} /></td>
              <td><div className="flex gap-1"><Button size="sm" onClick={() => setSelected(a)}>Xử lý</Button><Button size="sm" variant="outline" onClick={() => confirm(a)}>Xác nhận</Button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-2.5 md:hidden">
          {items.map((a) => (
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
        </>
      )}

      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
