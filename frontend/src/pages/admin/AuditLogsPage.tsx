import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Filter, Lock, RotateCcw, ScrollText } from 'lucide-react';
import { auditApi, getErrorMessage, usersApi } from '@/api';
import type { AuditLogRow, UserRow } from '@/types';
import { Button, Card, EmptyState, Field, Pagination, SectionTitle, Select, TableSkeleton } from '@/components';
import { addDaysISO, formatDateTime, todayISO } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/constants';
import { useToast } from '@/contexts/ToastContext';

/** Nhãn tiếng Việt cho mã thao tác máy chủ ghi lại. */
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xoá', LOGIN: 'Đăng nhập', LOGOUT: 'Đăng xuất',
  CONFIRM: 'Xác nhận lịch', REJECT: 'Từ chối lịch', CANCEL: 'Huỷ lịch', 'CHECK-IN': 'Check-in',
  START: 'Bắt đầu dịch vụ', COMPLETE: 'Hoàn tất dịch vụ', 'NO-SHOW': 'Báo không đến',
  'UNDO-NO-SHOW': 'Hoàn tác không đến', RESCHEDULE: 'Đổi thợ / dời giờ', BULK_REASSIGN: 'Chuyển lịch hàng loạt',
  'SERVICE-NOTE': 'Ghi chú kỹ thuật',
};

const ACTION_TONE: Record<string, string> = {
  CREATE: 'border-emerald-200 bg-emerald-50 text-emerald-700', UPDATE: 'border-sky-200 bg-sky-50 text-sky-800',
  DELETE: 'border-red-200 bg-red-50 text-red-700', CANCEL: 'border-red-200 bg-red-50 text-red-700',
  REJECT: 'border-red-200 bg-red-50 text-red-700', 'NO-SHOW': 'border-red-200 bg-red-50 text-red-700',
  BULK_REASSIGN: 'border-amber-200 bg-amber-50 text-amber-800', RESCHEDULE: 'border-violet-200 bg-violet-50 text-violet-800',
};

const ENTITY_LABELS: Record<string, string> = {
  appointment: 'Lịch hẹn', service: 'Dịch vụ', category: 'Nhóm dịch vụ', stylist: 'Thợ', shift: 'Ca làm',
  invoice: 'Phiếu tính tiền', user: 'Tài khoản', voucher: 'Mã giảm giá', review: 'Đánh giá', holiday: 'Ngày nghỉ',
};

const PRESETS = [
  { label: 'Hôm nay', days: 0 },
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
];

const actionLabel = (a: string) => ACTION_LABELS[a.toUpperCase()] ?? a;

/** S1-09: nhật ký CHỈ ĐỌC — không vai trò nào sửa hay xoá được, kể cả Quản trị. */
export function AuditLogsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(todayISO());
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [data, setData] = useState<{ items: AuditLogRow[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    usersApi.list({ limit: 200 }).then((r) => setUsers(r.items)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await auditApi.list({
        from, to, page, limit: 25,
        actor: actor || undefined, action: action || undefined, entityType: entityType || undefined,
      }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, page, actor, action, entityType, toast]);

  useEffect(() => { void load(); }, [load]);

  const update = (fn: () => void) => { fn(); setPage(1); setExpanded(null); };
  const rangeError = from > to ? 'Ngày bắt đầu phải trước ngày kết thúc' : undefined;
  const activeFilters = [actor, action, entityType].filter(Boolean).length;

  const reset = () => update(() => {
    setFrom(addDaysISO(todayISO(), -7)); setTo(todayISO()); setActor(''); setAction(''); setEntityType('');
  });

  const exportCsv = () => {
    if (!data?.items.length) return;
    const rows = [['Thời điểm', 'Tài khoản', 'Vai trò', 'Thao tác', 'Đối tượng', 'Tóm tắt', 'IP'],
      ...data.items.map((r) => [formatDateTime(r.createdAt), r.actorEmail ?? 'Hệ thống / Khách',
        r.actorRole ? ROLE_LABELS[r.actorRole] : '', actionLabel(r.action),
        ENTITY_LABELS[r.entityType] ?? r.entityType, r.summary, r.ipAddress ?? ''])];
    const csv = `\ufeff${rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `nhat-ky_${from}_${to}_trang-${page}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Nhật ký hoạt động"
        description="Ghi lại thao tác trên tài khoản, dịch vụ, ca làm, lịch hẹn và phiếu tính tiền."
        action={
          <div className="flex items-center gap-2">
            <span className="chip border border-slate-300 bg-slate-100 text-slate-600"><Lock size={12} /> Chỉ đọc</span>
            <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={exportCsv}
                    disabled={!data?.items.length}>
              Xuất CSV
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter size={15} className="text-teal-600" />
          <span className="text-sm font-semibold">Bộ lọc</span>
          {PRESETS.map((p) => (
            <button key={p.label}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-ink-soft hover:border-teal-600 hover:text-teal-700"
                    onClick={() => update(() => { setFrom(addDaysISO(todayISO(), -p.days)); setTo(todayISO()); })}>
              {p.label}
            </button>
          ))}
          {(activeFilters > 0 || from !== addDaysISO(todayISO(), -7) || to !== todayISO()) && (
            <button className="ml-auto inline-flex items-center gap-1 text-xs text-teal-700 hover:underline" onClick={reset}>
              <RotateCcw size={12} /> Xoá bộ lọc
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Người thực hiện">
            <Select value={actor} onChange={(e) => update(() => setActor(e.target.value))}>
              <option value="">Tất cả tài khoản</option>
              {users.map((u) => <option key={u.id} value={u.email}>{u.fullName} ({ROLE_LABELS[u.role]})</option>)}
            </Select>
          </Field>
          <Field label="Loại thao tác">
            <Select value={action} onChange={(e) => update(() => setAction(e.target.value))}>
              <option value="">Mọi thao tác</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Đối tượng">
            <Select value={entityType} onChange={(e) => update(() => setEntityType(e.target.value))}>
              <option value="">Mọi đối tượng</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Từ ngày" error={rangeError}>
            <input type="date" className="field-input" value={from} max={to}
                   onChange={(e) => update(() => setFrom(e.target.value))} />
          </Field>
          <Field label="Đến ngày">
            <input type="date" className="field-input" value={to} min={from} max={todayISO()}
                   onChange={(e) => update(() => setTo(e.target.value))} />
          </Field>
        </div>
      </Card>

      {loading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<ScrollText size={30} />} title="Không có bản ghi nào khớp bộ lọc"
                    description="Thử mở rộng khoảng ngày hoặc bỏ bớt điều kiện lọc." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th className="w-8" /><th>Thời điểm</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th>
                    <th>Tóm tắt</th><th>IP</th></tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                        <td className="text-ink-muted">
                          <button aria-expanded={isOpen} aria-label={isOpen ? 'Thu gọn' : 'Xem chi tiết'}
                                  className="rounded p-1 hover:bg-slate-100">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                        <td className="text-xs">
                          {r.actorEmail ?? <span className="text-ink-muted">Hệ thống / Khách</span>}
                          {r.actorRole && <span className="block text-ink-muted">{ROLE_LABELS[r.actorRole]}</span>}
                        </td>
                        <td>
                          <span className={`chip whitespace-nowrap border bg-slate-50 ${ACTION_TONE[r.action.toUpperCase()] ?? 'border-slate-300 text-slate-700'}`}>
                            {actionLabel(r.action)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-xs">{ENTITY_LABELS[r.entityType] ?? r.entityType}</td>
                        <td className="min-w-[220px] text-xs">{r.summary}</td>
                        <td className="font-mono text-[11px] text-ink-muted">{r.ipAddress ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={6} className="bg-slate-50">
                            <dl className="grid gap-2 py-1 text-xs sm:grid-cols-3">
                              <div><dt className="text-ink-muted">Mã bản ghi</dt><dd className="font-mono">{r.id}</dd></div>
                              <div><dt className="text-ink-muted">Mã đối tượng</dt><dd className="font-mono">{r.entityId ?? '—'}</dd></div>
                              <div><dt className="text-ink-muted">Mã thao tác</dt><dd className="font-mono">{r.action}</dd></div>
                            </dl>
                            {r.changes ? (
                              <pre className="thin-scroll mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-700">
                                {JSON.stringify(r.changes, null, 2)}
                              </pre>
                            ) : <p className="mt-1 text-xs text-ink-muted">Không có dữ liệu thay đổi chi tiết.</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={(p) => { setPage(p); setExpanded(null); }} />
        </>
      )}
    </div>
  );
}
