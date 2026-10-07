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
  appointment: 'Lịch hẹn',
  appointment_item: 'Dịch vụ trong lịch',
  service: 'Dịch vụ',
  category: 'Nhóm dịch vụ',
  stylist: 'Thợ',
  stylist_shift: 'Ca làm việc của thợ',
  shift: 'Ca làm việc',
  working_hours: 'Giờ mở cửa của tiệm',
  invoice: 'Phiếu tính tiền',
  user: 'Tài khoản',
  voucher: 'Mã giảm giá',
  review: 'Đánh giá',
  holiday: 'Ngày nghỉ của tiệm',
  auth: 'Xác thực tài khoản',
  system_config: 'Cấu hình hệ thống',
  customer: 'Khách hàng',
  payment: 'Thanh toán',
};

const PRESETS = [
  { label: 'Hôm nay', days: 0 },
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
];

const actionLabel = (a: string) => ACTION_LABELS[a.toUpperCase()] ?? a;

/** Nhãn tiếng Việt cho các trường dữ liệu chi tiết trong nhật ký. */
const FIELD_LABELS: Record<string, string> = {
  shifts: 'Danh sách ca làm việc',
  startTime: 'Giờ bắt đầu',
  endTime: 'Giờ kết thúc',
  workDate: 'Ngày làm việc',
  breakStart: 'Nghỉ giữa ca từ',
  breakEnd: 'Nghỉ giữa ca đến',
  fullName: 'Họ và tên',
  email: 'Địa chỉ email',
  phone: 'Số điện thoại',
  role: 'Vai trò tài khoản',
  isActive: 'Trạng thái hoạt động',
  name: 'Tên đối tượng',
  price: 'Đơn giá',
  durationMinutes: 'Thời lượng (phút)',
  description: 'Mô tả',
  categoryId: 'Mã nhóm',
  stylistId: 'Mã thợ',
  customerId: 'Mã khách hàng',
  appointmentId: 'Mã lịch hẹn',
  code: 'Mã',
  status: 'Trạng thái',
  notes: 'Ghi chú',
  reason: 'Lý do thao tác',
  openTime: 'Giờ mở cửa',
  closeTime: 'Giờ đóng cửa',
  dayOfWeek: 'Thứ trong tuần',
  isClosed: 'Đóng cửa cả ngày',
  startDate: 'Từ ngày',
  endDate: 'Đến ngày',
  discountPercent: 'Tỉ lệ giảm giá (%)',
  discountAmount: 'Số tiền giảm giá (đ)',
  minOrderValue: 'Giá trị đơn tối thiểu (đ)',
  maxDiscount: 'Giảm tối đa (đ)',
  validFrom: 'Có hiệu lực từ',
  validUntil: 'Có hiệu lực đến',
  usageLimit: 'Giới hạn số lần dùng',
  usedCount: 'Đã sử dụng',
  paymentMethod: 'Phương thức thanh toán',
  subtotal: 'Tạm tính (đ)',
  finalAmount: 'Tổng thanh toán (đ)',
  rating: 'Đánh giá (sao)',
  comment: 'Nhận xét',
  serviceIds: 'Danh sách dịch vụ chọn',
};

function formatIsoDateVi(dStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
  const [y, m, d] = dStr.split('-');
  return `${d}/${m}/${y}`;
}

function renderValueVi(k: string, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-slate-400 font-normal italic">Trống / Không có</span>;
  if (typeof v === 'boolean') return <span className={v ? 'text-emerald-700 font-semibold' : 'text-slate-600'}>{v ? 'Có (Kích hoạt)' : 'Không (Tắt/Khóa)'}</span>;
  if (typeof v === 'number') {
    if (['price', 'subtotal', 'finalAmount', 'discountAmount', 'minOrderValue', 'maxDiscount'].includes(k)) {
      return <span className="font-semibold text-emerald-800">{v.toLocaleString('vi-VN')} đ</span>;
    }
    if (k === 'durationMinutes') return <span>{v} phút</span>;
    if (k === 'discountPercent') return <span>{v}%</span>;
    return <span>{v}</span>;
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return <span className="font-medium text-slate-800">{formatIsoDateVi(v)}</span>;
    if (k === 'role') return <span className="font-semibold text-teal-800">{ROLE_LABELS[v] ?? v}</span>;
    return <span className="font-medium text-slate-800">{v}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-slate-400 font-normal italic">Danh sách trống</span>;
    if (k === 'shifts') {
      const shiftList = v as Array<Record<string, unknown>>;
      return (
        <div className="mt-1 space-y-1">
          {shiftList.map((shift, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-1.5 rounded border border-teal-200 bg-teal-50/70 px-2 py-1 text-xs text-teal-900">
              <span className="font-semibold">{shift.workDate ? formatIsoDateVi(String(shift.workDate)) : `Ca ${idx + 1}`}:</span>
              <span className="font-medium text-slate-900">{String(shift.startTime ?? '')} - {String(shift.endTime ?? '')}</span>
              {Boolean(shift.breakStart && shift.breakEnd) && (
                <span className="text-slate-600 text-[11px]">(Nghỉ: {String(shift.breakStart)} - {String(shift.breakEnd)})</span>
              )}
            </div>
          ))}
        </div>
      );
    }
    const rawList = v as unknown[];
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {rawList.map((item, idx) => (
          <span key={idx} className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-800 font-medium">
            {typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item ?? '')}
          </span>
        ))}
      </div>
    );
  }
  if (typeof v === 'object') {
    return (
      <div className="mt-1 grid gap-1.5 rounded border border-slate-200 bg-slate-50 p-2 text-xs sm:grid-cols-2">
        {Object.entries(v as Record<string, unknown>).map(([subK, subV]) => (
          <div key={subK} className="flex flex-col">
            <span className="text-[11px] text-slate-500 font-medium">{FIELD_LABELS[subK] ?? subK}:</span>
            <div className="text-xs font-semibold text-slate-800">{renderValueVi(subK, subV)}</div>
          </div>
        ))}
      </div>
    );
  }
  return String(v);
}

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
                    className="hit-44 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-ink-soft hover:border-teal-600 hover:text-teal-700"
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
                                  className="hit-44 rounded p-1 hover:bg-slate-100">
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
                          <td colSpan={6} className="bg-slate-50 p-3">
                            <dl className="grid gap-2 text-xs sm:grid-cols-3">
                              <div><dt className="text-ink-muted">Mã bản ghi</dt><dd className="font-mono font-medium">{r.id}</dd></div>
                              <div><dt className="text-ink-muted">Mã đối tượng</dt><dd className="font-mono">{r.entityId ?? '—'}</dd></div>
                              <div><dt className="text-ink-muted">Mã thao tác</dt><dd className="font-semibold text-teal-800">{actionLabel(r.action)} <span className="font-mono text-[10px] text-slate-500 font-normal">({r.action})</span></dd></div>
                            </dl>
                            
                            <div className="mt-3 border-t border-slate-200 pt-2">
                              <p className="mb-1.5 text-xs font-semibold text-slate-700">Dữ liệu chi tiết của thao tác:</p>
                              {r.changes ? (
                                <div className="space-y-2">
                                  {typeof r.changes === 'object' && !Array.isArray(r.changes) ? (
                                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs sm:grid-cols-2">
                                      {Object.entries(r.changes).map(([k, v]) => (
                                        <div key={k} className="flex flex-col rounded bg-slate-50 px-2.5 py-1.5 border border-slate-100">
                                          <span className="text-[11px] text-slate-500 font-semibold">{FIELD_LABELS[k] ?? k}:</span>
                                          <div className="text-xs text-slate-800 mt-0.5">
                                            {renderValueVi(k, v)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                                      {renderValueVi('', r.changes)}
                                    </div>
                                  )}
                                  <details className="mt-1 text-[11px] text-slate-500">
                                    <summary className="cursor-pointer hover:text-teal-700 font-medium">Xem mã nguồn JSON kỹ thuật</summary>
                                    <pre className="thin-scroll mt-1 max-h-36 overflow-auto rounded border border-slate-200 bg-slate-900 p-2 font-mono text-[10px] text-emerald-400">
                                      {JSON.stringify(r.changes, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              ) : (
                                <p className="text-xs text-ink-muted">Không có dữ liệu thay đổi chi tiết.</p>
                              )}
                            </div>
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
