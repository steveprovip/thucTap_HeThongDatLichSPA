import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { Card, SectionTitle, Spinner } from '@/components';
import { useToast } from '@/contexts/ToastContext';

const LEVEL_LABELS: Record<string, { label: string; cls: string }> = {
  F: { label: 'Toàn quyền', cls: 'bg-green-100 text-green-800' },
  W: { label: 'Ghi trong phạm vi', cls: 'bg-blue-100 text-blue-800' },
  R: { label: 'Chỉ xem', cls: 'bg-amber-100 text-amber-800' },
  '-': { label: 'Không truy cập', cls: 'bg-gray-100 text-gray-500' },
};

const ROLE_ORDER = ['customer', 'stylist', 'receptionist', 'owner', 'admin'];

/** S1-03 + S4-10: bảng đối chiếu phân quyền, cùng nguồn dữ liệu với guard ở máy chủ. */
export function PermissionMatrixPage() {
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    authApi.permissionMatrix()
      .then((d) => { setRoles(d.roles); setMatrix(d.matrix); })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Bảng phân quyền theo module"
        description="Dữ liệu lấy thẳng từ máy chủ — cùng nguồn với guard chặn API, nên bảng này luôn khớp với hành vi thật."
      />

      <p className="flex flex-wrap items-center gap-2 text-xs">
        <ShieldCheck size={15} className="text-brand-700" />
        {Object.entries(LEVEL_LABELS).map(([k, v]) => (
          <span key={k} className={`chip ${v.cls}`}><strong>{k}</strong> {v.label}</span>
        ))}
      </p>

      <Card className="overflow-hidden">
        <div className="table-wrap border-0">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-brand-50">Module</th>
                {ROLE_ORDER.map((r) => <th key={r} className="text-center">{roles[r] ?? r}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(matrix).map(([module, perms]) => (
                <tr key={module}>
                  <td className="sticky left-0 z-10 bg-white font-medium">{module}</td>
                  {ROLE_ORDER.map((r) => {
                    const lvl = perms[r] ?? '-';
                    const meta = LEVEL_LABELS[lvl];
                    return (
                      <td key={r} className="text-center">
                        <span className={`chip ${meta.cls}`} title={meta.label}>{lvl}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-ink-muted">
        * Thợ và Khách chỉ thao tác được trên dữ liệu của chính mình. Số điện thoại khách được che bớt khi thợ xem.
      </p>
    </div>
  );
}
