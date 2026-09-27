import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { getErrorMessage, invoicesApi } from '@/api';
import type { Invoice } from '@/types';
import { Button, EmptyState, Pagination, SectionTitle, TableSkeleton } from '@/components';
import { formatDateTime, todayISO, addDaysISO } from '@/utils/format';
import { PAYMENT_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';
import { useAppointmentsSync } from '@/utils/liveSync';

export function InvoiceListPage() {
  const [from, setFrom] = useState(addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Invoice[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await invoicesApi.list({ from, to, page, limit: 20 }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, page, toast]);

  useEffect(() => { void load(); }, [load]);
  useAppointmentsSync(() => { void load(); });

  return (
    <div className="space-y-3">
      <SectionTitle title="Phiếu tính tiền" description="Danh sách phiếu đã lập trong khoảng ngày." />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="field-label">Từ ngày</span>
          <input type="date" className="field-input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="text-sm">
          <span className="field-label">Đến ngày</span>
          <input type="date" className="field-input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
      </div>

      {loading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<Receipt size={30} />} title="Chưa có phiếu nào trong khoảng ngày này" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã phiếu</th><th>Thời điểm</th><th>Khách</th><th>Thợ</th>
                  <th className="text-right">Thực thu</th><th>Hình thức</th><th>Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs">{i.code}</td>
                    <td className="whitespace-nowrap">{formatDateTime(i.createdAt)}</td>
                    <td>{i.customerName}</td>
                    <td>{i.stylistName}</td>
                    <td className="text-right font-semibold">{i.totalText}</td>
                    <td>{i.paymentMethod ? PAYMENT_LABELS[i.paymentMethod] : '—'}</td>
                    <td>{i.statusLabel}</td>
                    <td>
                      <Button size="sm" variant="ghost"
                              onClick={() => navigate(`/quan-ly/phieu-tinh-tien/${i.appointmentId}`)}>
                        Mở
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
