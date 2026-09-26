import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange, ImagePlus, LayoutGrid, List, Pencil, Plus, Search, Star, UserRound, X,
} from 'lucide-react';
import { appointmentsApi, catalogApi, getErrorMessage, stylistsApi } from '@/api';
import { DEMO_MODE } from '@/api/mockBackend';
import type { Appointment, ServiceCategory, ServiceItem, Shift, Stylist } from '@/types';
import {
  Button, Card, EmptyState, Field, Input, Modal, Notice, SectionTitle, Spinner, StylistAvatar, Textarea, Toggle,
} from '@/components';
import {
  addDaysISO, formatDate, matchSearch, startOfWeekISO, timeToMinutes, todayISO, VN_PHONE_REGEX,
} from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const MAX_AVATAR_MB = 2;
const AVATAR_PX = 256;

interface Capacity {
  shiftMinutes: number;
  bookedMinutes: number;
  appointments: number;
  days: number;
}

/** Thu nhỏ ảnh về 256px để lưu gọn (bản demo lưu dạng data URL). */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp không phải ảnh hợp lệ'));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_PX; canvas.height = AVATAR_PX;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh'));
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, AVATAR_PX, AVATAR_PX);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const shiftMinutes = (s: Shift) => {
  const total = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
  const rest = s.breakStart && s.breakEnd ? timeToMinutes(s.breakEnd) - timeToMinutes(s.breakStart) : 0;
  return Math.max(0, total - rest);
};

const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}`.replace('.', ',');

/** S1-07: hồ sơ thợ, kỹ năng (dịch vụ làm được) và công suất tuần. */
export function StylistsPage() {
  const { user } = useAuth();
  // Khớp RolesGuard backend: chỉ Chủ tiệm ghi hồ sơ thợ, Admin chỉ xem (PERMISSION_MATRIX)
  const canEdit = user?.role === 'owner';
  const toast = useToast();

  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [query, setQuery] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Stylist | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [skillQuery, setSkillQuery] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const weekStart = startOfWeekISO(todayISO());
  const weekEnd = addDaysISO(weekStart, 6);

  const load = useCallback(async () => {
    try {
      const [sty, svc, cats, sh, appts] = await Promise.all([
        stylistsApi.list(), catalogApi.services(), catalogApi.categories(),
        stylistsApi.shifts({ from: weekStart, to: weekEnd }),
        appointmentsApi.list({ from: weekStart, to: weekEnd, page: 1, limit: 1000 }),
      ]);
      setStylists(sty); setServices(svc); setShifts(sh); setAppointments(appts.items);
      setCategories([...cats].sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toast, weekStart, weekEnd]);

  useEffect(() => { void load(); }, [load]);

  const capacity = useMemo(() => {
    const map: Record<string, Capacity> = {};
    stylists.forEach((s) => { map[s.id] = { shiftMinutes: 0, bookedMinutes: 0, appointments: 0, days: 0 }; });
    shifts.forEach((sh) => {
      const c = map[sh.stylistId];
      if (!c) return;
      c.shiftMinutes += shiftMinutes(sh);
      c.days += 1;
    });
    appointments
      .filter((a) => !['cancelled', 'no_show'].includes(a.status))
      .forEach((a) => {
        const c = map[a.stylist.id];
        if (!c) return;
        c.bookedMinutes += a.totalDurationMinutes;
        c.appointments += 1;
      });
    return map;
  }, [stylists, shifts, appointments]);

  const totals = useMemo(() => {
    const values = Object.values(capacity);
    const shift = values.reduce((s, c) => s + c.shiftMinutes, 0);
    const booked = values.reduce((s, c) => s + c.bookedMinutes, 0);
    return { shift, booked, rate: shift ? Math.round((booked / shift) * 100) : 0 };
  }, [capacity]);

  const visible = stylists.filter((s) =>
    !query.trim() || matchSearch(`${s.fullName} ${s.phone ?? ''} ${s.serviceNames.join(' ')}`, query));

  const openCreate = () => {
    setEditing(null); setFullName(''); setPhone(''); setEmail(''); setBio(''); setIsActive(true);
    setServiceIds([]); setAvatar(null); setAvatarFile(null); setSkillQuery(''); setTouched(false); setError(null); setOpen(true);
  };
  const openEdit = (s: Stylist) => {
    setEditing(s); setFullName(s.fullName); setPhone(s.phone ?? ''); setEmail(s.email ?? ''); setBio(s.bio ?? '');
    setIsActive(s.isActive); setServiceIds([...s.serviceIds]); setAvatar(s.avatarUrl); setAvatarFile(null); setSkillQuery('');
    setTouched(false); setError(null); setOpen(true);
  };

  const fieldErrors = {
    fullName: !fullName.trim() ? 'Vui lòng nhập họ tên thợ' : undefined,
    phone: phone && !VN_PHONE_REGEX.test(phone) ? 'Số điện thoại phải gồm đúng 10 chữ số, bắt đầu bằng 0' : undefined,
    email: !editing && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Email không đúng định dạng' : undefined,
    skills: serviceIds.length === 0 ? 'Chọn ít nhất một dịch vụ thợ làm được' : undefined,
  };
  const shown: Partial<typeof fieldErrors> = touched ? fieldErrors : {};

  const pickAvatar = async (file: File) => {
    // S1-07: ảnh đại diện tối đa 2MB, định dạng JPG hoặc PNG (khớp fileFilter của backend)
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return toast.error('Chỉ chấp nhận ảnh JPG hoặc PNG');
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) return toast.error(`Ảnh vượt quá ${MAX_AVATAR_MB}MB`);
    try { setAvatar(await resizeImage(file)); setAvatarFile(file); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Không xử lý được ảnh'); }
  };

  const save = async () => {
    setTouched(true);
    setError(null);
    if (fieldErrors.fullName || fieldErrors.phone || fieldErrors.email || fieldErrors.skills) return;
    setSaving(true);
    try {
      const payload = {
        fullName: fullName.trim(), phone: phone || undefined, bio: bio.trim() || undefined, isActive, serviceIds,
      };
      let id: string;
      if (editing) {
        // Bản demo lưu ảnh dạng data URL; backend thật nhận ảnh qua POST /stylists/:id/avatar
        await stylistsApi.update(editing.id, DEMO_MODE ? { ...payload, avatarUrl: avatar } : payload);
        id = editing.id;
        toast.success('Đã cập nhật hồ sơ thợ và tài khoản nhân sự đi kèm');
      } else {
        const created = await stylistsApi.create({ ...payload, email: email.trim() || undefined });
        id = created.id;
        if (DEMO_MODE && avatar) await stylistsApi.update(created.id, { avatarUrl: avatar });
        toast.success(email.trim()
          ? `Đã tạo hồ sơ thợ và tài khoản đăng nhập, mật khẩu tạm gửi tới ${email.trim()}`
          : 'Đã tạo hồ sơ thợ (chưa có tài khoản đăng nhập)');
      }
      if (!DEMO_MODE && avatarFile) await stylistsApi.uploadAvatar(id, avatarFile);
      setOpen(false);
      void load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Stylist, next: boolean) => {
    setStylists((l) => l.map((x) => (x.id === s.id ? { ...x, isActive: next } : x)));
    try {
      await stylistsApi.update(s.id, { isActive: next });
      toast.success(next ? `${s.fullName} đã trở lại làm việc` : `${s.fullName} đã ngừng nhận lịch mới`);
    } catch (e) {
      setStylists((l) => l.map((x) => (x.id === s.id ? { ...x, isActive: !next } : x)));
      toast.error(getErrorMessage(e));
    }
  };

  const toggleSkill = (id: string) =>
    setServiceIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const toggleCategory = (catId: string) => {
    const ids = services.filter((s) => s.categoryId === catId).map((s) => s.id);
    const allOn = ids.every((id) => serviceIds.includes(id));
    setServiceIds((l) => (allOn ? l.filter((x) => !ids.includes(x)) : [...new Set([...l, ...ids])]));
  };

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Hồ sơ thợ"
        description="Một thợ làm được nhiều dịch vụ và một dịch vụ có nhiều thợ. Thợ nghỉ việc vẫn giữ lịch sử nhưng không nhận lịch mới."
        action={canEdit && <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>Thêm thợ</Button>}
      />

      {/* Tóm tắt công suất tuần */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold">
            <CalendarRange size={16} className="text-teal-600" />
            Công suất tuần {formatDate(`${weekStart}T00:00:00+07:00`)} – {formatDate(`${weekEnd}T00:00:00+07:00`)}
          </p>
          <p className="text-xs text-ink-muted">Giờ ca đã trừ giờ nghỉ giữa ca · lịch huỷ/không đến không tính</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs text-ink-muted">Tổng giờ ca</p><p className="text-xl font-bold">{hours(totals.shift)} giờ</p></div>
          <div><p className="text-xs text-ink-muted">Đã có khách đặt</p><p className="text-xl font-bold text-teal-700">{hours(totals.booked)} giờ</p></div>
          <div>
            <p className="text-xs text-ink-muted">Tỷ lệ lấp đầy</p>
            <p className="text-xl font-bold">{totals.rate}%</p>
            <UsageBar rate={totals.rate} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9"
                 placeholder="Tìm theo tên, số điện thoại hoặc dịch vụ…" aria-label="Tìm thợ" />
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Kiểu hiển thị">
          {([['cards', <LayoutGrid size={15} key="g" />, 'Thẻ'], ['table', <List size={15} key="l" />, 'Bảng']] as const)
            .map(([id, icon, label]) => (
              <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold
                        ${view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {icon} {label}
              </button>
            ))}
        </div>
      </div>

      {loading ? <Spinner /> : visible.length === 0 ? (
        <EmptyState icon={<UserRound size={30} />} title="Không tìm thấy thợ nào" />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => {
            const c = capacity[s.id];
            const rate = c?.shiftMinutes ? Math.round((c.bookedMinutes / c.shiftMinutes) * 100) : 0;
            return (
              <Card key={s.id} className={`flex flex-col p-4 ${s.isActive ? '' : 'opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <StylistAvatar id={s.id} name={s.fullName} url={s.avatarUrl} size="h-14 w-14" className="shadow-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{s.fullName}</p>
                    <p className="text-xs text-ink-muted">{s.phone ?? 'Chưa có số điện thoại'}</p>
                    <p className="truncate text-xs text-ink-muted">{s.email ?? 'Chưa có tài khoản đăng nhập'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ActiveChip active={s.isActive} />
                      {s.avgRating !== null && (
                        <span className="chip border border-amber-200 bg-amber-50 text-amber-800">
                          <Star size={11} className="fill-amber-400 text-amber-400" /> {s.avgRating.toFixed(1)} ({s.reviewCount})
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <Toggle size="sm" checked={s.isActive} onChange={(v) => toggleActive(s, v)}
                            label={s.isActive ? 'Cho thợ nghỉ việc' : 'Cho thợ làm lại'} />
                  )}
                </div>

                {s.bio && <p className="mt-2 line-clamp-2 text-xs text-ink-soft">{s.bio}</p>}

                <div className="mt-3 flex flex-wrap gap-1">
                  {s.serviceIds.slice(0, 4).map((id) => (
                    <span key={id} className="chip border border-slate-300 bg-slate-100 text-slate-700">{serviceName(id)}</span>
                  ))}
                  {s.serviceIds.length > 4 && (
                    <span className="chip border border-slate-200 text-ink-muted">+{s.serviceIds.length - 4}</span>
                  )}
                  {s.serviceIds.length === 0 && <span className="text-xs text-teal-700">Chưa gán dịch vụ nào</span>}
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex justify-between text-ink-muted">
                    <span>Tuần này: {c?.days ?? 0} ca · {c?.appointments ?? 0} lịch</span>
                    <span className="font-semibold text-ink">{hours(c?.bookedMinutes ?? 0)}/{hours(c?.shiftMinutes ?? 0)} giờ</span>
                  </div>
                  <UsageBar rate={rate} />
                </div>

                {canEdit && (
                  <Button size="sm" variant="outline" className="mt-3 self-start" icon={<Pencil size={14} />}
                          onClick={() => openEdit(s)}>
                    Sửa hồ sơ
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Thợ</th><th>Trạng thái</th><th>Kỹ năng</th><th className="text-right">Ca tuần</th>
                  <th>Lấp đầy</th><th className="text-right">Đánh giá</th>{canEdit && <th />}</tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const c = capacity[s.id];
                const rate = c?.shiftMinutes ? Math.round((c.bookedMinutes / c.shiftMinutes) * 100) : 0;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <StylistAvatar id={s.id} name={s.fullName} url={s.avatarUrl} size="h-9 w-9" />
                        <div><p className="font-medium">{s.fullName}</p><p className="text-xs text-ink-muted">{s.phone ?? '—'}</p></div>
                      </div>
                    </td>
                    <td>
                      {canEdit
                        ? <Toggle size="sm" checked={s.isActive} onChange={(v) => toggleActive(s, v)} label="Đang làm việc" />
                        : <ActiveChip active={s.isActive} />}
                    </td>
                    <td className="max-w-[280px] text-xs text-ink-soft">
                      {s.serviceIds.length} dịch vụ · {s.serviceIds.slice(0, 2).map(serviceName).join(', ')}
                      {s.serviceIds.length > 2 && '…'}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs">{c?.days ?? 0} ca · {hours(c?.shiftMinutes ?? 0)} giờ</td>
                    <td className="min-w-[140px]"><span className="text-xs">{rate}%</span><UsageBar rate={rate} /></td>
                    <td className="whitespace-nowrap text-right text-xs">
                      {s.avgRating !== null ? `★ ${s.avgRating.toFixed(1)} (${s.reviewCount})` : '—'}
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label={`Sửa ${s.fullName}`}>
                          <Pencil size={14} />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? `Hồ sơ ${editing.fullName}` : 'Thêm thợ mới'}
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
            <Button loading={saving} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo hồ sơ'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Ảnh đại diện */}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-slate-300 hover:border-teal-600"
                    aria-label="Chọn ảnh đại diện">
              {avatar
                ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full flex-col items-center justify-center text-ink-muted">
                    <ImagePlus size={22} /><span className="mt-0.5 text-[10px]">Tải ảnh</span>
                  </span>}
            </button>
            <div className="min-w-0">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); e.target.value = ''; }} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()}>
                  {avatar ? 'Đổi ảnh' : 'Chọn ảnh'}
                </Button>
                {avatar && DEMO_MODE && <Button size="sm" variant="ghost" onClick={() => setAvatar(null)}>Gỡ ảnh</Button>}
              </div>
              <p className="mt-1 text-xs text-ink-muted">JPG/PNG, tối đa {MAX_AVATAR_MB}MB · tự cắt vuông {AVATAR_PX}px</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ tên" required error={shown.fullName}>
              <Input value={fullName} maxLength={80} invalid={!!shown.fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Số điện thoại" error={shown.phone}>
              <Input value={phone} inputMode="numeric" invalid={!!shown.phone} placeholder="09xxxxxxxx"
                     onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={editing ? 'Email đăng nhập' : 'Email đăng nhập (tuỳ chọn)'} error={shown.email}
                   hint={editing
                     ? 'Đổi email hoặc vai trò ở mục “Tài khoản nhân sự”'
                     : 'Có email: tự tạo tài khoản vai trò Thợ, mật khẩu tạm gửi qua email'}>
              <Input type="email" value={email} disabled={!!editing} invalid={!!shown.email}
                     placeholder={editing ? 'Chưa có tài khoản đăng nhập' : 'ten@salon.vn'}
                     onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Vai trò">
              <Input value={editing && !editing.userId ? 'Thợ (chưa có tài khoản)' : 'Thợ'} disabled />
            </Field>
          </div>
          <Field label="Giới thiệu ngắn" hint={`${bio.length}/500`}>
            <Textarea value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
          </Field>

          {/* Kỹ năng dạng thẻ chọn nhiều */}
          <Field label={`Kỹ năng / dịch vụ đảm nhận (${serviceIds.length})`} required error={shown.skills}>
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {serviceIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {serviceIds.map((id) => (
                    <span key={id} className="chip border border-teal-300 bg-teal-50 text-teal-700">
                      {serviceName(id)}
                      <button type="button" onClick={() => toggleSkill(id)} aria-label={`Bỏ ${serviceName(id)}`}
                              className="rounded-full p-0.5 hover:bg-teal-100"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <Input value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)} placeholder="Lọc dịch vụ…"
                       className="min-h-[38px] pl-8" />
              </div>
              <div className="thin-scroll max-h-56 space-y-2.5 overflow-y-auto pr-1">
                {categories.map((cat) => {
                  const items = services.filter((s) => s.categoryId === cat.id && (!skillQuery || matchSearch(s.name, skillQuery)));
                  if (items.length === 0) return null;
                  const allOn = items.every((s) => serviceIds.includes(s.id));
                  return (
                    <div key={cat.id}>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{cat.name}</p>
                        {!skillQuery && (
                          <button type="button" className="text-[11px] text-teal-700 hover:underline" onClick={() => toggleCategory(cat.id)}>
                            {allOn ? 'Bỏ cả nhóm' : 'Chọn cả nhóm'}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((s) => {
                          const on = serviceIds.includes(s.id);
                          return (
                            <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleSkill(s.id)}
                                    className={`min-h-[34px] rounded-full border px-3 text-xs transition-colors
                                      ${on ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-ink-soft hover:border-slate-400'}
                                      ${s.isActive ? '' : 'line-through opacity-60'}`}>
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Đang làm việc</p>
              <p className="text-xs text-ink-muted">Tắt để thợ không nhận lịch mới; lịch sử vẫn được giữ.</p>
            </div>
            <Toggle checked={isActive} onChange={setIsActive} label="Đang làm việc" />
          </div>

          {editing && !isActive && editing.isActive && (
            <Notice tone="warning">Nhớ chuyển các lịch sắp tới của thợ này sang người khác ở mục “Chuyển lịch hàng loạt”.</Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </Modal>
    </div>
  );
}


function ActiveChip({ active }: { active: boolean }) {
  return active
    ? <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">Đang làm việc</span>
    : <span className="chip border border-slate-300 bg-slate-100 text-slate-600">Đã nghỉ việc</span>;
}

function UsageBar({ rate }: { rate: number }) {
  const clamped = Math.min(100, Math.max(0, rate));
  const color = rate >= 90 ? 'bg-red-500' : rate >= 70 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="meter"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label="Tỷ lệ lấp đầy">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
