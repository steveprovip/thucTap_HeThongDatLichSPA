import { useCallback, useEffect, useState } from 'react';
import { Plus, Ticket, Trash2 } from 'lucide-react';
import { getErrorMessage, invoicesApi } from '@/api';
import type { DiscountType, Voucher } from '@/types';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, SectionTitle, Select, Spinner } from '@/components';
import { addDaysISO, formatDate, formatNumber, formatVnd, parseNumber, todayISO } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

/** S4-02: mã giảm giá đơn giản theo phần trăm hoặc theo số tiền. */
export function VouchersPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Voucher | null>(null);

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(10);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(addDaysISO(todayISO(), 30));
  const [maxUsage, setMaxUsage] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await invoicesApi.vouchers()); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setError(null);
    if (!/^[A-Za-z0-9_-]+$/.test(code)) return setError('Mã chỉ gồm chữ, số, gạch ngang và gạch dưới');
    if (discountValue <= 0) return setError('Giá trị giảm phải lớn hơn 0');
    if (discountType === 'percent' && discountValue > 100) return setError('Giảm theo phần trăm tối đa là 100');
    try {
      await invoicesApi.createVoucher({
        code: code.toUpperCase(), description: description || null, discountType, discountValue,
        startDate, endDate, maxUsage: maxUsage === '' ? null : Number(maxUsage), isActive: true,
      });
      toast.success('Đã tạo mã giảm giá');
      setOpen(false); void load();
    } catch (e) { setError(getErrorMessage(e)); }
  };

  const status = (v: Voucher): { label: string; cls: string } => {
    const today = todayISO();
    if (!v.isActive) return { label: 'Đã ngưng', cls: 'border-gray-300 bg-gray-100 text-gray-600' };
    if (today < v.startDate) return { label: 'Chưa tới ngày', cls: 'border-blue-300 bg-blue-50 text-blue-700' };
    if (today > v.endDate) return { label: 'Hết hạn', cls: 'border-red-300 bg-red-50 text-red-700' };
    if (v.maxUsage !== null && v.usedCount >= v.maxUsage) {
      return { label: 'Hết lượt', cls: 'border-amber-300 bg-amber-50 text-amber-800' };
    }
    return { label: 'Đang áp dụng', cls: 'border-green-300 bg-green-50 text-green-700' };
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Mã giảm giá"
        description="Một phiếu chỉ áp được một mã. Phiếu lưu cả tổng trước giảm, số tiền giảm và tổng thực thu."
        action={canEdit && <Button size="sm" icon={<Plus size={15} />} onClick={() => { setError(null); setOpen(true); }}>Tạo mã</Button>}
      />

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={<Ticket size={30} />} title="Chưa có mã giảm giá nào" />
      ) : (
        <Card className="overflow-hidden">
          <table className="table">
            <thead>
              <tr><th>Mã</th><th>Mô tả</th><th>Giảm</th><th>Hiệu lực</th>
                  <th className="text-right">Đã dùng</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((v) => {
                const st = status(v);
                return (
                  <tr key={v.id}>
                    <td className="font-mono font-semibold">{v.code}</td>
                    <td className="text-xs text-ink-muted">{v.description ?? '—'}</td>
                    <td>{v.discountType === 'percent' ? `${v.discountValue}%` : formatVnd(v.discountValue)}</td>
                    <td className="whitespace-nowrap text-xs">
                      {formatDate(`${v.startDate}T00:00:00+07:00`)} – {formatDate(`${v.endDate}T00:00:00+07:00`)}
                    </td>
                    <td className="text-right">{v.usedCount}{v.maxUsage !== null ? ` / ${v.maxUsage}` : ''}</td>
                    <td><span className={`chip border ${st.cls}`}>{st.label}</span></td>
                    <td className="text-right">
                      {canEdit && v.isActive && (
                        <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(v)}>
                          <Trash2 size={14} className="text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} title="Tạo mã giảm giá" onClose={() => setOpen(false)} size="sm"
             footer={<div className="flex justify-end gap-2">
               <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
               <Button onClick={save}>Tạo mã</Button>
             </div>}>
        <div className="space-y-3">
          <Field label="Mã" required hint="Không dấu, viết liền, VD: NGAYTHUONG10">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
          </Field>
          <Field label="Mô tả"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kiểu giảm" required>
              <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                <option value="percent">Theo phần trăm</option>
                <option value="amount">Theo số tiền</option>
              </Select>
            </Field>
            <Field label={discountType === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm (đ)'} required>
              <Input
                value={discountType === 'percent' ? String(discountValue) : formatNumber(discountValue)}
                inputMode="numeric"
                onChange={(e) => setDiscountValue(parseNumber(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Từ ngày" required>
              <input type="date" className="field-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Đến ngày" required>
              <input type="date" className="field-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Giới hạn số lượt" hint="Bỏ trống nếu không giới hạn">
            <Input type="number" min={1} value={maxUsage}
                   onChange={(e) => setMaxUsage(e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        danger
        title="Ngưng sử dụng mã giảm giá"
        message={`Mã ${removeTarget?.code} sẽ không áp dụng được nữa. Các phiếu đã dùng mã vẫn giữ nguyên số liệu.`}
        onConfirm={async () => {
          if (!removeTarget) return;
          try { await invoicesApi.removeVoucher(removeTarget.id); toast.success('Đã ngưng mã'); void load(); }
          catch (e) { toast.error(getErrorMessage(e)); }
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
