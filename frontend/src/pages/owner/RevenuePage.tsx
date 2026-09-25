import { useCallback, useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Download, TrendingUp } from 'lucide-react';
import { analyticsApi, getErrorMessage, reviewsApi } from '@/api';
import type { RevenueReport, StylistRating } from '@/types';
import { Button, Card, EmptyState, SectionTitle, Skeleton, StatGridSkeleton } from '@/components';
import { formatVnd, formatVndShort } from '@/utils/format';
import { useToast } from '@/contexts/ToastContext';

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Một chuỗi số liệu dùng MỘT màu — màu khác nhau chỉ dành cho các nhóm khác nhau. */
const BAR_COLOR = '#0D9488';
const GRID = '#E2E8F0';
const AXIS_TICK = { fontSize: 11, fill: '#64748B' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 8px 24px -8px rgba(15,23,42,0.15)', fontSize: 12 };

/** S4-07: doanh thu theo thợ và theo dịch vụ, xuất CSV UTF-8. */
export function RevenuePage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<RevenueReport | null>(null);
  const [ratings, setRatings] = useState<StylistRating[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, rate] = await Promise.all([
        analyticsApi.revenue(from, to),
        reviewsApi.stylistRatings().catch(() => [] as StylistRating[]),
      ]);
      setData(report);
      setRatings(rate);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  const download = async (kind: 'stylists' | 'services' | 'invoices') => {
    try {
      await analyticsApi.downloadCsv(kind, from, to);
      toast.success('Đã tải tệp CSV (UTF-8, mở đúng tiếng Việt trên Excel)');
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Báo cáo doanh thu"
        description="Chỉ tính các phiếu đã đóng. Khoảng ngày tối đa 365 ngày một lần xem."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="field-label">Từ ngày</span>
            <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="field-label">Đến ngày</span>
            <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button onClick={load} loading={loading}>Xem báo cáo</Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => download('stylists')}>
              CSV theo thợ
            </Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => download('services')}>
              CSV theo dịch vụ
            </Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => download('invoices')}>
              CSV chi tiết phiếu
            </Button>
          </div>
        </div>
      </Card>

      {loading ? <div className="space-y-4"><StatGridSkeleton /><Skeleton className="h-72 rounded-2xl" /></div> : !data ? null : (
        <>
          <div className="stagger grid gap-3 sm:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thực thu</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-teal-700">{data.summary.totalText}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trước giảm giá</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{data.summary.subtotalText}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đã giảm</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-red-600">− {data.summary.discountText}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Số phiếu</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{data.summary.invoiceCount}</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <TrendingUp size={16} /> Doanh thu theo ngày
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.byDay} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                  <defs><linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.35} /><stop offset="100%" stopColor="#0D9488" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(8)} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatVndShort} width={56} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [formatVnd(v), 'Doanh thu']}
                    labelFormatter={(d: string) => `Ngày ${d}`}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#0D9488" strokeWidth={2.5} fill="url(#revenueFill)" name="Doanh thu" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-slate-900">Doanh thu theo thợ</p>
              {data.byStylist.length === 0 ? <EmptyState title="Chưa có dữ liệu" /> : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byStylist} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatVndShort} />
                        <YAxis type="category" dataKey="stylistName" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#F1F5F9' }} formatter={(v: number) => [formatVnd(v), 'Doanh thu']} />
                        <Bar dataKey="revenue" fill={BAR_COLOR} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="table-wrap mt-3">
                    <table className="table">
                      <thead>
                        <tr><th>Thợ</th><th className="text-right">Lượt</th>
                            <th className="text-right">Doanh thu</th><th className="text-right">TB/lượt</th>
                            <th className="text-right">Điểm</th></tr>
                      </thead>
                      <tbody>
                        {data.byStylist.map((r) => {
                          const rating = ratings.find((x) => x.stylistId === r.stylistId);
                          return (
                            <tr key={r.stylistId}>
                              <td>{r.stylistName}</td>
                              <td className="text-right">{r.completedCount}</td>
                              <td className="text-right font-semibold">{r.revenueText}</td>
                              <td className="text-right">{r.avgPerVisitText}</td>
                              <td className="text-right text-xs">{rating?.display ?? 'Chưa đủ dữ liệu'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-slate-900">Doanh thu theo dịch vụ</p>
              {data.byService.length === 0 ? <EmptyState title="Chưa có dữ liệu" /> : (
                <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byService} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatVndShort} />
                      <YAxis type="category" dataKey="serviceName" width={130} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#F1F5F9' }} formatter={(v: number) => [formatVnd(v), 'Doanh thu']} />
                      <Bar dataKey="revenue" fill="#F43F5E" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-wrap mt-3">
                  <table className="table">
                    <thead><tr><th>Dịch vụ</th><th className="text-right">Số lượt</th><th className="text-right">Doanh thu</th></tr></thead>
                    <tbody>
                      {data.byService.map((r) => (
                        <tr key={r.serviceName}>
                          <td>{r.serviceName}</td>
                          <td className="text-right">{r.quantity}</td>
                          <td className="text-right font-semibold">{r.revenueText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
