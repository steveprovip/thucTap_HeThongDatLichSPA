import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Tag, Trash2 } from 'lucide-react';
import { catalogApi, getErrorMessage, stylistsApi } from '@/api';
import type { ServiceCategory, ServiceItem, Stylist } from '@/types';
import {
  Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, SectionTitle, Select, Spinner, Textarea,
} from '@/components';
import { formatNumber, formatVnd, parseNumber } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15); // 15 → 240

/** S1-05 + S1-06: danh mục dịch vụ, nhóm dịch vụ, thời lượng và giá. */
export function ServicesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ServiceItem | null>(null);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState(0);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [stylistIds, setStylistIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, svc, sty] = await Promise.all([
        catalogApi.categories(), catalogApi.services(), stylistsApi.list(),
      ]);
      setCategories(cats); setServices(svc); setStylists(sty);
      if (!categoryId && cats.length) setCategoryId(cats[0].id);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setDuration(30); setPrice(0); setDescription(''); setIsActive(true); setStylistIds([]);
    setCategoryId(categories[0]?.id ?? ''); setError(null); setFormOpen(true);
  };

  const openEdit = (s: ServiceItem) => {
    setEditing(s);
    setName(s.name); setCategoryId(s.categoryId); setDuration(s.durationMinutes); setPrice(s.price);
    setDescription(s.description ?? ''); setIsActive(s.isActive); setStylistIds(s.stylistIds);
    setError(null); setFormOpen(true);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Vui lòng nhập tên dịch vụ');
    if (duration % 15 !== 0 || duration < 15 || duration > 240) {
      return setError('Thời lượng phải là bội số của 15 phút, từ 15 đến 240 phút');
    }
    if (price <= 0 || price > 20_000_000) return setError('Giá phải lớn hơn 0 và không vượt quá 20.000.000 đ');
    setSaving(true);
    try {
      const payload = {
        categoryId, name: name.trim(), durationMinutes: duration, price,
        description: description.trim() || undefined, isActive, stylistIds,
      };
      if (editing) { await catalogApi.updateService(editing.id, payload); toast.success('Đã cập nhật dịch vụ'); }
      else { await catalogApi.createService(payload); toast.success('Đã tạo dịch vụ'); }
      setFormOpen(false);
      void load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const noStylist = services.filter((s) => s.isActive && s.hasNoStylist);

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Dịch vụ &amp; bảng giá"
        description={canEdit
          ? 'Thời lượng là bội số của 15 phút (15–240). Giá tối đa 20.000.000 đ. Đổi thời lượng không làm thay đổi lịch hẹn đã đặt.'
          : 'Bạn đang xem ở chế độ chỉ đọc. Chỉ Chủ tiệm mới sửa được bảng giá.'}
        action={canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setCatName(''); setCatOrder(categories.length); setCatOpen(true); }}>
              <Tag size={15} /> Nhóm dịch vụ
            </Button>
            <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Thêm dịch vụ</Button>
          </div>
        )}
      />

      {noStylist.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {noStylist.length} dịch vụ đang bán nhưng chưa có thợ nào đảm nhận:{' '}
          {noStylist.map((s) => s.name).join(', ')}. Khách sẽ không thấy các dịch vụ này trên trang đặt lịch.
        </p>
      )}

      {loading ? <Spinner /> : services.length === 0 ? (
        <EmptyState title="Chưa có dịch vụ nào" />
      ) : (
        categories.map((cat) => {
          const items = services.filter((s) => s.categoryId === cat.id);
          if (items.length === 0) return null;
          return (
            <Card key={cat.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-brand-100 bg-brand-50 px-4 py-2.5">
                <p className="text-sm font-bold text-brand-900">{cat.name}</p>
                <span className="text-xs text-ink-muted">{items.length} dịch vụ</span>
              </div>
              <table className="table">
                <thead>
                  <tr><th>Tên dịch vụ</th><th className="text-right">Thời lượng</th><th className="text-right">Giá</th>
                      <th>Thợ đảm nhận</th><th>Trạng thái</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="font-medium">{s.name}</span>
                        {s.description && <span className="block text-xs text-ink-muted">{s.description}</span>}
                      </td>
                      <td className="text-right whitespace-nowrap">{s.durationMinutes} phút</td>
                      <td className="text-right font-semibold whitespace-nowrap">{s.priceText}</td>
                      <td className="text-xs">
                        {s.stylistCount === 0
                          ? <span className="chip border border-amber-300 bg-amber-50 text-amber-800">Chưa có thợ</span>
                          : `${s.stylistCount} thợ`}
                      </td>
                      <td>
                        {s.isActive
                          ? <span className="chip border border-green-300 bg-green-50 text-green-700">Đang bán</span>
                          : <span className="chip border border-gray-300 bg-gray-100 text-gray-600">Ngừng bán</span>}
                      </td>
                      <td>
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Sửa</Button>
                            <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(s)} title="Xoá">
                              <Trash2 size={14} className="text-red-600" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })
      )}

      <Modal
        open={formOpen}
        title={editing ? `Sửa dịch vụ: ${editing.name}` : 'Thêm dịch vụ'}
        onClose={() => setFormOpen(false)}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo dịch vụ'}</Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Tên dịch vụ" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nhóm dịch vụ" required>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Thời lượng" required>
              <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d} phút</option>)}
              </Select>
            </Field>
            <Field label="Giá (đ)" required hint={formatVnd(price)}>
              <Input value={formatNumber(price)} inputMode="numeric"
                     onChange={(e) => setPrice(parseNumber(e.target.value))} />
            </Field>
          </div>
          <Field label="Mô tả ngắn">
            <Textarea value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Thợ đảm nhận" hint="Dịch vụ không có thợ nào đảm nhận sẽ không hiện trên trang đặt lịch">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {stylists.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-brand-100 px-2.5 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-brand-300"
                    checked={stylistIds.includes(s.id)}
                    onChange={(e) => setStylistIds((list) =>
                      e.target.checked ? [...list, s.id] : list.filter((x) => x !== s.id))}
                  />
                  <span className={s.isActive ? '' : 'text-ink-muted line-through'}>{s.fullName}</span>
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-brand-300"
                   checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Đang bán
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={catOpen}
        title="Thêm nhóm dịch vụ"
        onClose={() => setCatOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCatOpen(false)}>Đóng</Button>
            <Button onClick={async () => {
              try {
                await catalogApi.createCategory({ name: catName.trim(), displayOrder: catOrder });
                toast.success('Đã tạo nhóm dịch vụ');
                setCatOpen(false); void load();
              } catch (e) { toast.error(getErrorMessage(e)); }
            }}>Tạo nhóm</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Tên nhóm" required><Input value={catName} onChange={(e) => setCatName(e.target.value)} /></Field>
          <Field label="Thứ tự hiển thị" hint="Quyết định thứ tự nhóm trên trang công khai">
            <Input type="number" value={catOrder} onChange={(e) => setCatOrder(Number(e.target.value))} />
          </Field>
          <div className="rounded-xl bg-surface-alt p-3">
            <p className="mb-1.5 text-xs font-semibold">Nhóm hiện có</p>
            <ul className="space-y-1 text-xs text-ink-soft">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>{c.displayOrder}. {c.name} ({c.serviceCount ?? 0} dịch vụ)</span>
                  <button className="text-red-600 hover:underline"
                          onClick={async () => {
                            try { await catalogApi.removeCategory(c.id); toast.success('Đã xoá nhóm'); void load(); }
                            catch (e) { toast.error(getErrorMessage(e)); }
                          }}>
                    Xoá
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá dịch vụ"
        confirmLabel="Xoá"
        message={
          <>Xoá dịch vụ <strong>{removeTarget?.name}</strong>? Nếu dịch vụ đã có lịch hẹn tham chiếu,
          hệ thống sẽ từ chối và bạn nên chuyển sang trạng thái ngừng bán.</>
        }
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await catalogApi.removeService(removeTarget.id); toast.success('Đã xoá dịch vụ'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
