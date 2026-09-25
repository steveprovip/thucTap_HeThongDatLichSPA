import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePercent, Banknote, Pencil, Plus, Search, Ticket, Trash2 } from 'lucide-react';
import { getErrorMessage, invoicesApi } from '@/api';
import type { DiscountType, Voucher } from '@/types';
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal, Notice, SectionTitle, Toggle, TableSkeleton } from '@/components';
import {
  addDaysISO, formatDate, formatNumber, formatVnd, matchSearch, parseNumber, todayISO,
} from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const MAX_AMOUNT = 20_000_000;
const SAMPLE_ORDER = 500_000;

type VoucherState = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';
type Filter = 'all' | VoucherState;

const STATE_META: Record<VoucherState, { label: string; cls: string }> = {
  active: { label: 'Đang áp dụng', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  scheduled: { label: 'Chưa tới ngày', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  expired: { label: 'Hết hạn', cls: 'border-red-200 bg-red-50 text-red-700' },
  exhausted: { label: 'Hết lượt', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  inactive: { label: 'Đã ngưng', cls: 'border-slate-300 bg-slate-100 text-slate-600' },
};

const stateOf = (v: Voucher, today = todayISO()): VoucherState => {
  if (!v.isActive) return 'inactive';
  if (today < v.startDate) return 'scheduled';
  if (today > v.endDate) return 'expired';
  if (v.maxUsage !== null && v.usedCount >= v.maxUsage) return 'exhausted';
  return 'active';
};

const discountOf = (type: DiscountType, value: number, subtotal: number) =>
  Math.min(subtotal, type === 'percent' ? Math.round((subtotal * value) / 100) : value);

const vnDate = (iso: string) => formatDate(`${iso}T00:00:00+07:00`);

interface Form {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: number;
  startDate: string;
  endDate: string;
  maxUsage: number | '';
  isActive: boolean;
}

const emptyForm = (): Form => ({
  code: '', description: '', discountType: 'percent', discountValue: 10, minOrderValue: 0,
  startDate: todayISO(), endDate: addDaysISO(todayISO(), 30), maxUsage: '', isActive: true,
});

/** S4-02: mã giảm giá theo phần trăm hoặc số tiền cố định, có hạn dùng và đơn tối thiểu. */
export function VouchersPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const toast = useToast();

  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Voucher | null>(null);

  const load = useCallback(async () => {
    try { setItems(await invoicesApi.vouchers()); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, active: 0, scheduled: 0, expired: 0, exhausted: 0, inactive: 0 };
    items.forEach((v) => { c[stateOf(v)] += 1; });
    return c;
  }, [items]);

  const visible = items
    .filter((v) => filter === 'all' || stateOf(v) === filter)
    .filter((v) => !query.trim() || matchSearch(`${v.code} ${v.description ?? ''}`, query));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const errors = (() => {
    const e: Partial<Record<keyof Form, string>> = {};
    const code = form.code.trim();
    if (!code) e.code = 'Vui lòng nhập mã';
    else if (!/^[A-Z0-9_-]{3,20}$/.test(code)) e.code = 'Mã 3–20 ký tự, chỉ gồm chữ không dấu, số, - và _';
    else if (items.some((v) => v.id !== editing?.id && v.code.toUpperCase() === code)) e.code = 'Mã này đã tồn tại';
    if (form.discountValue <= 0) e.discountValue = 'Giá trị giảm phải lớn hơn 0';
    else if (form.discountType === 'percent' && form.discountValue > 100) e.discountValue = 'Phần trăm giảm tối đa 100%';
    else if (form.discountType === 'amount' && form.discountValue > MAX_AMOUNT) e.discountValue = `Tối đa ${formatVnd(MAX_AMOUNT)}`;
    if (form.minOrderValue < 0) e.minOrderValue = 'Không được âm';
    else if (form.minOrderValue > MAX_AMOUNT * 5) e.minOrderValue = 'Giá trị quá lớn';
    if (!form.startDate || !form.endDate) e.endDate = 'Vui lòng chọn đủ ngày';
    else if (form.endDate < form.startDate) e.endDate = 'Ngày hết hạn phải sau ngày bắt đầu';
    if (form.maxUsage !== '' && form.maxUsage < 1) e.maxUsage = 'Tối thiểu 1 lượt';
    else if (form.maxUsage !== '' && editing && form.maxUsage < editing.usedCount) {
      e.maxUsage = `Mã đã được dùng ${editing.usedCount} lượt`;
    }
    return e;
  })();
  const shown = touched ? errors : {};

  const openCreate = () => {
    setEditing(null); setForm(emptyForm()); setTouched(false); setServerError(null); setOpen(true);
  };
  const openEdit = (v: Voucher) => {
    setEditing(v);
    setForm({
      code: v.code, description: v.description ?? '', discountType: v.discountType, discountValue: v.discountValue,
      minOrderValue: v.minOrderValue ?? 0, startDate: v.startDate, endDate: v.endDate,
      maxUsage: v.maxUsage ?? '', isActive: v.isActive,
    });
    setTouched(false); setServerError(null); setOpen(true);
  };

  const save = async () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    const payload = {
      code: form.code.trim(), description: form.description.trim() || null, discountType: form.discountType,
      discountValue: form.discountValue, minOrderValue: form.minOrderValue || null,
      startDate: form.startDate, endDate: form.endDate,
      maxUsage: form.maxUsage === '' ? null : Number(form.maxUsage), isActive: form.isActive,
    };
    try {
      if (editing) { await invoicesApi.updateVoucher(editing.id, payload); toast.success(`Đã cập nhật mã ${payload.code}`); }
      else { await invoicesApi.createVoucher(payload); toast.success(`Đã tạo mã ${payload.code}`); }
      setOpen(false);
      void load();
    } catch (e) {
      setServerError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (v: Voucher, next: boolean) => {
    setItems((l) => l.map((x) => (x.id === v.id ? { ...x, isActive: next } : x)));
    try {
      await invoicesApi.updateVoucher(v.id, { isActive: next });
      toast.success(next ? `Đã bật lại mã ${v.code}` : `Đã ngưng mã ${v.code}`);
    } catch (e) {
      setItems((l) => l.map((x) => (x.id === v.id ? { ...x, isActive: !next } : x)));
      toast.error(getErrorMessage(e));
    }
  };

  const sample = Math.max(SAMPLE_ORDER, form.minOrderValue);
  const sampleDiscount = discountOf(form.discountType, form.discountValue, sample);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Mã giảm giá"
        description="Mỗi phiếu tính tiền áp được một mã. Phiếu lưu cả tổng trước giảm, số tiền giảm và tổng thực thu."
        action={canEdit && <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Tạo mã</Button>}
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-1">
          {(['all', 'active', 'scheduled', 'expired', 'exhausted', 'inactive'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                    className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold
                      ${filter === f ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : 'text-ink-muted hover:bg-slate-100'}`}>
              {f === 'all' ? 'Tất cả' : STATE_META[f].label}
              <span className="rounded-full bg-slate-100 px-1.5">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm mã…" className="pl-9"
                 aria-label="Tìm mã giảm giá" />
        </div>
      </div>

      {loading ? <TableSkeleton cols={6} /> : visible.length === 0 ? (
        <EmptyState icon={<Ticket size={30} />}
                    title={items.length ? 'Không có mã nào khớp bộ lọc' : 'Chưa có mã giảm giá nào'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th><th>Loại</th><th className="text-right">Mức giảm</th><th className="text-right">Đơn tối thiểu</th>
                <th>Hiệu lực</th><th>Đã dùng</th><th>Trạng thái</th>{canEdit && <th className="text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => {
                const st = STATE_META[stateOf(v)];
                const usage = v.maxUsage ? Math.min(100, Math.round((v.usedCount / v.maxUsage) * 100)) : null;
                return (
                  <tr key={v.id}>
                    <td className="min-w-[160px]">
                      <span className="font-mono font-bold tracking-wide text-teal-700">{v.code}</span>
                      {v.description && <span className="block text-xs text-ink-muted">{v.description}</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {v.discountType === 'percent'
                        ? <span className="inline-flex items-center gap-1"><BadgePercent size={13} /> Phần trăm</span>
                        : <span className="inline-flex items-center gap-1"><Banknote size={13} /> Số tiền</span>}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold">
                      {v.discountType === 'percent' ? `${v.discountValue}%` : formatVnd(v.discountValue)}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs">
                      {v.minOrderValue ? formatVnd(v.minOrderValue) : <span className="text-ink-muted">Không yêu cầu</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs">{vnDate(v.startDate)} – {vnDate(v.endDate)}</td>
                    <td className="min-w-[110px] text-xs">
                      {v.usedCount}{v.maxUsage !== null ? ` / ${v.maxUsage}` : ' lượt'}
                      {usage !== null && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full ${usage >= 100 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${usage}%` }} />
                        </div>
                      )}
                    </td>
                    <td><span className={`chip border ${st.cls}`}>{st.label}</span></td>
                    {canEdit && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Toggle size="sm" checked={v.isActive} onChange={(n) => toggle(v, n)}
                                  label={v.isActive ? `Ngưng mã ${v.code}` : `Bật mã ${v.code}`} />
                          <Button size="sm" variant="ghost" onClick={() => openEdit(v)} aria-label={`Sửa ${v.code}`}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(v)} aria-label={`Xoá ${v.code}`}>
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title={editing ? `Sửa mã ${editing.code}` : 'Tạo mã giảm giá'} onClose={() => setOpen(false)}
             size="md"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
               <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo mã'}</Button>
             </div>}>
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã" required error={shown.code} hint="VD: NGAYTHUONG10">
              <Input value={form.code} maxLength={20} className="font-mono uppercase tracking-wider" invalid={!!shown.code}
                     onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} />
            </Field>
            <Field label="Mô tả">
              <Input value={form.description} maxLength={120} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="field-label">Kiểu giảm <span className="text-red-600">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {([['percent', 'Theo phần trăm', <BadgePercent size={16} key="p" />],
                ['amount', 'Số tiền cố định (đ)', <Banknote size={16} key="a" />]] as const).map(([id, label, icon]) => (
                <button key={id} type="button" aria-pressed={form.discountType === id}
                        onClick={() => { set('discountType', id); set('discountValue', id === 'percent' ? 10 : 50_000); }}
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold
                          ${form.discountType === id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-ink-soft hover:border-slate-400'}`}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={form.discountType === 'percent' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (đ)'} required
                   error={shown.discountValue}>
              <Input
                value={form.discountType === 'percent' ? String(form.discountValue) : formatNumber(form.discountValue)}
                inputMode="numeric" invalid={!!shown.discountValue}
                onChange={(e) => set('discountValue', Math.min(parseNumber(e.target.value), 999_999_999))}
              />
            </Field>
            <Field label="Giá trị đơn tối thiểu (đ)" error={shown.minOrderValue} hint="Để 0 nếu không yêu cầu">
              <Input value={formatNumber(form.minOrderValue)} inputMode="numeric" invalid={!!shown.minOrderValue}
                     onChange={(e) => set('minOrderValue', Math.min(parseNumber(e.target.value), 999_999_999))} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Từ ngày" required>
              <input type="date" className="field-input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="Hết hạn" required error={shown.endDate}>
              <input type="date" className="field-input" value={form.endDate} min={form.startDate}
                     onChange={(e) => set('endDate', e.target.value)} />
            </Field>
            <Field label="Giới hạn lượt" error={shown.maxUsage} hint="Bỏ trống = không giới hạn">
              <Input type="number" min={1} value={form.maxUsage}
                     onChange={(e) => set('maxUsage', e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <p className="text-sm font-medium">Kích hoạt mã</p>
            <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Kích hoạt mã" />
          </div>

          {!errors.discountValue && (
            <Notice tone="info" title="Xem trước">
              Đơn {formatVnd(sample)} → giảm <strong>{formatVnd(sampleDiscount)}</strong>, khách trả {formatVnd(sample - sampleDiscount)}.
              {form.minOrderValue > 0 && ` Đơn dưới ${formatVnd(form.minOrderValue)} sẽ không áp được mã.`}
            </Notice>
          )}
          {form.discountType === 'amount' && form.minOrderValue > 0 && form.discountValue > form.minOrderValue && (
            <Notice tone="warning">Số tiền giảm lớn hơn giá trị đơn tối thiểu — đơn nhỏ có thể về 0 đ.</Notice>
          )}
          {serverError && <Notice tone="danger">{serverError}</Notice>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Xoá mã giảm giá"
        confirmLabel="Xoá mã"
        message={removeTarget?.usedCount
          ? `Mã ${removeTarget.code} đã được dùng ${removeTarget.usedCount} lượt. Nên tắt mã thay vì xoá để giữ lịch sử. Vẫn xoá?`
          : `Xoá vĩnh viễn mã ${removeTarget?.code}?`}
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await invoicesApi.removeVoucher(removeTarget.id); toast.success('Đã xoá mã'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
