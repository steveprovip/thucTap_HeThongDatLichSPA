import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, Plus, Search, Unlock, UserCog } from 'lucide-react';
import { getErrorMessage, usersApi } from '@/api';
import type { Role, UserRow } from '@/types';
import {
  Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Pagination, SectionTitle, Select, Spinner,
} from '@/components';
import { ROLE_LABELS } from '@/utils/constants';
import { formatDateTime, VN_PHONE_REGEX } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const ROLES: Role[] = ['admin', 'owner', 'receptionist', 'stylist'];

/** S1-02 + S1-03: tạo, sửa, ngưng hoạt động tài khoản và gán vai trò. */
export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const readOnly = me?.role !== 'admin';

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: UserRow[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('receptionist');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await usersApi.list({ search: q.trim() || undefined, page, limit: 20 }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [q, page, toast]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const openCreate = () => {
    setEditing(null);
    setFullName(''); setEmail(''); setPhone(''); setRole('receptionist'); setIsActive(true);
    setError(null); setFormOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setFullName(u.fullName); setEmail(u.email); setPhone(u.phone ?? '');
    setRole(u.role); setIsActive(u.isActive);
    setError(null); setFormOpen(true);
  };

  const save = async () => {
    setError(null);
    if (!fullName.trim()) return setError('Vui lòng nhập họ tên');
    if (phone && !VN_PHONE_REGEX.test(phone)) return setError('Số điện thoại phải gồm đúng 10 chữ số');
    setSaving(true);
    try {
      if (editing) {
        await usersApi.update(editing.id, { fullName: fullName.trim(), phone: phone || undefined, role, isActive });
        toast.success('Đã cập nhật tài khoản');
      } else {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Email không đúng định dạng');
        const created = await usersApi.create({
          fullName: fullName.trim(), email: email.trim(), phone: phone || undefined, role, isActive,
        });
        toast.success(`Đã tạo tài khoản, mật khẩu tạm gửi tới ${created.tempPasswordSentTo}`);
      }
      setFormOpen(false);
      void load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Tài khoản nhân sự"
        description={readOnly
          ? 'Chủ tiệm chỉ được xem danh sách. Chỉ Quản trị hệ thống mới tạo hoặc sửa tài khoản.'
          : 'Tạo tài khoản sẽ sinh mật khẩu tạm gửi qua email, người dùng buộc đổi ở lần đăng nhập đầu tiên.'}
        action={!readOnly && <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Tạo tài khoản</Button>}
      />

      <div className="relative max-w-md">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
               placeholder="Tìm theo tên, email hoặc số điện thoại" className="pl-11" />
      </div>

      {loading ? <Spinner /> : !data || data.items.length === 0 ? (
        <EmptyState icon={<UserCog size={30} />} title="Không có tài khoản nào" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th>
                    <th>Đăng nhập gần nhất</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="font-medium">{u.fullName}</span>
                      {u.mustChangePassword && (
                        <span className="ml-2 chip border border-amber-300 bg-amber-50 text-amber-800">Chờ đổi mật khẩu</span>
                      )}
                    </td>
                    <td className="text-xs">{u.email}</td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td>
                      {u.isActive
                        ? <span className="chip border border-green-300 bg-green-50 text-green-700">Đang hoạt động</span>
                        : <span className="chip border border-gray-300 bg-gray-100 text-gray-600">Ngưng hoạt động</span>}
                      {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                        <span className="ml-1 chip border border-red-300 bg-red-50 text-red-700">
                          <Lock size={11} /> Đang khoá
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-ink-muted">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Chưa đăng nhập'}
                    </td>
                    <td>
                      {!readOnly && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>Sửa</Button>
                          <Button size="sm" variant="ghost" onClick={() => setResetTarget(u)} title="Cấp lại mật khẩu tạm">
                            <KeyRound size={14} />
                          </Button>
                          {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                            <Button size="sm" variant="ghost" title="Mở khoá"
                                    onClick={async () => {
                                      try { await usersApi.unlock(u.id); toast.success('Đã mở khoá'); void load(); }
                                      catch (e) { toast.error(getErrorMessage(e)); }
                                    }}>
                              <Unlock size={14} />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Sửa tài khoản ${editing.email}` : 'Tạo tài khoản nhân sự'}
        onClose={() => setFormOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}</Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Họ tên" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email" required hint={editing ? 'Không đổi được email của tài khoản đã tạo' : undefined}>
            <Input type="email" value={email} disabled={!!editing} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Số điện thoại">
            <Input value={phone} inputMode="numeric"
                   onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </Field>
          <Field label="Vai trò" required hint="Đổi vai trò có hiệu lực ngay ở lần gọi API kế tiếp">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                   className="h-4 w-4 rounded border-brand-300" />
            Tài khoản đang hoạt động
          </label>
          <p className="text-xs text-ink-muted">
            Ngưng hoạt động một tài khoản sẽ làm mọi phiên đang mở của tài khoản đó hết hiệu lực ngay lập tức.
          </p>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!resetTarget}
        title="Cấp lại mật khẩu tạm"
        message={`Hệ thống sẽ sinh mật khẩu tạm mới và gửi tới ${resetTarget?.email}. Mọi phiên đang mở sẽ bị huỷ.`}
        onConfirm={async () => {
          if (!resetTarget) return;
          try {
            const res = await usersApi.resetPassword(resetTarget.id);
            toast.success(`Đã gửi mật khẩu tạm tới ${res.sentTo}`);
            void load();
          } catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setResetTarget(null)}
      />
    </div>
  );
}
