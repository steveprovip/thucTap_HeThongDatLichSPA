import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FolderPlus,
  HelpCircle,
  Hourglass,
  Lock,
  Pencil,
  PlusCircle,
  Search,
  ShieldAlert,
  Trash2,
  Wallet,
} from 'lucide-react';
import { catalogApi, getErrorMessage, stylistsApi } from '@/api';
import type { ServiceCategory, ServiceItem, Stylist } from '@/types';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  SectionTitle,
  Select,
  SmartImage,
  TableSkeleton,
  Textarea,
  Toggle,
} from '@/components';
import { assignServiceImages, serviceMediaKind } from '@/utils/images';
import { formatDuration, formatNumber, formatVnd, matchSearch, parseNumber } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

// --- HẰNG SỐ CẤU HÌNH ---
const DURATION_STEP_MINUTES = 15;
const DURATION_OPTIONS = Array.from({ length: 16 }, (_, idx) => (idx + 1) * DURATION_STEP_MINUTES);
const MAX_SERVICE_PRICE = 20_000_000;
const TAB_ALL_KEY = '__all__';
const LOCKED_SERVICE_MSG = 'Dịch vụ đã có lịch hẹn, chỉ có thể ngừng kinh doanh';

type FilterStatus = 'all' | 'active' | 'inactive';

interface ServiceFormValues {
  name: string;
  categoryId: string;
  duration: number;
  price: number;
  description: string;
  isActive: boolean;
  stylistIds: string[];
}

const INITIAL_FORM_STATE: ServiceFormValues = {
  name: '',
  categoryId: '',
  duration: 30,
  price: 0,
  description: '',
  isActive: true,
  stylistIds: [],
};

/** Kiểm tra tính hợp lệ của dữ liệu dịch vụ */
function validateServiceForm(data: ServiceFormValues): Partial<Record<keyof ServiceFormValues, string>> {
  const errs: Partial<Record<keyof ServiceFormValues, string>> = {};

  const cleanName = data.name.trim();
  if (!cleanName) errs.name = 'Vui lòng nhập tên dịch vụ';
  else if (cleanName.length > 120) errs.name = 'Tên dịch vụ tối đa 120 ký tự';

  if (!data.categoryId) errs.categoryId = 'Vui lòng chọn nhóm dịch vụ';

  if (data.duration % DURATION_STEP_MINUTES !== 0 || data.duration < 15 || data.duration > 240) {
    errs.duration = 'Thời lượng phải là bội số của 15 phút, từ 15 đến 240 phút';
  }

  if (data.price <= 0) errs.price = 'Giá phải lớn hơn 0';
  else if (data.price > MAX_SERVICE_PRICE) errs.price = `Giá tối đa ${formatVnd(MAX_SERVICE_PRICE)}`;

  return errs;
}

export function ServicesPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const { success: showSuccess, error: showError, warning: showWarning } = useToast();

  // Data states
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>(TAB_ALL_KEY);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  // Service Modal Form states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [formData, setFormData] = useState<ServiceFormValues>(INITIAL_FORM_STATE);
  const [isFormTouched, setIsFormTouched] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Action Dialog states
  const [deleteCandidate, setDeleteCandidate] = useState<ServiceItem | null>(null);
  const [retireCandidate, setRetireCandidate] = useState<ServiceItem | null>(null);

  // Category Modal states
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catNameInput, setCatNameInput] = useState('');
  const [catOrderInput, setCatOrderInput] = useState(1);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);

  // Tải dữ liệu ban đầu
  const fetchData = useCallback(async () => {
    try {
      const [categoryRes, serviceRes, stylistRes] = await Promise.all([
        catalogApi.categories(),
        catalogApi.services(),
        stylistsApi.list(),
      ]);
      setCategories([...categoryRes].sort((a, b) => a.displayOrder - b.displayOrder));
      setServices(serviceRes);
      setStylists(stylistRes);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Điều hướng tab về ALL nếu danh mục hiện tại bị xoá
  useEffect(() => {
    if (activeCategoryTab !== TAB_ALL_KEY && !categories.some((cat) => cat.id === activeCategoryTab)) {
      setActiveCategoryTab(TAB_ALL_KEY);
    }
  }, [categories, activeCategoryTab]);

  // Thống kê số lượng theo nhóm
  const categoryCountMap = useMemo(() => {
    return services.reduce<Record<string, number>>((acc, item) => {
      acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1;
      return acc;
    }, {});
  }, [services]);

  const servicePhotos = useMemo(() => assignServiceImages(services), [services]);

  // Lọc danh sách hiển thị
  const filteredServices = useMemo(() => {
    return services.filter((item) => {
      const matchCategory = activeCategoryTab === TAB_ALL_KEY || item.categoryId === activeCategoryTab;
      const matchStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? item.isActive : !item.isActive);
      const matchText =
        !searchQuery.trim() || matchSearch(`${item.name} ${item.description ?? ''}`, searchQuery);

      return matchCategory && matchStatus && matchText;
    });
  }, [services, activeCategoryTab, statusFilter, searchQuery]);

  // Thống kê chung
  const summaryMetrics = useMemo(() => {
    const activeList = services.filter((s) => s.isActive);
    const totalPrice = activeList.reduce((acc, s) => acc + s.price, 0);
    const avgPrice = activeList.length ? Math.round(totalPrice / activeList.length) : 0;
    return {
      total: services.length,
      activeCount: activeList.length,
      inactiveCount: services.length - activeList.length,
      avgPrice,
    };
  }, [services]);

  const unassignedServices = useMemo(() => {
    return services.filter((s) => s.isActive && s.hasNoStylist);
  }, [services]);

  const formErrors = validateServiceForm(formData);
  const visibleFormErrors = isFormTouched ? formErrors : {};

  // Handlers mở Modal Form
  const handleOpenCreateModal = () => {
    setEditingService(null);
    setFormData({
      ...INITIAL_FORM_STATE,
      categoryId: activeCategoryTab !== TAB_ALL_KEY ? activeCategoryTab : categories[0]?.id ?? '',
    });
    setIsFormTouched(false);
    setApiErrorMessage(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (item: ServiceItem) => {
    setEditingService(item);
    setFormData({
      name: item.name,
      categoryId: item.categoryId,
      duration: item.durationMinutes,
      price: item.price,
      description: item.description ?? '',
      isActive: item.isActive,
      stylistIds: [...item.stylistIds],
    });
    setIsFormTouched(false);
    setApiErrorMessage(null);
    setIsFormModalOpen(true);
  };

  // Lưu thông tin Dịch vụ (Thêm / Sửa)
  const handleSaveService = async () => {
    setIsFormTouched(true);
    setApiErrorMessage(null);

    if (Object.keys(formErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const payload = {
        categoryId: formData.categoryId,
        name: formData.name.trim(),
        durationMinutes: formData.duration,
        price: formData.price,
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
        stylistIds: formData.stylistIds,
      };

      if (editingService) {
        await catalogApi.updateService(editingService.id, payload);
        showSuccess('Đã cập nhật dịch vụ');
      } else {
        await catalogApi.createService(payload);
        showSuccess('Đã thêm dịch vụ mới');
      }

      setIsFormModalOpen(false);
      void fetchData();
    } catch (err) {
      setApiErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chuyển đổi trạng thái Bật / Tắt dịch vụ
  const handleToggleStatus = async (item: ServiceItem, nextState: boolean) => {
    setPendingToggleId(item.id);
    // Optimistic Update
    setServices((prev) => prev.map((s) => (s.id === item.id ? { ...s, isActive: nextState } : s)));

    try {
      await catalogApi.updateService(item.id, { isActive: nextState });
      showSuccess(nextState ? `Đã mở bán “${item.name}”` : `Đã ngừng bán “${item.name}”`);
    } catch (err) {
      // Revert nếu lỗi
      setServices((prev) => prev.map((s) => (s.id === item.id ? { ...s, isActive: !nextState } : s)));
      showError(getErrorMessage(err));
    } finally {
      setPendingToggleId(null);
    }
  };

  // Quản lý Danh mục
  const handleOpenCatModal = () => {
    setEditingCategory(null);
    setCatNameInput('');
    setCatOrderInput((categories[categories.length - 1]?.displayOrder ?? 0) + 1);
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async () => {
    const trimmedName = catNameInput.trim();
    if (!trimmedName) return showWarning('Vui lòng nhập tên nhóm');

    const isDuplicate = categories.some(
      (c) => c.id !== editingCategory?.id && c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) return showWarning('Tên nhóm đã tồn tại');

    try {
      if (editingCategory) {
        await catalogApi.updateCategory(editingCategory.id, { name: trimmedName, displayOrder: catOrderInput });
        showSuccess('Đã đổi tên nhóm');
      } else {
        await catalogApi.createCategory({ name: trimmedName, displayOrder: catOrderInput });
        showSuccess('Đã tạo nhóm dịch vụ');
      }
      setEditingCategory(null);
      setCatNameInput('');
      setCatOrderInput((prev) => prev + 1);
      void fetchData();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const handleRemoveCategory = async (category: ServiceCategory) => {
    const boundCount = categoryCountMap[category.id] ?? 0;
    if (boundCount > 0) {
      return showWarning(`Nhóm “${category.name}” còn ${boundCount} dịch vụ. Hãy chuyển dịch vụ sang nhóm khác trước.`);
    }

    try {
      await catalogApi.removeCategory(category.id);
      showSuccess('Đã xoá nhóm');
      void fetchData();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const activeStylistList = useMemo(() => stylists.filter((s) => s.isActive), [stylists]);

  return (
    <div className="space-y-4">
      {/* Tiêu đề trang */}
      <SectionTitle
        title="Dịch vụ & bảng giá"
        description={
          isOwner
            ? 'Thời lượng là bội số của 15 phút (15–240). Giá tối đa 20.000.000 đ. Đổi thời lượng không làm thay đổi lịch đã đặt.'
            : 'Bạn đang xem ở chế độ chỉ đọc. Chỉ Chủ tiệm mới sửa được bảng giá.'
        }
        action={
          isOwner && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<FolderPlus size={15} />} onClick={handleOpenCatModal}>
                Nhóm dịch vụ
              </Button>
              <Button size="sm" icon={<PlusCircle size={15} />} onClick={handleOpenCreateModal}>
                Thêm dịch vụ
              </Button>
            </div>
          )
        }
      />

      {/* Các thẻ thống kê */}
      <div className="grid gap-3 sm:grid-cols-3">
        <OverviewCard
          icon={<FolderPlus size={16} />}
          title="Tổng dịch vụ"
          value={String(summaryMetrics.total)}
          subtext={`${categories.length} nhóm`}
        />
        <OverviewCard
          icon={<Hourglass size={16} />}
          title="Đang bán"
          value={String(summaryMetrics.activeCount)}
          subtext={`${summaryMetrics.inactiveCount} đang ngừng bán`}
        />
        <OverviewCard
          icon={<Wallet size={16} />}
          title="Giá trung bình"
          value={formatVnd(summaryMetrics.avgPrice)}
          subtext="Tính trên dịch vụ đang bán"
        />
      </div>

      {/* Cảnh báo dịch vụ chưa có thợ */}
      {unassignedServices.length > 0 && (
        <Notice tone="warning" icon={<AlertCircle size={16} />} title={`${unassignedServices.length} dịch vụ đang bán nhưng chưa có thợ đảm nhận`}>
          {unassignedServices.map((s) => s.name).join(', ')}. Khách sẽ không đặt được các dịch vụ này.
        </Notice>
      )}

      {/* Danh sách tab danh mục */}
      <nav className="thin-scroll -mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Nhóm dịch vụ" className="flex min-w-max gap-1.5 border-b border-slate-200 pb-2">
          {[{ id: TAB_ALL_KEY, name: 'Tất cả', count: services.length },
            ...categories.map((c) => ({ id: c.id, name: c.name, count: categoryCountMap[c.id] ?? 0 })),
          ].map((tab) => {
            const isSelected = activeCategoryTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveCategoryTab(tab.id)}
                className={`flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                  isSelected
                    ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                    : 'text-ink-muted hover:bg-slate-100 hover:text-ink'
                }`}
              >
                {tab.name}
                <span className={`rounded-full px-1.5 text-[11px] ${isSelected ? 'bg-teal-100' : 'bg-slate-100'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Thanh tìm kiếm & lọc */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc mô tả…"
            className="pl-9"
            aria-label="Tìm dịch vụ"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
          className="sm:w-48"
          aria-label="Lọc trạng thái"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Ngừng bán</option>
        </Select>
      </div>

      {/* Bảng dữ liệu dịch vụ */}
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : filteredServices.length === 0 ? (
        <EmptyState
          icon={<FolderPlus size={30} />}
          title={services.length === 0 ? 'Chưa có dịch vụ nào' : 'Không có dịch vụ khớp bộ lọc'}
          action={
            isOwner && services.length === 0 ? (
              <Button size="sm" icon={<PlusCircle size={15} />} onClick={handleOpenCreateModal}>
                Thêm dịch vụ đầu tiên
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                {activeCategoryTab === TAB_ALL_KEY && <th>Nhóm</th>}
                <th className="text-right">Thời lượng</th>
                <th className="text-right">Giá</th>
                <th>Thợ đảm nhận</th>
                <th>Đang bán</th>
                {isOwner && <th className="text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((svc) => (
                <ServiceRowItem
                  key={svc.id}
                  item={svc}
                  showCategory={activeCategoryTab === TAB_ALL_KEY}
                  photoUrl={servicePhotos[svc.id]}
                  canEdit={isOwner}
                  isToggling={pendingToggleId === svc.id}
                  onToggleActive={(next) => handleToggleStatus(svc, next)}
                  onEdit={() => handleOpenEditModal(svc)}
                  onDelete={() => setDeleteCandidate(svc)}
                  onRequireRetire={() => setRetireCandidate(svc)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form Thêm / Sửa Dịch vụ */}
      <Modal
        open={isFormModalOpen}
        title={editingService ? `Sửa dịch vụ: ${editingService.name}` : 'Thêm dịch vụ'}
        onClose={() => setIsFormModalOpen(false)}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFormModalOpen(false)}>Đóng</Button>
            <Button loading={isSubmitting} onClick={handleSaveService}>
              {editingService ? 'Lưu thay đổi' : 'Tạo dịch vụ'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Tên dịch vụ" required error={visibleFormErrors.name} htmlFor="svc-name">
            <Input
              id="svc-name"
              value={formData.name}
              maxLength={120}
              invalid={!!visibleFormErrors.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="VD: Gội dưỡng sinh thảo mộc"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nhóm dịch vụ" required error={visibleFormErrors.categoryId} htmlFor="svc-cat">
              <Select
                id="svc-cat"
                value={formData.categoryId}
                invalid={!!visibleFormErrors.categoryId}
                onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
              >
                <option value="">— Chọn nhóm —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Thời lượng" required error={visibleFormErrors.duration} hint="Bước 15 phút · 15–240" htmlFor="svc-dur">
              <Select
                id="svc-dur"
                value={formData.duration}
                invalid={!!visibleFormErrors.duration}
                onChange={(e) => setFormData((prev) => ({ ...prev, duration: Number(e.target.value) }))}
              >
                {DURATION_OPTIONS.map((min) => (
                  <option key={min} value={min}>
                    {min} phút ({formatDuration(min)})
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Giá (đ)"
              required
              error={visibleFormErrors.price}
              hint={`${formatVnd(formData.price)} · tối đa ${formatNumber(MAX_SERVICE_PRICE)}`}
              htmlFor="svc-price"
            >
              <Input
                id="svc-price"
                value={formatNumber(formData.price)}
                inputMode="numeric"
                invalid={!!visibleFormErrors.price}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    price: Math.min(parseNumber(e.target.value), 999_999_999),
                  }))
                }
              />
            </Field>
          </div>

          <Field label="Mô tả ngắn" hint={`${formData.description.length}/500`}>
            <Textarea
              value={formData.description}
              maxLength={500}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
          </Field>

          <Field label="Thợ đảm nhận" hint="Dịch vụ không có thợ đảm nhận sẽ không hiện trên trang đặt lịch">
            <div className="flex flex-wrap gap-1.5">
              {activeStylistList.map((stylist) => {
                const isAssigned = formData.stylistIds.includes(stylist.id);
                return (
                  <button
                    key={stylist.id}
                    type="button"
                    aria-pressed={isAssigned}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        stylistIds: isAssigned
                          ? prev.stylistIds.filter((id) => id !== stylist.id)
                          : [...prev.stylistIds, stylist.id],
                      }))
                    }
                    className={`min-h-[36px] rounded-full border px-3 text-sm transition-colors ${
                      isAssigned
                        ? 'border-teal-600 bg-teal-50 text-teal-700'
                        : 'border-slate-300 text-ink-soft hover:border-slate-400'
                    }`}
                  >
                    {isAssigned ? '✓ ' : ''}{stylist.fullName}
                  </button>
                );
              })}

              {activeStylistList.length > 0 && (
                <button
                  type="button"
                  className="min-h-[36px] px-2 text-xs text-teal-700 hover:underline"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      stylistIds:
                        prev.stylistIds.length === activeStylistList.length
                          ? []
                          : activeStylistList.map((s) => s.id),
                    }))
                  }
                >
                  {formData.stylistIds.length === activeStylistList.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Trạng thái bán</p>
              <p className="text-xs text-ink-muted">
                {formData.isActive ? 'Khách nhìn thấy và đặt được dịch vụ này' : 'Ẩn khỏi trang đặt lịch, vẫn giữ lịch sử'}
              </p>
            </div>
            <Toggle
              checked={formData.isActive}
              onChange={(val) => setFormData((prev) => ({ ...prev, isActive: val }))}
              label="Đang bán"
            />
          </div>

          {editingService && editingService.durationMinutes !== formData.duration && (
            <Notice tone="info">Đổi thời lượng chỉ áp dụng cho lịch đặt mới, không ảnh hưởng lịch đã đặt.</Notice>
          )}

          {apiErrorMessage && <Notice tone="danger">{apiErrorMessage}</Notice>}
        </div>
      </Modal>

      {/* Modal Quản lý Nhóm dịch vụ */}
      <Modal
        open={isCatModalOpen}
        title="Nhóm dịch vụ"
        onClose={() => setIsCatModalOpen(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsCatModalOpen(false)}>Đóng</Button>
            <Button onClick={handleSaveCategory}>
              {editingCategory ? 'Lưu tên nhóm' : 'Thêm nhóm'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label={editingCategory ? `Đổi tên nhóm “${editingCategory.name}”` : 'Tên nhóm mới'} required>
            <Input
              value={catNameInput}
              onChange={(e) => setCatNameInput(e.target.value)}
              maxLength={60}
            />
          </Field>

          <Field label="Thứ tự hiển thị" hint="Quyết định thứ tự nhóm trên trang công khai">
            <Input
              type="number"
              min={1}
              value={catOrderInput}
              onChange={(e) => setCatOrderInput(Number(e.target.value))}
            />
          </Field>

          {editingCategory && (
            <button
              className="text-xs text-ink-muted hover:underline"
              onClick={() => {
                setEditingCategory(null);
                setCatNameInput('');
              }}
            >
              Huỷ sửa, quay lại thêm nhóm mới
            </button>
          )}

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-ink-muted">{cat.displayOrder}.</span> {cat.name}
                  <span className="ml-1 text-xs text-ink-muted">({categoryCountMap[cat.id] ?? 0})</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100"
                    aria-label={`Sửa nhóm ${cat.name}`}
                    onClick={() => {
                      setEditingCategory(cat);
                      setCatNameInput(cat.name);
                      setCatOrderInput(cat.displayOrder);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-red-600 hover:bg-slate-100"
                    aria-label={`Xoá nhóm ${cat.name}`}
                    onClick={() => handleRemoveCategory(cat)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Dialog xác nhận xóa vĩnh viễn */}
      <ConfirmDialog
        open={!!deleteCandidate}
        danger
        title="Xoá dịch vụ"
        confirmLabel="Xoá"
        message={
          <>
            Xoá vĩnh viễn dịch vụ <strong>{deleteCandidate?.name}</strong>? Dịch vụ này chưa có lịch hẹn nào nên có thể xoá an toàn.
          </>
        }
        onConfirm={async () => {
          if (!deleteCandidate) return;
          const target = deleteCandidate;
          try {
            await catalogApi.removeService(target.id);
            showSuccess('Đã xoá dịch vụ');
            void fetchData();
          } catch (err) {
            const statusCode = (err as { response?: { status?: number } })?.response?.status;
            if (statusCode === 409) {
              setRetireCandidate({
                ...target,
                appointmentCount: Math.max(1, target.appointmentCount ?? 0),
              });
              void fetchData();
            } else {
              showError(getErrorMessage(err));
            }
          }
        }}
        onClose={() => setDeleteCandidate(null)}
      />

      {/* Dialog thông báo không thể xóa (do ràng buộc lịch hẹn) */}
      <ConfirmDialog
        open={!!retireCandidate}
        title="Không thể xoá dịch vụ đã có lịch hẹn"
        confirmLabel={retireCandidate?.isActive ? 'Ngừng kinh doanh' : 'Đã hiểu'}
        cancelLabel="Để sau"
        message={
          <div className="space-y-2.5">
            <p className="flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                <strong>{retireCandidate?.name}</strong> đã có {retireCandidate?.appointmentCount ?? 1} lịch hẹn tham chiếu.
                Xoá sẽ làm mất thông tin dịch vụ trong các lịch hẹn và phiếu tính tiền đó.
              </span>
            </p>
            <p className="text-ink-muted">
              {retireCandidate?.isActive
                ? 'Chuyển sang “Ngừng kinh doanh”: khách không đặt được nữa, còn lịch sử vẫn giữ nguyên. Bạn có thể mở bán lại bất cứ lúc nào.'
                : 'Dịch vụ này đã ở trạng thái ngừng kinh doanh và vẫn được giữ lại để bảo toàn lịch sử.'}
            </p>
          </div>
        }
        onConfirm={async () => {
          if (retireCandidate?.isActive) {
            await handleToggleStatus(retireCandidate, false);
          }
        }}
        onClose={() => setRetireCandidate(null)}
      />
    </div>
  );
}

// --- SUB-COMPONENTS ---

/** Hàng dữ liệu bảng dịch vụ */
function ServiceRowItem({
  item,
  showCategory,
  photoUrl,
  canEdit,
  isToggling,
  onToggleActive,
  onEdit,
  onDelete,
  onRequireRetire,
}: {
  item: ServiceItem;
  showCategory: boolean;
  photoUrl?: string;
  canEdit: boolean;
  isToggling: boolean;
  onToggleActive: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onRequireRetire: () => void;
}) {
  const hasAppointments = (item.appointmentCount ?? 0) > 0;

  return (
    <tr className={item.isActive ? '' : 'opacity-60'}>
      <td className="min-w-[260px]">
        <div className="flex items-center gap-3">
          <SmartImage
            src={photoUrl}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-xl"
            kind={serviceMediaKind(item)}
          />
          <div className="min-w-0">
            <span className="font-medium text-ink">{item.name}</span>
            {item.description && <span className="block text-xs text-ink-muted">{item.description}</span>}
          </div>
        </div>
      </td>

      {showCategory && <td className="whitespace-nowrap text-xs text-ink-soft">{item.categoryName}</td>}

      <td className="whitespace-nowrap text-right">{formatDuration(item.durationMinutes)}</td>
      <td className="whitespace-nowrap text-right font-semibold text-teal-700">{item.priceText}</td>

      <td className="whitespace-nowrap text-xs">
        {item.stylistCount === 0 ? (
          <span className="chip border border-amber-200 bg-amber-50 text-amber-800">Chưa có thợ</span>
        ) : (
          <span className="text-ink-soft">{item.stylistCount} thợ</span>
        )}
      </td>

      <td>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Toggle
              size="sm"
              checked={item.isActive}
              disabled={isToggling}
              label={item.isActive ? 'Ngừng bán dịch vụ' : 'Mở bán dịch vụ'}
              onChange={onToggleActive}
            />
            <span className="text-xs text-ink-muted">{item.isActive ? 'Bật' : 'Tắt'}</span>
          </div>
        ) : item.isActive ? (
          <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">Đang bán</span>
        ) : (
          <span className="chip border border-slate-300 bg-slate-100 text-slate-600">Ngừng bán</span>
        )}
      </td>

      {canEdit && (
        <td>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Sửa ${item.name}`}>
              <Pencil size={14} /> Sửa
            </Button>

            {hasAppointments ? (
              <span className="group/tip relative inline-flex">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-disabled="true"
                  title={LOCKED_SERVICE_MSG}
                  aria-label={`${item.name}: ${LOCKED_SERVICE_MSG}`}
                  onClick={onRequireRetire}
                  className="cursor-not-allowed text-slate-400 opacity-60 hover:bg-transparent"
                >
                  <Lock size={14} />
                </Button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 w-56 -translate-y-1/2 translate-x-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-all duration-200 group-focus-within/tip:translate-x-0 group-focus-within/tip:opacity-100 group-hover/tip:translate-x-0 group-hover/tip:opacity-100"
                >
                  {LOCKED_SERVICE_MSG} ({item.appointmentCount} lịch hẹn).
                </span>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Xoá ${item.name}`}>
                <Trash2 size={14} className="text-red-600" />
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

/** Thẻ hiển thị chỉ số thống kê tổng quan */
function OverviewCard({
  icon,
  title,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card className="hover-lift p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
        <span className="text-teal-600">{icon}</span> {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {subtext && <p className="mt-0.5 text-xs text-ink-muted">{subtext}</p>}
    </Card>
  );
}