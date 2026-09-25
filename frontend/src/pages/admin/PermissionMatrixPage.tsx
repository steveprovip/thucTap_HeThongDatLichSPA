import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Minus, PenLine, ShieldCheck } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import type { Role } from '@/types';
import { Card, Notice, SectionTitle, Spinner } from '@/components';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

type Level = 'F' | 'W' | 'R' | '-';

const LEVELS: Record<Level, { label: string; desc: string; cls: string; icon: React.ReactNode }> = {
  F: { label: 'Toàn quyền', desc: 'Xem, tạo, sửa, xoá', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700', icon: <Check size={13} /> },
  W: { label: 'Ghi trong phạm vi', desc: 'Chỉ sửa dữ liệu của mình / được giao', cls: 'border-sky-300 bg-sky-50 text-sky-800', icon: <PenLine size={13} /> },
  R: { label: 'Chỉ xem', desc: 'Không được thay đổi', cls: 'border-amber-200 bg-amber-50 text-amber-800', icon: <Eye size={13} /> },
  '-': { label: 'Không truy cập', desc: 'Ẩn khỏi menu, API trả 403', cls: 'border-slate-200 bg-slate-50 text-slate-500', icon: <Minus size={13} /> },
};

/** Thứ tự cột theo yêu cầu: Quản trị → Chủ tiệm → Lễ tân → Thợ → Khách. */
const ROLE_ORDER: { id: Role; short: string }[] = [
  { id: 'admin', short: 'Quản trị' },
  { id: 'owner', short: 'Chủ tiệm' },
  { id: 'receptionist', short: 'Lễ tân' },
  { id: 'stylist', short: 'Thợ' },
  { id: 'customer', short: 'Khách' },
];

/** Diễn giải ngắn cho từng module để người đọc hiểu phạm vi. */
const MODULE_NOTES: Record<string, string> = {
  'Đặt lịch công khai': 'Trang đặt lịch, tra cứu và tự huỷ của khách',
  'Lịch hẹn': 'Xác nhận, check-in, đổi thợ, dời giờ, báo không đến',
  'Thanh toán': 'Phiếu tính tiền, mã giảm giá, điều chỉnh phiếu',
  'Khách hàng': 'Hồ sơ khách, lịch sử lượt làm, ghi chú',
  'Báo cáo': 'Tổng quan ngày, doanh thu, mật độ khung giờ',
  'Danh mục & ca làm': 'Dịch vụ, bảng giá, hồ sơ thợ, ca làm, giờ mở cửa',
  'Tài khoản & nhật ký': 'Tài khoản nhân sự, nhật ký hoạt động, phân quyền',
};

const asLevel = (v: string | undefined): Level => (v === 'F' || v === 'W' || v === 'R' ? v : '-');

/** S1-03 + S4-10: bảng phân quyền 5 vai trò, cùng nguồn dữ liệu với guard ở máy chủ. */
export function PermissionMatrixPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [focusRole, setFocusRole] = useState<Role | null>(null);

  useEffect(() => {
    authApi.permissionMatrix()
      .then((d) => { setRoles(d.roles); setMatrix(d.matrix); })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [toast]);

  const highlight = focusRole ?? user?.role ?? null;
  const modules = Object.entries(matrix);

  const summary = useMemo(() => ROLE_ORDER.map((r) => {
    const counts: Record<Level, number> = { F: 0, W: 0, R: 0, '-': 0 };
    modules.forEach(([, perms]) => { counts[asLevel(perms[r.id])] += 1; });
    return { ...r, counts };
  }), [modules]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Bảng phân quyền theo vai trò"
        description="Dữ liệu lấy từ máy chủ — cùng nguồn với guard chặn API, nên bảng luôn khớp với hành vi thật."
      />

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(LEVELS) as Level[]).map((k) => (
          <span key={k} className={`chip border ${LEVELS[k].cls}`} title={LEVELS[k].desc}>
            {LEVELS[k].icon} <strong>{k}</strong> {LEVELS[k].label}
          </span>
        ))}
      </div>

      {/* Tóm tắt theo vai trò — bấm để làm nổi bật cột */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((r) => (
          <button key={r.id} onClick={() => setFocusRole(focusRole === r.id ? null : r.id)} aria-pressed={highlight === r.id}
                  className={`rounded-2xl border p-3 text-left transition-colors
                    ${highlight === r.id ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <p className="text-sm font-bold">{roles[r.id] ?? r.short}</p>
            <p className="mt-1 text-[11px] text-ink-muted">
              {r.counts.F} toàn quyền · {r.counts.W} ghi · {r.counts.R} xem
            </p>
            {user?.role === r.id && <p className="mt-1 text-[11px] font-semibold text-teal-700">Vai trò của bạn</p>}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="thin-scroll overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] bg-brand-50">Module</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r.id} className={`text-center ${highlight === r.id ? '!bg-teal-50 !text-teal-700' : ''}`}>
                    {roles[r.id] ?? r.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(([module, perms]) => (
                <tr key={module}>
                  <td className="sticky left-0 z-10 bg-white">
                    <p className="font-medium text-ink">{module}</p>
                    {MODULE_NOTES[module] && <p className="text-[11px] text-ink-muted">{MODULE_NOTES[module]}</p>}
                  </td>
                  {ROLE_ORDER.map((r) => {
                    const lvl = asLevel(perms[r.id]);
                    const meta = LEVELS[lvl];
                    return (
                      <td key={r.id} className={`text-center ${highlight === r.id ? 'bg-teal-50/50' : ''}`}>
                        <span className={`chip border ${meta.cls}`} title={`${roles[r.id] ?? r.short} · ${module}: ${meta.label}`}
                              aria-label={`${meta.label}`}>
                          {meta.icon} {lvl}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Notice tone="info" icon={<ShieldCheck size={16} />}>
        Thợ và Khách chỉ thao tác trên dữ liệu của chính mình. Số điện thoại khách được che bớt khi thợ xem.
        Menu bên trái tự ẩn những mục vai trò hiện tại không được phép.
      </Notice>
    </div>
  );
}
