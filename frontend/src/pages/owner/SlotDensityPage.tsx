import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi, getErrorMessage } from '@/api';
import type { SlotDensityReport } from '@/types';
import { Button, Card, SectionTitle, Skeleton, StatGridSkeleton } from '@/components';
import { useToast } from '@/contexts/ToastContext';

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

/** S4-09: tỉ lệ khách không đến và phân bố lượt hẹn theo khung giờ. */
export function SlotDensityPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<SlotDensityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await analyticsApi.slotDensity(from, to));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Phân bố khung giờ & tỉ lệ không đến"
        description="Dùng để quyết định xếp thêm thợ vào cuối tuần dựa trên số liệu thật."
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
          <Button onClick={load} loading={loading}>Xem</Button>
        </div>
      </Card>

      {loading ? <div className="space-y-4"><Skeleton className="h-80 rounded-2xl" /><StatGridSkeleton /></div> : !data ? null : (
        <>
          {data.weeklyDensity && <Card className="overflow-x-auto p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Mật độ lịch theo thứ và giờ</h3>
            <table className="w-full min-w-[580px] border-separate border-spacing-1 text-center text-xs">
              <thead><tr><th className="p-2 text-left">Giờ</th>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{Array.from({ length: 12 }, (_, index) => index + 9).map(hour => <tr key={hour}>
                <th className="p-2 text-left font-medium">{String(hour).padStart(2, '0')}:00</th>
                {[1, 2, 3, 4, 5, 6, 0].map(weekday => {
                  const count = data.weeklyDensity?.find(cell => cell.weekday === weekday && cell.hour === hour)?.count ?? 0;
                  return <td key={weekday} title={`${count} lịch lúc ${hour}:00`} className={`rounded-lg p-2 font-semibold ${count >= 2 ? 'text-white' : count ? 'text-teal-900' : 'text-slate-300'}`}
                    style={{ backgroundColor: count ? `rgba(13, 148, 136, ${Math.min(0.18 + count * 0.2, 0.9)})` : '#F8FAFC' }}>{count || '·'}</td>;
                })}
              </tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Ô đậm hơn có nhiều lịch hẹn hơn trong khoảng ngày đã chọn.</p>
          </Card>}
          <div className="stagger grid gap-3 sm:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng lịch hẹn</p>
              <p className="mt-1 text-xl font-bold">{data.noShow.total}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tỉ lệ không đến</p>
              <p className="mt-1 text-xl font-bold text-red-600">{data.noShow.noShowRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.noShow} lượt</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tỉ lệ huỷ</p>
              <p className="mt-1 text-xl font-bold text-amber-600">{data.noShow.cancelRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.cancelled} lượt</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tỉ lệ hoàn tất</p>
              <p className="mt-1 text-xl font-bold text-green-700">{data.noShow.completionRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.completed} lượt</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Số lượt hẹn theo khung giờ — ngày thường so với cuối tuần</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.density} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} cursor={{ fill: '#F1F5F9' }} />
                  <Legend />
                  <Bar dataKey="weekdayCount" name="Thứ 2 – Thứ 6" fill="#0D9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="weekendCount" name="Thứ 7 & Chủ nhật" fill="#FB7185" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
