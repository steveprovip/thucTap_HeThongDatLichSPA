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
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useSwr } from '@/hooks/useSwr';
import { swrStore } from '@/utils/swrStore';
import { AppointmentDrawer } from './AppointmentDrawer';

const STATUSES: AppointmentStatus[] = [
  'pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show',
];

type Page = { items: Appointment[]; total: number; totalPages: number };
const KEY_PREFIX = 'appointments:list:';

const ADVANCE: Partial<Record<AppointmentStatus, (id: string) => Promise<unknown>>> = {
  confirmed: (id) => appointmentsApi.confirm(id),
  arrived: (id) => appointmentsApi.checkIn(id),
  in_progress: (id) => appointmentsApi.start(id),
  completed: (id) => appointmentsApi.complete(id),
};

const withStatus = (page: Page, id: string, status: AppointmentStatus): Page =>
  ({ ...page, items: page.items.map((it) => (it.id === id ? { ...it, status } : it)) });

/**
 * Danh sách lịch hẹn — Command Center (RFC-2026-SPA-V3 · Pillar I.5 + II.1):
 *  - Stale-while-revalidate: đổi bộ lọc / trang đã xem → hiện ngay bản đệm; chưa có đệm → giữ bảng cũ mờ nhẹ, không khung chờ.
 *    Khung chờ chỉ ở lần mở đầu tiên. Phản hồi cũ về muộn bị bỏ (request mới nhất thắng).
 *  - Chuyển trạng thái 1 chạm lạc quan THEO TỪNG DÒNG: dòng đổi ngay; lỗi chỉ trả lại đúng dòng đó (bản trước đây chụp cả
 *    bảng rồi khôi phục → bấm nhanh hai dòng thì lỗi dòng này xoá luôn thay đổi của dòng kia). Đồng bộ ngầm từ SSE về giữa
 *    chừng không làm dòng "nháy" về trạng thái cũ.
 */
export function AppointmentsListPage() {
  const [params] = useSearchParams();
  const [from, setFrom] = useState(params.get('date') ?? addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(params.get('date') ?? todayISO());
  const [status, setStatus] = useState<string>(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<Appointment | null>(null);
  /** Trạng thái đang chờ máy chủ xác nhận, theo mã lịch (đè lên dữ liệu máy chủ cho tới khi xong). */
  const [pending, setPending] = useState<Record<string, AppointmentStatus>>({});
  const toast = useToast();

  // Gõ tìm kiếm: debounce 300ms trước khi đổi khoá truy vấn
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [search]);

  const key = `${KEY_PREFIX}${JSON.stringify({ from, to, status, query, page, limit })}`;
  const fetcher = useCallback(() => appointmentsApi.list({
    from, to, status: (status || undefined) as AppointmentStatus | undefined, search: query || undefined, page, limit,
  }), [from, to, status, query, page, limit]);
  const { data, error, isLoading, isValidating, isStale, revalidate, mutate } = useSwr<Page>(key, fetcher);

  useEffect(() => { if (error) toast.error(getErrorMessage(error)); }, [error, toast]);

  // Đồng bộ ngầm qua SSE/LiveSync (chỉ kênh lịch hẹn / ca / hoá đơn), gom nhịp 150ms
  useRealtimeSync({ domains: ['appointments', 'shifts', 'invoices'], onSync: revalidate });

  const advance = async (id: string, next: AppointmentStatus) => {
    const call = ADVANCE[next];
    if (!call || pending[id]) return;
    setPending((p) => ({ ...p, [id]: next }));
    try {
      await call(id);
      mutate((d) => withStatus(d, id, next));
      // Các trang / bộ lọc khác đã đệm cũng có lịch này → sửa luôn, lần mở lại không thấy trạng thái cũ
      swrStore.update<Page>((k) => k.startsWith(KEY_PREFIX), (d) => withStatus(d, id, next));
      toast.success(`Đã cập nhật: ${STATUS_CONFIG[next]?.label ?? next}`);
      // axios interceptor đã phát sự kiện đổi dữ liệu → các màn hình khác (và bảng này) tải lại ngầm
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle title="Danh sách lịch hẹn" description="Lọc theo khoảng ngày, trạng thái, mã tra cứu, tên hoặc số điện thoại khách." />
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

      {isLoading ? <TableSkeleton cols={7} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<CalendarSearch size={30} />} title="Không có lịch hẹn nào khớp bộ lọc" />
      ) : (
        <div className={`relative transition-opacity duration-200 ${isStale ? 'opacity-60' : 'opacity-100'}`} aria-busy={isValidating}>
          {/* Thanh tiến trình mảnh thay cho khung chờ khi tải lại ngầm */}
          <span aria-hidden className={`absolute inset-x-0 -top-1.5 h-0.5 overflow-hidden rounded-full transition-opacity duration-200 ${isValidating ? 'opacity-100' : 'opacity-0'}`}>
            <span className="animate-progress block h-full w-1/3 bg-teal-600" />
          </span>
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
                  <tr key={a.id} className={pending[a.id] ? 'bg-teal-50/40' : ''}>
                    <td className="font-mono text-xs">{a.code}</td>
                    <td className="tnum whitespace-nowrap text-xs">{a.startAtText}</td>
                    <td>
                      <span className="block min-w-0 max-w-[150px] truncate font-medium" title={a.customer.fullName}>
                        {a.customer.fullName}
                      </span>
                      <span className="tnum text-xs text-ink-muted">{a.customer.phone}</span>
                    </td>
                    <td className="min-w-0 max-w-[130px] truncate text-sm" title={a.stylist.fullName}>
                      {a.stylist.fullName}
                    </td>
                    <td className="max-w-[240px] text-xs">
                      <ServicePills services={a.services} maxVisible={2} />
                      <span className="mt-0.5 block text-[11px] text-ink-muted">{formatDuration(a.totalDurationMinutes)}</span>
                    </td>
                    <td>
                      <AppointmentStatusControl
                        appointmentId={a.id}
                        status={pending[a.id] ?? a.status}
                        busy={!!pending[a.id]}
                        onAdvance={(id, next) => void advance(id, next)}
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
        </div>
      )}

      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={() => void revalidate()} />
    </div>
  );
}
