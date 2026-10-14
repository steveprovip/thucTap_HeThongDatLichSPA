import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarSearch, Search } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, AppointmentStatus } from '@/types';
import { Button, EmptyState, Input, Pagination, SectionTitle, Select, TableSkeleton } from '@/components';
import {
  AppointmentStatusControl,
  ServicePills,
  STATUS_CONFIG,
} from '@/components/appointments/AppointmentStatusControl';
import { STATUS_LABELS } from '@/utils/constants';
import { addDaysISO, formatDuration, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { notifyAppointmentsChanged } from '@/utils/liveSync';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { AppointmentDrawer } from './AppointmentDrawer';

const STATUSES: AppointmentStatus[] = [
  'pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show',
];

export function AppointmentsListPage() {
  const [params] = useSearchParams();
  const [from, setFrom] = useState(params.get('date') ?? addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(params.get('date') ?? todayISO());
  const [status, setStatus] = useState<string>(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<{ items: Appointment[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const toast = useToast();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await appointmentsApi.list({
        from, to, status: (status || undefined) as AppointmentStatus | undefined,
        search: search.trim() || undefined, page, limit,
      }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [from, to, status, search, page, limit, toast]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);

  // Đồng bộ ngầm qua SSE/LiveSync gom nhịp 150ms, không làm giật skeleton
  const { isConnected } = useRealtimeSync({
    domains: ['appointments', 'shifts', 'invoices'],
    onSync: () => load(true),
  });

  // Chuyển trạng thái 1-chạm lạc quan (Optimistic UI < 16ms), tự hoàn tác nếu API báo lỗi
  const handleOptimisticStatusChange = async (id: string, nextStatus: AppointmentStatus) => {
    if (!data) return;
    const oldData = { ...data, items: [...data.items] };

    setData({
      ...data,
      items: data.items.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
    });

    try {
      if (nextStatus === 'confirmed') await appointmentsApi.confirm(id);
      else if (nextStatus === 'arrived') await appointmentsApi.checkIn(id);
      else if (nextStatus === 'in_progress') await appointmentsApi.start(id);
      else if (nextStatus === 'completed') await appointmentsApi.complete(id);

      const label = STATUS_CONFIG[nextStatus]?.label ?? nextStatus;
      toast.success(`Đã cập nhật: ${label}`);
      notifyAppointmentsChanged();
    } catch (e) {
      setData(oldData);
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle title="Danh sách lịch hẹn" description="Lọc theo khoảng ngày, trạng thái, mã tra cứu, tên hoặc số điện thoại khách." />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5F1EA] border border-[#E7E0D6] text-xs text-[#574B3A] shrink-0">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#2E7D47] animate-pulse' : 'bg-[#B48A3E]'}`} />
          <span className="font-medium">
            {isConnected ? 'Đồng bộ trực tiếp (Live)' : 'Đang kết nối lại...'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="field-label">Từ ngày</span>
          <input type="date" className="field-input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="text-sm"><span className="field-label">Đến ngày</span>
          <input type="date" className="field-input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        <label className="text-sm"><span className="field-label">Trạng thái</span>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="min-w-[160px]">
            <option value="">Tất cả</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select></label>
        <div className="relative min-w-[220px] flex-1">
          <span className="field-label">Tìm kiếm</span>
          <Search size={16} className="pointer-events-none absolute bottom-3 left-3 text-ink-muted" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                 placeholder="Mã, tên hoặc số điện thoại" className="pl-10" />
        </div>
      </div>

      {loading ? <TableSkeleton cols={7} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<CalendarSearch size={30} />} title="Không có lịch hẹn nào khớp bộ lọc" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Thời gian</th>
                  <th>Khách</th>
                  <th>Thợ</th>
                  <th>Dịch vụ</th>
                  <th>Trạng thái & Bước kế</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.code}</td>
                    <td className="whitespace-nowrap text-xs">{a.startAtText}</td>
                    <td>
                      <span className="block font-medium min-w-0 truncate max-w-[150px]" title={a.customer.fullName}>
                        {a.customer.fullName}
                      </span>
                      <span className="text-xs text-ink-muted">{a.customer.phone}</span>
                    </td>
                    <td className="text-sm min-w-0 truncate max-w-[130px]" title={a.stylist.fullName}>
                      {a.stylist.fullName}
                    </td>
                    <td className="max-w-[240px] text-xs">
                      <ServicePills services={a.services} maxVisible={2} />
                      <span className="block text-ink-muted text-[11px] mt-0.5">{formatDuration(a.totalDurationMinutes)}</span>
                    </td>
                    <td>
                      <AppointmentStatusControl
                        appointmentId={a.id}
                        status={a.status}
                        onStatusChange={handleOptimisticStatusChange}
                        compact
                      />
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" className="spa-interactive-btn" onClick={() => setSelected(a)}>
                        Mở
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage}
                      limit={limit} onLimitChange={(n) => { setLimit(n); setPage(1); }} />
        </>
      )}

      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={() => load(true)} />
    </div>
  );
}
