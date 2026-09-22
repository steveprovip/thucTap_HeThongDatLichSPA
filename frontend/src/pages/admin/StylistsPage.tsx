import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Star, UserRound } from 'lucide-react';
import { catalogApi, getErrorMessage, stylistsApi } from '@/api';
import type { ServiceItem, Stylist } from '@/types';
import { Button, Card, Field, Input, Modal, SectionTitle, Spinner, Textarea } from '@/components';
import { VN_PHONE_REGEX } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const MAX_AVATAR_MB = 2;

/** S1-07: hồ sơ thợ và danh sách dịch vụ mỗi thợ làm được. */
export function StylistsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Stylist | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sty, svc] = await Promise.all([stylistsApi.list(), catalogApi.services()]);
      setStylists(sty); setServices(svc);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null); setFullName(''); setPhone(''); setBio(''); setIsActive(true);
    setServiceIds([]); setError(null); setOpen(true);
  };
  const openEdit = (s: Stylist) => {
    setEditing(s); setFullName(s.fullName); setPhone(s.phone ?? ''); setBio(s.bio ?? '');
    setIsActive(s.isActive); setServiceIds(s.serviceIds); setError(null); setOpen(true);
  };

  const save = async () => {
    setError(null);
    if (!fullName.trim()) return setError('Vui lòng nhập họ tên thợ');
    if (phone && !VN_PHONE_REGEX.test(phone)) return setError('Số điện thoại phải gồm đúng 10 chữ số');
    setSaving(true);
    try {
      const payload = { fullName: fullName.trim(), phone: phone || undefined, bio: bio || undefined, isActive, serviceIds };
      if (editing) { await stylistsApi.update(editing.id, payload); toast.success('Đã cập nhật hồ sơ thợ'); }
      else { await stylistsApi.create(payload); toast.success('Đã tạo hồ sơ thợ'); }
      setOpen(false); void load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (!editing) return;
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      return toast.error(`Ảnh vượt quá ${MAX_AVATAR_MB}MB`);
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return toast.error('Chỉ chấp nhận ảnh định dạng JPG hoặc PNG');
    }
    try {
      const updated = await stylistsApi.uploadAvatar(editing.id, file);
      setEditing(updated);
      toast.success('Đã cập nhật ảnh đại diện');
      void load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Hồ sơ thợ"
        description="Gán được nhiều dịch vụ cho một thợ và nhiều thợ cho một dịch vụ. Thợ nghỉ việc vẫn giữ lịch sử nhưng không nhận lịch mới."
        action={canEdit && <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Thêm thợ</Button>}
      />

      {loading ? <Spinner /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stylists.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                {s.avatarUrl ? (
                  <img src={s.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <UserRound size={24} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.fullName}</p>
                  <p className="text-xs text-ink-muted">{s.phone ?? 'Chưa có số điện thoại'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.isActive
                      ? <span className="chip border border-green-300 bg-green-50 text-green-700">Đang làm việc</span>
                      : <span className="chip border border-gray-300 bg-gray-100 text-gray-600">Đã nghỉ việc</span>}
                    {s.avgRating !== null && (
                      <span className="chip border border-amber-300 bg-amber-50 text-amber-800">
                        <Star size={11} className="fill-amber-400 text-amber-400" /> {s.avgRating} ({s.reviewCount})
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {s.bio && <p className="mt-2 text-xs text-ink-soft">{s.bio}</p>}
              <p className="mt-2 text-xs text-ink-muted">
                <strong>{s.serviceIds.length}</strong> dịch vụ: {s.serviceNames.slice(0, 3).join(', ')}
                {s.serviceNames.length > 3 && `, +${s.serviceNames.length - 3} nữa`}
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openEdit(s)}>Sửa hồ sơ</Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={editing ? `Hồ sơ ${editing.fullName}` : 'Thêm thợ mới'}
        onClose={() => setOpen(false)}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
            <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo hồ sơ'}</Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          {editing && (
            <div className="flex items-center gap-3">
              {editing.avatarUrl ? (
                <img src={editing.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <UserRound size={26} />
                </span>
              )}
              <div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden"
                       onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button size="sm" variant="outline" icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>
                  Đổi ảnh đại diện
                </Button>
                <p className="mt-1 text-xs text-ink-muted">Tối đa {MAX_AVATAR_MB}MB, định dạng JPG hoặc PNG</p>
              </div>
            </div>
          )}

          <Field label="Họ tên" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Số điện thoại">
            <Input value={phone} inputMode="numeric"
                   onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          </Field>
          <Field label="Giới thiệu ngắn">
            <Textarea value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
          </Field>
          <Field label="Dịch vụ đảm nhận" required>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 thin-scroll">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-brand-100 px-2.5 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-brand-300"
                         checked={serviceIds.includes(s.id)}
                         onChange={(e) => setServiceIds((l) =>
                           e.target.checked ? [...l, s.id] : l.filter((x) => x !== s.id))} />
                  <span className="min-w-0 truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-brand-300"
                   checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Đang làm việc
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
