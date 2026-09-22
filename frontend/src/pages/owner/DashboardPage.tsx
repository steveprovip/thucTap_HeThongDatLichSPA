import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, RefreshCw, Users2 } from 'lucide-react';
import { analyticsApi, getErrorMessage } from '@/api';
import type { AppointmentStatus, TodayDashboard } from '@/types';
import { Button, Card, SectionTitle, Spinner } from '@/components';
import { STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';
import { formatTime, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

const ORDER: AppointmentStatus[] = [
  'pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show',
];

/** S4-08: trang tổng quan của ngày hôm nay, tự làm mới mỗi 60 giây. */
export function DashboardPage() {
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await analyticsApi.today());
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading) return <Spinner label="Đang tải số liệu hôm nay…" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Tổng quan hôm nay"
        description={`Số liệu tự làm mới mỗi 60 giây · cập nhật lúc ${formatTime(data.refreshedAt)}`}
        action={<Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => load()}>Làm mới</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Doanh thu đã thu</p>
          <p className="mt-1 text-2xl font-bold text-brand-800">{data.revenueText}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <Banknote size={13} /> {data.invoiceCount} phiếu đã đóng
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Lịch hẹn hôm nay</p>
          <p className="mt-1 text-2xl font-bold">{data.totalAppointments}</p>
          <p className="mt-0.5 text-xs text-ink-muted">Tính cả lịch đã huỷ và không đến</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Thợ đang làm theo ca</p>
          <p className="mt-1 text-2xl font-bold">{data.workingStylists}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <Users2 size={13} /> Có ca làm trong ngày
          </p>
        </Card>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Lịch hẹn theo trạng thái — bấm để mở danh sách</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ORDER.map((s) => (
            <button
              key={s}
              onClick={() => navigate(`/quan-ly/lich-hen?status=${s}&date=${todayISO()}`)}
              className={`rounded-2xl border p-3 text-left transition-shadow hover:shadow-card ${STATUS_STYLES[s]}`}
            >
              <span className="block text-2xl font-bold">{data.statuses[s]}</span>
              <span className="block text-xs font-medium">{STATUS_LABELS[s]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
