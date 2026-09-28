import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Banknote, CheckCircle2, RefreshCw, UserX, Users2 } from 'lucide-react';
import { analyticsApi, appointmentsApi, customersApi, getErrorMessage } from '@/api';
import type { Appointment, AppointmentStatus, TodayDashboard } from '@/types';
import { Button, Card, EmptyState, SectionTitle, Skeleton, StatGridSkeleton, ContentSkeleton } from '@/components';
import { STATUS_LABELS, STATUS_STYLES } from '@/utils/constants';
import { formatTime, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { useAppointmentsSync } from '@/utils/liveSync';

const ORDER: AppointmentStatus[] = [
  'pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show',
];

/** S4-08: trang tổng quan của ngày hôm nay, tự làm mới mỗi 60 giây. */
export function DashboardPage() {
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [activeClients, setActiveClients] = useState(0);
  const [activity, setActivity] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Chỉ số chính là bắt buộc; số khách & hoạt động gần đây lỗi thì vẫn hiển thị trang
      const [dashboard, clients, recent] = await Promise.all([
        analyticsApi.today(),
        customersApi.search({ page: 1, limit: 1 }).then((r) => r.total).catch(() => null),
        appointmentsApi.list({ from: todayISO(), to: todayISO(), page: 1, limit: 5 }).then((r) => r.items).catch(() => [] as Appointment[]),
      ]);
      setData(dashboard);
      if (clients !== null) setActiveClients(clients);
      setActivity(recent);
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
  useAppointmentsSync(() => { void load(true); });

  if (loading) return <div className="space-y-5"><Skeleton className="h-7 w-56" /><StatGridSkeleton /><ContentSkeleton rows={5} label="Đang tải hoạt động gần đây…" /></div>;
  if (!data) {
    return (
      <EmptyState icon={<RefreshCw size={26} />} title="Chưa tải được số liệu hôm nay"
                  description="Máy chủ chưa phản hồi. Kiểm tra backend đang chạy rồi thử lại."
                  action={<Button size="sm" icon={<RefreshCw size={15} />} onClick={() => load()}>Thử lại</Button>} />
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Tổng quan hôm nay"
        description={`Số liệu tự làm mới mỗi 60 giây · cập nhật lúc ${formatTime(data.refreshedAt)}`}
        action={<Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => load()}>Làm mới</Button>}
      />

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Doanh thu đã thu" value={data.revenueText} valueClass="text-slate-900"
          icon={<Banknote size={18} />} tone="from-teal-50 to-emerald-100 text-teal-700"
          hint={`${data.invoiceCount} phiếu đã đóng`} />
        <MetricCard label="Lượt hoàn tất" value={String(data.statuses.completed)}
          icon={<CheckCircle2 size={18} />} tone="from-emerald-50 to-green-100 text-emerald-700"
          hint={`Trên ${data.totalAppointments} lịch hôm nay`} />
        <MetricCard label="Khách hàng đang quản lý" value={String(activeClients)}
          icon={<Users2 size={18} />} tone="from-sky-50 to-blue-100 text-blue-700"
          hint={`${data.workingStylists} chuyên viên hoạt động`} />
        <MetricCard label="Tỷ lệ không đến" valueClass="text-rose-600"
          value={`${data.totalAppointments ? (data.statuses.no_show * 100 / data.totalAppointments).toFixed(1) : '0.0'}%`}
          icon={<UserX size={18} />} tone="from-rose-50 to-pink-100 text-rose-600"
          hint={`${data.statuses.no_show} lượt trong ngày`} />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Hoạt động gần đây</h3>
        <ol className="stagger divide-y divide-slate-100">
          {activity.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-slate-600">
            <span><strong className="font-semibold text-slate-900">{item.customer.fullName}</strong> · {item.services.map(service => service.name).join(', ')}</span>
            <span className="text-slate-500">{item.startTime} · {item.statusLabel}</span>
          </li>)}
        </ol>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Lịch hẹn theo trạng thái — bấm để mở danh sách</p>
        <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {ORDER.map((s) => (
            <button
              key={s}
              onClick={() => navigate(`/quan-ly/lich-hen?status=${s}&date=${todayISO()}`)}
              className={`rounded-2xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-card ${STATUS_STYLES[s]}`}
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

function MetricCard({ label, value, hint, icon, tone, valueClass = 'text-slate-900' }: {
  label: string; value: string; hint: string; icon: ReactNode; tone: string; valueClass?: string;
}) {
  return (
    <Card className="lift p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
