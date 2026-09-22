import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { auditApi, getErrorMessage } from '@/api';
import type { AuditLogRow } from '@/types';
import { Button, EmptyState, Pagination, SectionTitle, Spinner } from '@/components';
import { addDaysISO, formatDateTime, todayISO } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

const ACTION_LABELS: Record<string, string> = {
  create: 'Tạo mới', update: 'Cập nhật', delete: 'Xoá', login: 'Đăng nhập', logout: 'Đăng xuất', view: 'Xem',
};

/** S1-09: nhật ký CHỈ ĐỌC — không vai trò nào sửa hay xoá được, kể cả Admin. */
export function AuditLogsPage() {
  const [from, setFrom] = useState(addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditLogRow[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await auditApi.list({ from, to, page, limit: 50 }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, page, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Nhật ký hoạt động"
        description="Ghi lại thao tác tạo, sửa, xoá trên tài khoản, dịch vụ, ca làm, lịch hẹn và phiếu tính tiền. Nhật ký chỉ đọc."
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="field-label">Từ ngày</span>
          <input type="date" className="field-input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="text-sm">
          <span className="field-label">Đến ngày</span>
          <input type="date" className="field-input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
        <Button variant="outline" onClick={load} loading={loading}>Lọc</Button>
      </div>

      {loading ? <Spinner /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<ScrollText size={30} />} title="Không có bản ghi nào trong khoảng ngày này" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Thời điểm</th><th>Tài khoản</th><th>Thao tác</th><th>Đối tượng</th>
                    <th>Tóm tắt</th><th>IP</th></tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                    <td className="text-xs">
                      {r.actorEmail ?? 'Hệ thống'}
                      {r.actorRole && <span className="block text-ink-muted">{ROLE_LABELS[r.actorRole]}</span>}
                    </td>
                    <td className="text-xs">{ACTION_LABELS[r.action] ?? r.action}</td>
                    <td className="text-xs">
                      {r.entityType}
                      {r.entityId && <span className="block font-mono text-[11px] text-ink-muted">{r.entityId.slice(0, 8)}…</span>}
                    </td>
                    <td className="text-xs">{r.summary}</td>
                    <td className="font-mono text-[11px] text-ink-muted">{r.ipAddress ?? '—'}</td>
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
