import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarSearch, Search } from 'lucide-react';
import { appointmentsApi, getErrorMessage } from '@/api';
import type { Appointment, AppointmentStatus } from '@/types';
import { Button, EmptyState, Input, Pagination, SectionTitle, Select, StatusBadge, TableSkeleton } from '@/components';
import { STATUS_LABELS } from '@/utils/constants';
import { addDaysISO, formatDuration, todayISO } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';
import { useAppointmentsSync } from '@/utils/liveSync';
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await appointmentsApi.list({
        from, to, status: (status || undefined) as AppointmentStatus | undefined,
        search: search.trim() || undefined, page, limit,
      }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, status, search, page, limit, toast]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);
  // Lỗi 6: lịch vãng lai / thay đổi ở màn hình khác hiện ngay trong danh sách
  useAppointmentsSync(() => { void load(); });

  return (
    <div className="space-y-3">
      <SectionTitle title="Danh sách lịch hẹn" description="Lọc theo khoảng ngày, trạng thái, mã tra cứu, tên hoặc số điện thoại khách." />

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

      {loading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<CalendarSearch size={30} />} title="Không có lịch hẹn nào khớp bộ lọc" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Mã</th><th>Thời gian</th><th>Khách</th><th>Thợ</th><th>Dịch vụ</th>
                    <th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.code}</td>
                    <td className="whitespace-nowrap text-xs">{a.startAtText}</td>
                    <td>
                      <span className="block">{a.customer.fullName}</span>
                      <span className="text-xs text-ink-muted">{a.customer.phone}</span>
                    </td>
                    <td className="text-sm">{a.stylist.fullName}</td>
                    <td className="max-w-[220px] truncate text-xs">
                      {a.services.map((s) => s.name).join(', ')}
                      <span className="block text-ink-muted">{formatDuration(a.totalDurationMinutes)}</span>
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><Button size="sm" variant="ghost" onClick={() => setSelected(a)}>Mở</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage}
                      limit={limit} onLimitChange={(n) => { setLimit(n); setPage(1); }} />
        </>
      )}

      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
