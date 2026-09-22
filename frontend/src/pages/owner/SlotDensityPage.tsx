import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi, getErrorMessage } from '@/api';
import type { SlotDensityReport } from '@/types';
import { Button, Card, SectionTitle, Spinner } from '@/components';
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

      {loading ? <Spinner /> : !data ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Tổng lịch hẹn</p>
              <p className="mt-1 text-xl font-bold">{data.noShow.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Tỉ lệ không đến</p>
              <p className="mt-1 text-xl font-bold text-red-600">{data.noShow.noShowRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.noShow} lượt</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Tỉ lệ huỷ</p>
              <p className="mt-1 text-xl font-bold text-amber-600">{data.noShow.cancelRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.cancelled} lượt</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Tỉ lệ hoàn tất</p>
              <p className="mt-1 text-xl font-bold text-green-700">{data.noShow.completionRate.toFixed(1)}%</p>
              <p className="text-xs text-ink-muted">{data.noShow.completed} lượt</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="mb-3 text-sm font-bold">Số lượt hẹn theo khung giờ — ngày thường so với cuối tuần</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.density} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9d1bc" />
                  <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="weekdayCount" name="Thứ 2 – Thứ 6" fill="#8c5a3c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="weekendCount" name="Thứ 7 & Chủ nhật" fill="#c68d66" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
