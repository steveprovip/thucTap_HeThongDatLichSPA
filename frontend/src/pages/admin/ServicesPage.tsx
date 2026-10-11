import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Clock3, Layers, Lock, Pencil, Plus, Search, Tag, Trash2, Wallet,
} from 'lucide-react';
import { catalogApi, getErrorMessage, stylistsApi } from '@/api';
import type { ServiceCategory, ServiceItem, Stylist } from '@/types';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Notice, SectionTitle, Select, SmartImage, Textarea, Toggle, TableSkeleton } from '@/components';
import { assignServiceImages, initials, serviceMediaKind } from '@/utils/images';
import { formatDuration, formatNumber, formatVnd, matchSearch, parseNumber } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** Thời lượng hợp lệ: bội số 15 phút, 15 → 240. */
const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);
const MAX_PRICE = 20_000_000;
const ALL = '__all__';
/** S1-05: thông điệp khi dịch vụ đã có lịch hẹn tham chiếu. */
const IN_USE_TIP = 'Dịch vụ đã có lịch hẹn, chỉ có thể ngừng kinh doanh';
const isInUse = (s: ServiceItem) => (s.appointmentCount ?? 0) > 0;

type StatusFilter = 'all' | 'active' | 'inactive';

interface FormState {
  name: string;
  categoryId: string;
  duration: number;
  price: number;
  description: string;
  /** TASK v4 · NV2: ảnh riêng của dịch vụ (https://…); để trống = tự chọn ảnh theo chủ đề. */
  imageUrl: string;
  isActive: boolean;
  stylistIds: string[];
}

const EMPTY_FORM: FormState = {
  name: '', categoryId: '', duration: 30, price: 0, description: '', imageUrl: '', isActive: true, stylistIds: [],
};

/** Kiểm tra dữ liệu form dịch vụ; trả về lỗi theo từng trường. */
function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) errors.name = 'Vui lòng nhập tên dịch vụ';
  if (f.imageUrl.trim() && !/^https:\/\/[^\s"'<>]+$/.test(f.imageUrl.trim())) errors.imageUrl = 'Ảnh phải là đường dẫn bắt đầu bằng https://';
  else if (f.name.trim().length > 120) errors.name = 'Tên dịch vụ tối đa 120 ký tự';
  if (!f.categoryId) errors.categoryId = 'Vui lòng chọn nhóm dịch vụ';
  if (f.duration % 15 !== 0 || f.duration < 15 || f.duration > 240) {
    errors.duration = 'Thời lượng phải là bội số của 15 phút, từ 15 đến 240 phút';
  }
  if (f.price <= 0) errors.price = 'Giá phải lớn hơn 0';
  else if (f.price > MAX_PRICE) errors.price = `Giá tối đa ${formatVnd(MAX_PRICE)}`;
  return errors;
}

/** S1-05 + S1-06: danh mục dịch vụ theo nhóm, thời lượng, giá và trạng thái bán. */
export function ServicesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner'; // khớp RolesGuard backend: Admin chỉ xem (PERMISSION_MATRIX)
  const toast = useToast();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toggling, setToggling] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ServiceItem | null>(null);
  /** Dịch vụ đã có lịch hẹn: không xoá được, đề nghị chuyển sang "Ngừng kinh doanh". */
  const [retireTarget, setRetireTarget] = useState<ServiceItem | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(1);
  const [catEditing, setCatEditing] = useState<ServiceCategory | null>(null);

  const load = useCallback(async () => {
    try {
      const [cats, svc, sty] = await Promise.all([
        catalogApi.categories(), catalogApi.services(), stylistsApi.list(),
      ]);
      setCategories([...cats].sort((a, b) => a.displayOrder - b.displayOrder));
      setServices(svc);
      setStylists(sty);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  // Nếu nhóm đang chọn bị xoá thì quay về "Tất cả"
  useEffect(() => {
    if (tab !== ALL && !categories.some((c) => c.id === tab)) setTab(ALL);
  }, [categories, tab]);

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    services.forEach((s) => { map[s.categoryId] = (map[s.categoryId] ?? 0) + 1; });
    return map;
  }, [services]);

  const photos = useMemo(() => assignServiceImages(services), [services]);
  const visible = useMemo(() => services
    .filter((s) => tab === ALL || s.categoryId === tab)
    .filter((s) => statusFilter === 'all' || (statusFilter === 'active' ? s.isActive : !s.isActive))
    .filter((s) => !query.trim() || matchSearch(`${s.name} ${s.description ?? ''}`, query)),
  [services, tab, statusFilter, query]);

  const stats = useMemo(() => {
    const active = services.filter((s) => s.isActive);
    const avg = active.length ? Math.round(active.reduce((sum, s) => sum + s.price, 0) / active.length) : 0;
    return { total: services.length, active: active.length, avg };
  }, [services]);

  const noStylist = services.filter((s) => s.isActive && s.hasNoStylist);
  const errors = validate(form);
  const showErrors = touched ? errors : {};

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: tab !== ALL ? tab : categories[0]?.id ?? '' });
    setTouched(false); setServerError(null); setFormOpen(true);
  };

  const openEdit = (s: ServiceItem) => {
    setEditing(s);
    setForm({
      name: s.name, categoryId: s.categoryId, duration: s.durationMinutes, price: s.price,
      description: s.description ?? '', imageUrl: s.imageUrl ?? '', isActive: s.isActive, stylistIds: [...s.stylistIds],
    });
    setTouched(false); setServerError(null); setFormOpen(true);
  };

  const save = async () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = {
        categoryId: form.categoryId, name: form.name.trim(), durationMinutes: form.duration, price: form.price,
        description: form.description.trim() || undefined, isActive: form.isActive, stylistIds: form.stylistIds,
        // Sửa dịch vụ: gửi '' để xoá ảnh riêng (quay về ảnh theo chủ đề); thêm mới: bỏ trống thì không gửi
        imageUrl: form.imageUrl.trim() || (editing ? '' : undefined),
      };
      if (editing) {
        await catalogApi.updateService(editing.id, payload);
        toast.success('Đã cập nhật dịch vụ');
      } else {
        await catalogApi.createService(payload);
        toast.success('Đã thêm dịch vụ mới');
      }
      setFormOpen(false);
      void load();
    } catch (e) {
      setServerError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: ServiceItem, next: boolean) => {
    setToggling(s.id);
    // Cập nhật lạc quan để công tắc phản hồi ngay
    setServices((list) => list.map((x) => (x.id === s.id ? { ...x, isActive: next } : x)));
    try {
      await catalogApi.updateService(s.id, { isActive: next });
      toast.success(next ? `Đã mở bán “${s.name}”` : `Đã ngừng bán “${s.name}”`);
    } catch (e) {
      setServices((list) => list.map((x) => (x.id === s.id ? { ...x, isActive: !next } : x)));
      toast.error(getErrorMessage(e));
    } finally {
      setToggling(null);
    }
  };

  const openCategories = () => {
    setCatEditing(null); setCatName('');
    setCatOrder((categories[categories.length - 1]?.displayOrder ?? 0) + 1);
    setCatOpen(true);
  };

  const saveCategory = async () => {
    const name = catName.trim();
    if (!name) return toast.warning('Vui lòng nhập tên nhóm');
    if (categories.some((c) => c.id !== catEditing?.id && c.name.toLowerCase() === name.toLowerCase())) {
      return toast.warning('Tên nhóm đã tồn tại');
    }
    try {
      if (catEditing) {
        await catalogApi.updateCategory(catEditing.id, { name, displayOrder: catOrder });
        toast.success('Đã đổi tên nhóm');
      } else {
        await catalogApi.createCategory({ name, displayOrder: catOrder });
        toast.success('Đã tạo nhóm dịch vụ');
      }
      setCatEditing(null); setCatName('');
      setCatOrder((o) => o + 1);
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const removeCategory = async (c: ServiceCategory) => {
    if (countByCategory[c.id]) {
      return toast.warning(`Nhóm “${c.name}” còn ${countByCategory[c.id]} dịch vụ. Hãy chuyển dịch vụ sang nhóm khác trước.`);
    }
    try { await catalogApi.removeCategory(c.id); toast.success('Đã xoá nhóm'); void load(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  const activeStylists = stylists.filter((s) => s.isActive);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Dịch vụ & bảng giá"
        description={canEdit
          ? 'Thời lượng là bội số của 15 phút (15–240). Giá tối đa 20.000.000 đ. Đổi thời lượng không làm thay đổi lịch đã đặt.'
          : 'Bạn đang xem ở chế độ chỉ đọc. Chỉ Chủ tiệm mới sửa được bảng giá.'}
        action={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Tag size={15} />} onClick={openCategories}>Nhóm dịch vụ</Button>
            <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Thêm dịch vụ</Button>
          </div>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={<Layers size={16} />} label="Tổng dịch vụ" value={String(stats.total)}
                  hint={`${categories.length} nhóm`} />
        <StatTile icon={<Clock3 size={16} />} label="Đang bán" value={String(stats.active)}
                  hint={`${stats.total - stats.active} đang ngừng bán`} />
        <StatTile icon={<Wallet size={16} />} label="Giá trung bình" value={formatVnd(stats.avg)}
                  hint="Tính trên dịch vụ đang bán" />
      </div>

      {noStylist.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle size={16} />}
                title={`${noStylist.length} dịch vụ đang bán nhưng chưa có thợ đảm nhận`}>
          {noStylist.map((s) => s.name).join(', ')}. Khách sẽ không đặt được các dịch vụ này.
        </Notice>
      )}

      {/* Tab theo nhóm dịch vụ */}
      <div className="thin-scroll -mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Nhóm dịch vụ" className="flex min-w-max gap-1.5 border-b border-slate-200 pb-2">
          {[{ id: ALL, name: 'Tất cả', count: services.length },
            ...categories.map((c) => ({ id: c.id, name: c.name, count: countByCategory[c.id] ?? 0 }))].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors
                ${tab === t.id
                  ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                  : 'text-ink-muted hover:bg-slate-100 hover:text-ink'}`}
            >
              {t.name}
              <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? 'bg-teal-100' : 'bg-slate-100'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc mô tả…"
                 className="pl-9" aria-label="Tìm dịch vụ" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="sm:w-48" aria-label="Lọc trạng thái">
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Ngừng bán</option>
        </Select>
      </div>

      {loading ? <TableSkeleton cols={7} /> : visible.length === 0 ? (
        <EmptyState
          icon={<Layers size={30} />}
          title={services.length === 0 ? 'Chưa có dịch vụ nào' : 'Không có dịch vụ khớp bộ lọc'}
          action={canEdit && services.length === 0
            ? <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Thêm dịch vụ đầu tiên</Button>
            : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                {tab === ALL && <th>Nhóm</th>}
                <th className="text-right">Thời lượng</th>
                <th className="text-right">Giá</th>
                <th>Thợ đảm nhận</th>
                <th>Đang bán</th>
                {canEdit && <th className="text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className={s.isActive ? '' : 'opacity-60'}>
                  <td className="min-w-[260px]">
                    <div className="flex items-center gap-3">
                      <SmartImage src={photos[s.id]} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl"
                                  kind={serviceMediaKind(s)} seed={s.id} monogram={initials(s.name)} />
                      <div className="min-w-0">
                        <span className="font-medium text-ink">{s.name}</span>
                        {s.description && <span className="block text-xs text-ink-muted">{s.description}</span>}
                      </div>
                    </div>
                  </td>
                  {tab === ALL && <td className="whitespace-nowrap text-xs text-ink-soft">{s.categoryName}</td>}
                  <td className="whitespace-nowrap text-right">{formatDuration(s.durationMinutes)}</td>
                  <td className="whitespace-nowrap text-right font-semibold text-teal-700">{s.priceText}</td>
                  <td className="whitespace-nowrap text-xs">
                    {s.stylistCount === 0
                      ? <span className="chip border border-amber-200 bg-amber-50 text-amber-800">Chưa có thợ</span>
                      : <span className="text-ink-soft">{s.stylistCount} thợ</span>}
                  </td>
                  <td>
                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <Toggle size="sm" checked={s.isActive} disabled={toggling === s.id}
                                label={s.isActive ? 'Ngừng bán dịch vụ' : 'Mở bán dịch vụ'}
                                onChange={(next) => toggleActive(s, next)} />
                        <span className="text-xs text-ink-muted">{s.isActive ? 'Bật' : 'Tắt'}</span>
                      </div>
                    ) : s.isActive
                      ? <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">Đang bán</span>
                      : <span className="chip border border-slate-300 bg-slate-100 text-slate-600">Ngừng bán</span>}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label={`Sửa ${s.name}`}>
                          <Pencil size={14} /> Sửa
                        </Button>
                        {isInUse(s) ? (
                          // Lỗi 7: đã có lịch hẹn → khoá xoá cứng, bấm vào sẽ đề nghị "Ngừng kinh doanh"
                          <span className="group/tip relative inline-flex">
                            <Button size="sm" variant="ghost" aria-disabled="true" title={IN_USE_TIP}
                                    aria-label={`${s.name}: ${IN_USE_TIP}`} onClick={() => setRetireTarget(s)}
                                    className="cursor-not-allowed text-slate-400 opacity-60 hover:bg-transparent">
                              <Lock size={14} />
                            </Button>
                            <span role="tooltip"
                                  className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 w-56 -translate-y-1/2 translate-x-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-all duration-200 group-focus-within/tip:translate-x-0 group-focus-within/tip:opacity-100 group-hover/tip:translate-x-0 group-hover/tip:opacity-100">
                              {IN_USE_TIP} ({s.appointmentCount} lịch hẹn).
                            </span>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(s)} aria-label={`Xoá ${s.name}`}>
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------ Form thêm / sửa dịch vụ */}
      <Modal
        open={formOpen}
        title={editing ? `Sửa dịch vụ: ${editing.name}` : 'Thêm dịch vụ'}
        onClose={() => setFormOpen(false)}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo dịch vụ'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Tên dịch vụ" required error={showErrors.name} htmlFor="svc-name">
            <Input id="svc-name" value={form.name} maxLength={120} invalid={!!showErrors.name}
                   onChange={(e) => setField('name', e.target.value)} placeholder="VD: Gội dưỡng sinh thảo mộc" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nhóm dịch vụ" required error={showErrors.categoryId} htmlFor="svc-cat">
              <Select id="svc-cat" value={form.categoryId} invalid={!!showErrors.categoryId}
                      onChange={(e) => setField('categoryId', e.target.value)}>
                <option value="">— Chọn nhóm —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Thời lượng" required error={showErrors.duration} hint="Bước 15 phút · 15–240"
                   htmlFor="svc-dur">
              <Select id="svc-dur" value={form.duration} invalid={!!showErrors.duration}
                      onChange={(e) => setField('duration', Number(e.target.value))}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d} phút ({formatDuration(d)})</option>)}
              </Select>
            </Field>
            <Field label="Giá (đ)" required error={showErrors.price}
                   hint={`${formatVnd(form.price)} · tối đa ${formatNumber(MAX_PRICE)}`} htmlFor="svc-price">
              <Input id="svc-price" value={formatNumber(form.price)} inputMode="numeric" invalid={!!showErrors.price}
                     onChange={(e) => setField('price', Math.min(parseNumber(e.target.value), 999_999_999))} />
            </Field>
          </div>
          <Field label="Mô tả ngắn" hint={`${form.description.length}/500`}>
            <Textarea value={form.description} maxLength={500}
                      onChange={(e) => setField('description', e.target.value)} />
          </Field>
          <Field label="Ảnh dịch vụ (đường dẫn https)" error={showErrors.imageUrl} htmlFor="svc-img"
                 hint="Dán link ảnh Unsplash / Pexels / ảnh của tiệm. Để trống: hệ thống tự chọn ảnh theo chủ đề dịch vụ.">
            <div className="flex items-center gap-2">
              <Input id="svc-img" value={form.imageUrl} maxLength={500} invalid={!!showErrors.imageUrl} placeholder="https://images.unsplash.com/photo-…"
                     onChange={(e) => setField('imageUrl', e.target.value)} />
              {form.imageUrl.trim().startsWith('https://') && (
                <img src={form.imageUrl.trim()} alt="Xem trước ảnh dịch vụ" className="h-10 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
              )}
            </div>
          </Field>

          <Field label="Thợ đảm nhận" hint="Dịch vụ không có thợ đảm nhận sẽ không hiện trên trang đặt lịch">
            <div className="flex flex-wrap gap-1.5">
              {activeStylists.map((s) => {
                const on = form.stylistIds.includes(s.id);
                return (
                  <button
                    key={s.id} type="button" aria-pressed={on}
                    onClick={() => setField('stylistIds', on
                      ? form.stylistIds.filter((x) => x !== s.id) : [...form.stylistIds, s.id])}
                    className={`min-h-[36px] rounded-full border px-3 text-sm transition-colors
                      ${on ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-ink-soft hover:border-slate-400'}`}
                  >
                    {on ? '✓ ' : ''}{s.fullName}
                  </button>
                );
              })}
              {activeStylists.length > 0 && (
                <button type="button" className="min-h-[36px] px-2 text-xs text-teal-700 hover:underline"
                        onClick={() => setField('stylistIds',
                          form.stylistIds.length === activeStylists.length ? [] : activeStylists.map((s) => s.id))}>
                  {form.stylistIds.length === activeStylists.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Trạng thái bán</p>
              <p className="text-xs text-ink-muted">
                {form.isActive ? 'Khách nhìn thấy và đặt được dịch vụ này' : 'Ẩn khỏi trang đặt lịch, vẫn giữ lịch sử'}
              </p>
            </div>
            <Toggle checked={form.isActive} onChange={(v) => setField('isActive', v)} label="Đang bán" />
          </div>

          {editing && editing.durationMinutes !== form.duration && (
            <Notice tone="info">Đổi thời lượng chỉ áp dụng cho lịch đặt mới, không ảnh hưởng lịch đã đặt.</Notice>
          )}
          {serverError && <Notice tone="danger">{serverError}</Notice>}
        </div>
      </Modal>

      {/* ------------------------------------------------ Quản lý nhóm dịch vụ */}
      <Modal
        open={catOpen}
        title="Nhóm dịch vụ"
        onClose={() => setCatOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCatOpen(false)}>Đóng</Button>
            <Button onClick={saveCategory}>{catEditing ? 'Lưu tên nhóm' : 'Thêm nhóm'}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label={catEditing ? `Đổi tên nhóm “${catEditing.name}”` : 'Tên nhóm mới'} required>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Thứ tự hiển thị" hint="Quyết định thứ tự nhóm trên trang công khai">
            <Input type="number" min={1} value={catOrder} onChange={(e) => setCatOrder(Number(e.target.value))} />
          </Field>
          {catEditing && (
            <button className="text-xs text-ink-muted hover:underline"
                    onClick={() => { setCatEditing(null); setCatName(''); }}>
              Huỷ sửa, quay lại thêm nhóm mới
            </button>
          )}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-ink-muted">{c.displayOrder}.</span> {c.name}
                  <span className="ml-1 text-xs text-ink-muted">({countByCategory[c.id] ?? 0})</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" aria-label={`Sửa nhóm ${c.name}`}
                          onClick={() => { setCatEditing(c); setCatName(c.name); setCatOrder(c.displayOrder); }}>
                    <Pencil size={14} />
                  </button>
                  <button className="rounded-lg p-1.5 text-red-600 hover:bg-slate-100" aria-label={`Xoá nhóm ${c.name}`}
                          onClick={() => removeCategory(c)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá dịch vụ"
        confirmLabel="Xoá"
        message={
          <>Xoá vĩnh viễn dịch vụ <strong>{removeTarget?.name}</strong>? Dịch vụ này chưa có lịch hẹn nào nên có thể xoá an toàn.</>
        }
        onConfirm={async () => {
          if (!removeTarget) return;
          const target = removeTarget;
          try { await catalogApi.removeService(target.id); toast.success('Đã xoá dịch vụ'); void load(); }
          catch (e) {
            // Máy chủ chặn (409) vì vừa phát sinh lịch hẹn → chuyển sang luồng ngừng kinh doanh
            const status = (e as { response?: { status?: number } })?.response?.status;
            if (status === 409) { setRetireTarget({ ...target, appointmentCount: Math.max(1, target.appointmentCount ?? 0) }); void load(); }
            else toast.error(getErrorMessage(e));
          }
        }}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!retireTarget}
        title="Không thể xoá dịch vụ đã có lịch hẹn"
        confirmLabel={retireTarget?.isActive ? 'Ngừng kinh doanh' : 'Đã hiểu'}
        cancelLabel="Để sau"
        message={
          <div className="space-y-2.5">
            <p className="flex items-start gap-2">
              <Ban size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>{retireTarget?.name}</strong> đã có {retireTarget?.appointmentCount ?? 1} lịch hẹn tham chiếu.
                Xoá sẽ làm mất thông tin dịch vụ trong các lịch hẹn và phiếu tính tiền đó.
              </span>
            </p>
            <p className="text-ink-muted">
              {retireTarget?.isActive
                ? 'Chuyển sang “Ngừng kinh doanh”: khách không đặt được nữa, còn lịch sử vẫn giữ nguyên. Bạn có thể mở bán lại bất cứ lúc nào.'
                : 'Dịch vụ này đã ở trạng thái ngừng kinh doanh và vẫn được giữ lại để bảo toàn lịch sử.'}
            </p>
          </div>
        }
        onConfirm={async () => {
          if (retireTarget?.isActive) await toggleActive(retireTarget, false);
        }}
        onClose={() => setRetireTarget(null)}
      />
    </div>
  );
}

function StatTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="hover-lift p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
        <span className="text-teal-600">{icon}</span> {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
// Form quan ly dich vu - Bui Quang Minh