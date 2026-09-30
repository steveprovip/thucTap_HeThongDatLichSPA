import { STYLIST_PHOTOS } from '@/utils/images';
import { DEMO_PASSWORDS } from '@/utils/constants';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type {
  AppNotification, Appointment, AppointmentStatus, AuditLogRow, AuthUser, Customer, Holiday, Invoice,
  InvoiceLine, PublicAppointment, ServiceCategory, ServiceItem, Shift, Stylist, TimeOff,
  UserRow, Voucher, WorkingHour,
} from '@/types';

/** Persisted in the browser so the whole UI can be explored without a server. */
const KEY = 'salon.demo.v5';
/**
 * Có đặt VITE_DEMO_MODE thì theo đúng giá trị. KHÔNG đặt (vd. build trên máy/CI không có .env vì .env
 * bị gitignore) thì: dev -> demo như trước, còn bản build production -> gọi API thật. Trước đây
 * thiếu biến = demo ở mọi nơi -> bản production âm thầm chạy dữ liệu giả trong trình duyệt.
 */
const DEMO_FLAG = import.meta.env.VITE_DEMO_MODE;
export const DEMO_MODE = DEMO_FLAG ? DEMO_FLAG !== 'false' : import.meta.env.DEV;
/** Phiên demo lưu MÃ tài khoản (không phải vai trò) để mọi kiểm tra quyền dựa trên đúng người đăng nhập. */
const SESSION_KEY = 'salon.demoUserId';
/** Mật khẩu mẫu theo vai trò — trùng khớp seed của máy chủ thật (database/seed.sql) và README. */
const passwordForRole = (role: string): string =>
  (DEMO_PASSWORDS as Record<string, string>)[role] ?? DEMO_PASSWORDS.stylist;
/** Mật khẩu tạm cho tài khoản mới / cấp lại: luôn có chữ hoa, chữ thường, số và ký tự đặc biệt (giống backend). */
export const generateTempPassword = (): string => {
  const rand = (max: number) => {
    try { return crypto.getRandomValues(new Uint32Array(1))[0] % max; } catch { return Math.floor(Math.random() * max); }
  };
  const pick = (s: string) => s[rand(s.length)];
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'; const lower = 'abcdefghijkmnpqrstuvwxyz'; const digit = '23456789';
  const chars = [pick(upper), pick(lower), pick(digit), pick('@#$%')];
  for (let i = 0; i < 6; i += 1) chars.push(pick(upper + lower + digit));
  for (let i = chars.length - 1; i > 0; i -= 1) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
};
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MSG = {
  LOGIN_FAILED: 'Email hoặc mật khẩu không đúng',
  ACCOUNT_LOCKED: (m: number) => `Tài khoản đã bị khoá do nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ${m} phút`,
  ACCOUNT_INACTIVE: 'Tài khoản đang ngưng hoạt động. Vui lòng liên hệ quản trị viên',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  EMAIL_DUPLICATED: 'Email này đã được sử dụng cho một tài khoản khác',
  LAST_ADMIN: 'Không thể ngưng hoạt động tài khoản quản trị cuối cùng của hệ thống',
  CANNOT_DEACTIVATE_SELF: 'Không thể tự ngưng hoạt động tài khoản đang đăng nhập',
  SERVICE_IN_USE: 'Dịch vụ đã có lịch hẹn tham chiếu nên không xoá được, hãy chuyển sang trạng thái ngừng bán',
  SERVICE_DURATION_INVALID: 'Thời lượng phải là bội số của 15 phút và nằm trong khoảng 15 đến 240 phút',
  SERVICE_PRICE_INVALID: 'Giá phải là số nguyên dương và không vượt quá 20.000.000 đ',
  SERVICE_NAME_DUPLICATED: 'Tên dịch vụ đã tồn tại',
  CATEGORY_HAS_SERVICES: (n: number) => `Nhóm này còn ${n} dịch vụ nên không xoá được`,
  WORKING_HOURS_MIN_60: 'Giờ đóng cửa phải sau giờ mở cửa ít nhất 60 phút',
  CURRENT_PASSWORD_WRONG: 'Mật khẩu hiện tại không đúng',
  PASSWORD_WEAK: 'Mật khẩu phải có tối thiểu 8 ký tự, gồm cả chữ và số',
  PASSWORD_SAME_AS_OLD: 'Mật khẩu mới phải khác mật khẩu hiện tại',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const day = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return iso(date); };
const addMinutes = (time: string, minutes: number) => {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const uid = () => Math.random().toString(36).slice(2, 10);
const labels: Record<AppointmentStatus, string> = {
  pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', arrived: 'Đã đến',
  in_progress: 'Đang phục vụ', completed: 'Hoàn tất', cancelled: 'Đã huỷ', no_show: 'Vắng mặt',
};
const categoriesSeed: ServiceCategory[] = [
  { id: 'hair', name: 'Tóc', displayOrder: 1 },
  { id: 'wash', name: 'Gội dưỡng sinh', displayOrder: 2 },
  { id: 'skin', name: 'Chăm sóc da', displayOrder: 3 },
  { id: 'combo', name: 'Combo', displayOrder: 4 },
];
const serviceSeed: ServiceItem[] = [
  ['s1', 'hair', 'Cắt tóc nữ tạo kiểu', 60, 320000, 'Tư vấn dáng mặt, gội và sấy tạo kiểu.'],
  ['s2', 'hair', 'Nhuộm màu thời trang', 120, 980000, 'Màu nhuộm cao cấp và dưỡng phục hồi.'],
  ['s3', 'hair', 'Uốn sóng lơi', 150, 1250000, 'Sóng mềm tự nhiên, giữ nếp lâu.'],
  ['s4', 'wash', 'Gội dưỡng sinh thảo mộc', 60, 380000, 'Massage đầu vai gáy cùng tinh dầu thảo mộc.'],
  ['s5', 'wash', 'Gội thư giãn', 30, 180000, 'Làm sạch da đầu và thư giãn nhanh.'],
  ['s6', 'wash', 'Liệu trình phục hồi tóc', 90, 690000, 'Ủ dưỡng chuyên sâu cho tóc hư tổn.'],
  ['s7', 'skin', 'Chăm sóc da cơ bản', 60, 450000, 'Làm sạch và cấp ẩm phù hợp làn da.'],
  ['s8', 'skin', 'Liệu trình da sáng khoẻ', 90, 790000, 'Tẩy tế bào chết và mặt nạ dưỡng sáng.'],
  ['s9', 'skin', 'Massage mặt thư giãn', 45, 290000, 'Thư giãn cơ mặt và tăng tuần hoàn.'],
  ['s10', 'combo', 'Tóc đẹp & da khoẻ', 120, 990000, 'Cắt tóc tạo kiểu kết hợp chăm sóc da.'],
  ['s11', 'combo', 'Một ngày thư giãn', 150, 1190000, 'Gội dưỡng sinh, massage và chăm sóc da.'],
  ['s12', 'combo', 'Cặp đôi thư giãn', 120, 1390000, 'Trải nghiệm chăm sóc toàn diện cho hai người.'],
].map(([id, categoryId, name, durationMinutes, price, description]) => ({
  id: String(id), categoryId: String(categoryId), categoryName: categoriesSeed.find(c => c.id === categoryId)?.name ?? '',
  name: String(name), durationMinutes: Number(durationMinutes), price: Number(price),
  priceText: money(Number(price)), description: String(description), isActive: true,
  stylistIds: ['st1', 'st2', 'st3', 'st4', 'st5'], stylistCount: 5, hasNoStylist: false,
}));
/** 5 thợ mẫu — cùng tên/SĐT/email với database/seed.sql (stylist1…5@salon.vn). */
const stylistSeed: Stylist[] = [
  ['st1', 'Nguyễn Thu Hà', '0902000001', 4.9, 87],
  ['st2', 'Trần Minh Tuấn', '0902000002', 4.8, 64],
  ['st3', 'Lê Thị Bích Ngọc', '0902000003', 4.9, 52],
  ['st4', 'Phạm Quốc Bảo', '0902000004', 4.7, 41],
  ['st5', 'Võ Kim Chi', '0902000005', 4.8, 33],
].map(([id, fullName, phone, avgRating, reviewCount], index) => ({
  // Mỗi hồ sơ thợ mẫu gắn với đúng một tài khoản nhân sự (usersSeed bên dưới)
  id: String(id), userId: `u-${String(id)}`, fullName: String(fullName), phone: String(phone),
  avatarUrl: [
    STYLIST_PHOTOS.stylist_1, STYLIST_PHOTOS.stylist_2, STYLIST_PHOTOS.stylist_3, STYLIST_PHOTOS.stylist_4, STYLIST_PHOTOS.stylist_5,
  ][index], bio: 'Chuyên viên giàu kinh nghiệm, tận tâm với từng khách hàng.', isActive: true,
  serviceIds: serviceSeed.map(s => s.id), serviceNames: serviceSeed.map(s => s.name),
  avgRating: Number(avgRating), reviewCount: Number(reviewCount),
}));
/** Tài khoản mẫu — trùng khớp tuyệt đối với README.md và database/seed.sql. */
const usersSeed: UserRow[] = [
  { id: 'u-admin', fullName: 'Quản trị hệ thống', email: 'admin@salon.vn', phone: '0901000001', role: 'admin', stylistId: null },
  { id: 'u-owner', fullName: 'Nguyễn Hoàng Anh', email: 'owner@salon.vn', phone: '0901000002', role: 'owner', stylistId: null },
  { id: 'u-reception', fullName: 'Đỗ Thanh Mai', email: 'reception@salon.vn', phone: '0901000003', role: 'receptionist', stylistId: null },
  ...stylistSeed.map((s, index) => ({ id: `u-${s.id}`, fullName: s.fullName, email: `stylist${index + 1}@salon.vn`,
    phone: s.phone, role: 'stylist', stylistId: s.id })),
].map(u => ({ ...u, role: u.role as UserRow['role'], isActive: true, mustChangePassword: false, lockedUntil: null,
  lastLoginAt: null, createdAt: new Date().toISOString() }));

interface DemoDb {
  categories: ServiceCategory[]; services: ServiceItem[]; stylists: Stylist[]; users: UserRow[];
  appointments: Appointment[]; invoices: Invoice[]; shifts: Shift[]; timeOff: TimeOff[];
  workingHours: WorkingHour[]; holidays: Holiday[]; vouchers: Voucher[];
  notes: Record<string, string>; reviews: Record<string, { rating: number; comment: string }>;
  audit: AuditLogRow[]; notifications: AppNotification[];
  /** Mật khẩu + số lần đăng nhập sai liên tiếp theo mã tài khoản (chỉ dùng cho bản demo). */
  auth: Record<string, { password: string; failed: number }>;
}
/**
 * Dựng một lịch hẹn. `catalog`/`team` mặc định là dữ liệu mẫu (lúc seed); khi tạo lịch thật phải truyền
 * db.services/db.stylists để dịch vụ & thợ do tiệm tự thêm KHÔNG bị rơi mất (lỗi lịch rỗng dịch vụ, 0 phút).
 */
function makeAppointment(id: string, offset: number, time: string, status: AppointmentStatus,
  customerName: string, phone: string, stylistId: string, serviceIds: string[],
  catalog: ServiceItem[] = serviceSeed, team: Stylist[] = stylistSeed): Appointment {
  const services = serviceIds.map(sid => catalog.find(s => s.id === sid)).filter((s): s is ServiceItem => !!s);
  const duration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
  const price = services.reduce((sum, s) => sum + s.price, 0);
  const date = day(offset);
  const stylist = team.find(s => s.id === stylistId) ?? team[0];
  const startAt = `${date}T${time}:00+07:00`;
  return {
    id, code: `SL-${id.toUpperCase().padStart(6, '0').slice(-6)}`, status, statusLabel: labels[status], source: 'online',
    date, startTime: time, endTime: addMinutes(time, duration), startAt,
    endAt: `${date}T${addMinutes(time, duration)}:00+07:00`, startAtText: `${time}, ${date}`,
    totalDurationMinutes: duration, estimatedTotal: price, estimatedTotalText: money(price),
    // Số lượt đến / không đến được tính lại từ lịch sử thật (syncCustomerStats) — không gán cứng
    customer: { id: `c-${phone}`, fullName: customerName, phone, phoneMasked: false, email: null, totalVisits: 0, noShowCount: 0 },
    stylist: { id: stylistId, fullName: stylist.fullName },
    services: services.map(s => ({ id: uid(), serviceId: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price, priceText: s.priceText })),
    customerNote: null, isLate: false, lateMinutes: 0, arrivedAt: null, startedAt: null, completedAt: null,
    actualDurationMinutes: null, cancelledAt: null, cancelledByLabel: null, cancelReason: null, rejectedReason: null,
    confirmedAt: status === 'pending' ? null : new Date().toISOString(), noShowAt: null,
    pendingOverdue: false, createdAt: new Date().toISOString(), changes: [],
  };
}
function seed(): DemoDb {
  const appointments = [
    makeAppointment('000001', 0, '09:00', 'completed', 'Nguyễn Thảo Vy', '0901234567', 'st1', ['s1', 's4']),
    makeAppointment('000002', 0, '10:30', 'in_progress', 'Trần Gia Hân', '0988123456', 'st2', ['s2']),
    makeAppointment('000003', 0, '13:00', 'confirmed', 'Phạm Quỳnh Anh', '0911222333', 'st3', ['s7']),
    makeAppointment('000004', 0, '15:00', 'pending', 'Võ Minh Khang', '0933444555', 'st1', ['s5']),
    makeAppointment('000005', 0, '16:00', 'confirmed', 'Lê Ngọc Mai', '0966777888', 'st4', ['s10']),
    makeAppointment('000006', 1, '09:30', 'pending', 'Đỗ Thanh Trúc', '0902233445', 'st2', ['s8']),
    makeAppointment('000007', 1, '14:00', 'confirmed', 'Hoàng Bích Ngọc', '0919988776', 'st3', ['s3']),
    makeAppointment('000008', -1, '11:00', 'no_show', 'Đặng Thu Hà', '0933222111', 'st4', ['s6']),
    makeAppointment('000009', -1, '14:00', 'completed', 'Nguyễn Thảo Vy', '0901234567', 'st2', ['s7']),
    makeAppointment('000010', -2, '10:00', 'completed', 'Trần Gia Hân', '0988123456', 'st3', ['s4']),
    makeAppointment('000011', -3, '16:00', 'completed', 'Lê Ngọc Mai', '0966777888', 'st1', ['s1', 's5']),
  ];
  appointments.forEach(a => {
    if (a.status === 'in_progress') a.startedAt = new Date(Date.now() - 27 * 60000).toISOString();
    if (a.status === 'completed') { a.completedAt = `${a.date}T${a.endTime}:00+07:00`; a.actualDurationMinutes = a.totalDurationMinutes; }
  });
  const invoices: Invoice[] = appointments.filter(a => a.status === 'completed').map(a => {
    const items: InvoiceLine[] = a.services.map(s => ({ id: uid(), serviceId: s.serviceId, name: s.name,
      unitPrice: s.price, unitPriceText: money(s.price), quantity: 1, lineTotal: s.price, lineTotalText: money(s.price) }));
    return { id: `inv-${a.id}`, code: `HD-${a.id}`, appointmentId: a.id, appointmentCode: a.code,
      customerName: a.customer.fullName, customerPhone: a.customer.phone, stylistName: a.stylist.fullName,
      items, subtotal: a.estimatedTotal, subtotalText: money(a.estimatedTotal), voucherCode: null,
      discountAmount: 0, discountAmountText: money(0), total: a.estimatedTotal, totalText: money(a.estimatedTotal),
      paymentMethod: 'cash', transferNote: null, status: 'closed', statusLabel: 'Đã đóng', adjustsInvoiceId: null,
      adjustReason: null, paidAt: `${a.date}T17:00:00+07:00`, closedAt: `${a.date}T17:01:00+07:00`,
      createdAt: `${a.date}T09:00:00+07:00` };
  });
  const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const shifts: Shift[] = Array.from({ length: 21 }, (_, offset) => offset - 7).flatMap(offset =>
    stylistSeed.map((stylist, index) => ({ id: `shift-${stylist.id}-${offset}`, stylistId: stylist.id,
      stylistName: stylist.fullName, workDate: day(offset),
      dayLabel: weekdays[new Date(`${day(offset)}T12:00:00`).getDay()],
      startTime: index < 2 ? '08:00' : '12:00', endTime: index < 2 ? '17:00' : '21:00',
      breakStart: index < 2 ? '12:00' : '16:00', breakEnd: index < 2 ? '13:00' : '17:00', note: null })));
  return {
    auth: Object.fromEntries(usersSeed.map(u => [u.id, { password: passwordForRole(u.role), failed: 0 }])),
    categories: categoriesSeed, services: serviceSeed, stylists: stylistSeed, users: usersSeed, appointments,
    invoices, shifts, timeOff: [], holidays: [], vouchers: [
      { id: 'v1', code: 'WELCOME10', description: 'Ưu đãi khách mới 10%', discountType: 'percent', discountValue: 10,
        startDate: day(-30), endDate: day(90), maxUsage: 200, usedCount: 12, isActive: true },
      { id: 'v2', code: 'SPA50', description: 'Giảm 50.000 đ', discountType: 'amount', discountValue: 50000,
        startDate: day(-30), endDate: day(90), maxUsage: 100, usedCount: 8, isActive: true },
    ],
    workingHours: weekdays.map((dayLabel, dayOfWeek) => ({ id: `wh${dayOfWeek}`, dayOfWeek, dayLabel,
      openTime: '08:00', closeTime: '21:00', isClosed: false })),
    notes: {}, reviews: {}, notifications: [
      { id: 'n1', type: 'booking', title: 'Lịch hẹn mới', body: 'Võ Minh Khang đang chờ xác nhận.',
        appointmentId: '000004', isRead: false, createdAt: new Date().toISOString() },
      { id: 'n2', type: 'booking', title: 'Lịch ngày mai', body: 'Hãy kiểm tra lịch làm việc ngày mai.',
        appointmentId: '000006', isRead: false, createdAt: new Date().toISOString() },
    ], audit: [
      { id: 'log1', actorEmail: 'reception@salon.vn', actorRole: 'receptionist', action: 'CONFIRM', entityType: 'appointment',
        entityId: '000003', summary: 'Xác nhận lịch SL-000003', changes: null, ipAddress: '127.0.0.1', createdAt: new Date().toISOString() },
      { id: 'log2', actorEmail: 'owner@salon.vn', actorRole: 'owner', action: 'UPDATE', entityType: 'service',
        entityId: 's1', summary: 'Cập nhật giá dịch vụ Cắt tóc nữ tạo kiểu', changes: { price: 320000 },
        ipAddress: '127.0.0.1', createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'log3', actorEmail: 'reception@salon.vn', actorRole: 'receptionist', action: 'CREATE', entityType: 'invoice',
        entityId: 'inv-000001', summary: 'Lập phiếu HD-000001', changes: null, ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 7200000).toISOString() },
    ],
  };
}
let db: DemoDb;
try { db = JSON.parse(localStorage.getItem(KEY) || 'null') as DemoDb || seed(); }
catch { db = seed(); }
db.auth ??= {};
// Dữ liệu cũ (email @lumi.vn, mật khẩu demo1234) không còn khớp README → bỏ để seed lại
try {
  ['salon.demo.v3', 'salon.demo.v4', 'salon.demoRole'].forEach(k => localStorage.removeItem(k));
} catch { /* bỏ qua */ }
recomputeLinks();
syncCustomerStats();
/** Lưu DB demo và phát sự kiện để mọi màn hình đang mở (Lịch ngày, Danh sách lịch…) tự làm mới. */
const save = () => {
  syncCustomerStats();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* hết quota: vẫn giữ trong bộ nhớ */ }
};

/**
 * CRM: lượt đến / không đến của khách tính từ lịch sử THẬT theo đúng số điện thoại.
 * Khách mới (SĐT chưa từng xuất hiện) luôn bắt đầu 0 lượt đến, 0 lần không đến.
 */
function customerStats(phone: string) {
  const visits = db.appointments.filter(a => a.customer.phone === phone);
  return {
    totalVisits: visits.filter(a => a.status === 'completed').length,
    noShowCount: visits.filter(a => a.status === 'no_show').length,
    total: visits.length,
  };
}
function syncCustomerStats() {
  const cache = new Map<string, ReturnType<typeof customerStats>>();
  db.appointments.forEach(a => {
    const stats = cache.get(a.customer.phone) ?? customerStats(a.customer.phone);
    cache.set(a.customer.phone, stats);
    a.customer.totalVisits = stats.totalVisits; a.customer.noShowCount = stats.noShowCount;
  });
}
const paginate = <T,>(items: T[], params: Record<string, unknown>) => {
  const page = Number(params.page) || 1; const limit = Number(params.limit) || 20;
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit,
    totalPages: Math.max(1, Math.ceil(items.length / limit)) };
};
const bad = (message: string, field?: string, status = 400): never => {
  throw { response: { status, data: { success: false, message, field } } };
};
/** Người dùng của phiên hiện tại; tài khoản bị ngưng hoạt động thì phiên hết hiệu lực ngay (S1-02). */
const getUser = (): AuthUser | null => {
  const id = localStorage.getItem(SESSION_KEY);
  const user = id ? db.users.find(u => u.id === id) : undefined;
  if (!user || !user.isActive) return null;
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role,
    stylistId: db.stylists.find(s => s.userId === user.id)?.id ?? null, mustChangePassword: user.mustChangePassword };
};
const startSession = (userId: string | null) => {
  if (userId) localStorage.setItem(SESSION_KEY, userId); else localStorage.removeItem(SESSION_KEY);
};
export const demoRole = {
  get: () => getUser()?.role ?? 'customer',
  /** Công cụ "Xem vai trò" của bản demo: chỉ nhập vai một tài khoản ĐANG HOẠT ĐỘNG của vai trò đó. */
  set: (role: string) => {
    if (getUser()?.role === role) return;
    startSession(role === 'customer' ? null : db.users.find(u => u.role === role && u.isActive)?.id ?? null);
  },
  user: getUser,
};

/** Quyền theo vai trò, mô phỏng RolesGuard của backend (S1-03). Luật đầu tiên khớp được áp dụng. */
const PUBLIC_PATH = /^\/(public\/|auth\/(login|logout|refresh|forgot-password|reset-password)$|reviews\/(by-code$|token\/))/;
const ROLE_RULES: [string[], RegExp, string[]][] = [
  [['get'], /^\/users(\/|$)/, ['admin', 'owner']],
  [['post', 'patch', 'put', 'delete'], /^\/users(\/|$)/, ['admin']],
  [['get'], /^\/audit-logs/, ['admin', 'owner']],
  [['post', 'patch', 'put', 'delete'], /^\/(services|service-categories)(\/|$)/, ['owner']],
  [['post', 'patch'], /^\/stylists(\/[^/]+)?(\/avatar)?$/, ['owner']],
  [['post'], /^\/stylists\/[^/]+\/shifts$/, ['owner']],
  [['put'], /^\/working-hours$/, ['owner']],
  [['post', 'delete'], /^\/holidays(\/|$)/, ['owner']],
];
const authorize = (method: string, path: string) => {
  if (PUBLIC_PATH.test(path)) return;
  const me = getUser() ?? bad(MSG.UNAUTHORIZED, undefined, 401);
  const rule = ROLE_RULES.find(([methods, re]) => methods.includes(method) && re.test(path));
  if (rule && !rule[2].includes(me.role)) bad(MSG.FORBIDDEN, undefined, 403);
};

/**
 * Nguồn sự thật duy nhất của phân công thợ ↔ dịch vụ là services[].stylistIds;
 * stylists[].serviceIds/serviceNames được suy ra lại sau mỗi thay đổi (S1-07, đồng bộ hai chiều).
 */
function recomputeLinks() {
  db.services.forEach(s => {
    s.stylistIds = [...new Set(s.stylistIds ?? [])].filter(id => db.stylists.some(st => st.id === id));
    s.stylistCount = s.stylistIds.length; s.hasNoStylist = s.stylistCount === 0;
    s.categoryName = db.categories.find(c => c.id === s.categoryId)?.name ?? ''; s.priceText = money(s.price);
  });
  db.stylists.forEach(st => {
    const owned = db.services.filter(s => s.stylistIds.includes(st.id));
    st.serviceIds = owned.map(s => s.id); st.serviceNames = owned.map(s => s.name);
  });
}
const setStylistServices = (stylistId: string, serviceIds: string[]) => {
  db.services.forEach(s => {
    const want = serviceIds.includes(s.id); const has = s.stylistIds.includes(stylistId);
    if (want && !has) s.stylistIds = [...s.stylistIds, stylistId];
    if (!want && has) s.stylistIds = s.stylistIds.filter(id => id !== stylistId);
  });
  recomputeLinks();
};
const withEmail = (s: Stylist): Stylist => ({ ...s, email: db.users.find(u => u.id === s.userId)?.email ?? null });
const emailTaken = (email: string, exceptId?: string) =>
  db.users.some(u => u.id !== exceptId && u.email.toLowerCase() === email.trim().toLowerCase());
const validateService = (duration?: unknown, price?: unknown) => {
  if (duration !== undefined) {
    const d = Number(duration);
    if (!Number.isInteger(d) || d % 15 || d < 15 || d > 240) bad(MSG.SERVICE_DURATION_INVALID, 'durationMinutes');
  }
  if (price !== undefined) {
    const v = Number(price);
    if (!Number.isInteger(v) || v <= 0 || v > 20000000) bad(MSG.SERVICE_PRICE_INVALID, 'price');
  }
};
const pick = (p: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => keys.includes(k) && v !== undefined));
const findAppointment = (id: string) => db.appointments.find(a => a.id === id) ?? bad('Không tìm thấy lịch hẹn');
const forCurrentRole = (a: Appointment): Appointment => getUser()?.role === 'stylist'
  ? { ...a, customer: { ...a.customer, phone: `${a.customer.phone.slice(0, 3)}****${a.customer.phone.slice(-3)}`, phoneMasked: true } }
  : a;
const publicAppointment = (a: Appointment): PublicAppointment => ({
  code: a.code, status: a.status, statusLabel: a.statusLabel, date: a.date,
  startTime: a.startTime, endTime: a.endTime, startAtText: a.startAtText,
  expectedEndText: `${a.endTime}, ${a.date}`, totalDurationMinutes: a.totalDurationMinutes,
  estimatedTotal: a.estimatedTotal, estimatedTotalText: a.estimatedTotalText,
  customerName: a.customer.fullName, customerPhoneMasked: `${a.customer.phone.slice(0, 3)}****${a.customer.phone.slice(-3)}`,
  stylistName: a.stylist.fullName, services: a.services.map(s => ({ name: s.name, durationMinutes: s.durationMinutes,
    price: s.price, priceText: s.priceText })), customerNote: a.customerNote, cancelledAt: a.cancelledAt,
  cancelledByLabel: a.cancelledByLabel, cancelReason: a.cancelReason,
});
const availability = (date: string, serviceIds: string[], stylistId?: string, excludeId?: string) => {
  const duration = serviceIds.reduce((sum, id) => sum + (db.services.find(s => s.id === id)?.durationMinutes ?? 0), 0);
  const price = serviceIds.reduce((sum, id) => sum + (db.services.find(s => s.id === id)?.price ?? 0), 0);
  const hours = db.workingHours.find(h => h.dayOfWeek === new Date(`${date}T12:00:00`).getDay());
  const open = hours?.isClosed ? 21 * 60 : minute(hours?.openTime ?? '08:00');
  const close = hours?.isClosed ? 21 * 60 : minute(hours?.closeTime ?? '21:00');
  const slots = [];
  for (let m = open; m <= 20 * 60 + 30 && m + duration <= close; m += 15) {
    const time = addMinutes('00:00', m);
    if (date === day() && m <= new Date().getHours() * 60 + new Date().getMinutes() + 60) continue;
    const ids = db.stylists.filter(s => s.isActive && (!stylistId || s.id === stylistId) &&
      serviceIds.every(id => s.serviceIds.includes(id)) &&
      (() => { const shifts = db.shifts.filter(shift => shift.stylistId === s.id && shift.workDate === date);
        return !shifts.length || shifts.some(shift => m >= minute(shift.startTime) && m + duration <= minute(shift.endTime) &&
          (!shift.breakStart || !shift.breakEnd || m + duration <= minute(shift.breakStart) || m >= minute(shift.breakEnd))); })() &&
      !db.timeOff.some(t => t.stylistId === s.id && t.offDate === date &&
        (!t.startTime || !t.endTime || (m < minute(t.endTime) && m + duration > minute(t.startTime)))) &&
      !db.appointments.some(a => a.id !== excludeId && a.date === date && a.stylist.id === s.id &&
        !['cancelled', 'no_show'].includes(a.status) && m < minute(a.endTime) && m + duration > minute(a.startTime)))
      .map(s => s.id);
    if (ids.length) slots.push({ time, stylistIds: ids });
  }
  const closed = db.holidays.find(h => h.startDate <= date && h.endDate >= date);
  return { date, totalDurationMinutes: duration, estimatedTotal: price, estimatedTotalText: money(price),
    salonClosed: !!closed || !!hours?.isClosed, closedReason: closed?.reason ?? (hours?.isClosed ? 'Salon nghỉ trong ngày này' : null),
    slots: closed || hours?.isClosed ? [] : slots,
    suggestedDates: [day(1), day(2), day(3)], exceedsLongestShift: duration > 780 };
};
/** Số lịch hẹn (mọi trạng thái) đang tham chiếu dịch vụ — lớn hơn 0 thì cấm xoá cứng, chỉ được ngừng bán (S1-05). */
const serviceUsage = (serviceId: string) =>
  db.appointments.filter(a => a.services.some(s => s.serviceId === serviceId)).length;
const createAppointment = (p: Record<string, unknown>, walkIn = false) => {
  const ids = ((p.serviceIds as string[]) ?? []).filter(id => db.services.some(s => s.id === id));
  if (!ids.length) bad('Vui lòng chọn ít nhất một dịch vụ còn đang bán', 'serviceIds');
  const phone = String(p.phone ?? '').trim();
  const date = String(p.date); const time = String(p.time);
  const available = availability(date, ids, p.stylistId ? String(p.stylistId) : undefined);
  const slot = available.slots.find(s => s.time === time);
  if (!walkIn && !slot) bad('Khung giờ này vừa được đặt mất, vui lòng chọn giờ khác');
  const stylistId = String(p.stylistId || slot?.stylistIds[0] || db.stylists[0].id);
  const existing = db.appointments.find(a => a.customer.phone === phone);
  const a = makeAppointment(uid().slice(0, 6), 0, time, walkIn ? 'confirmed' : 'pending',
    String(p.fullName ?? '').trim(), phone, stylistId, ids, db.services, db.stylists);
  a.date = date; a.startAt = `${date}T${time}:00+07:00`; a.endAt = `${date}T${a.endTime}:00+07:00`;
  a.startAtText = `${time}, ${date}`; a.source = walkIn ? 'walk_in' : 'online'; a.customerNote = String(p.note || '') || null;
  a.customer.email = (String(p.email ?? '').trim() || existing?.customer.email) ?? null;
  db.appointments.unshift(a); save(); return a;
};

const record = (action: string, entityType: string, summary: string) => {
  const user = getUser();
  db.audit.unshift({ id: uid(), actorEmail: user?.email ?? null, actorRole: user?.role ?? null,
    action, entityType, entityId: null, summary, changes: null, ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString() });
  save();
};
const customerList = (): Customer[] => {
  const phones = [...new Set(db.appointments.map(a => a.customer.phone))];
  return phones.map(phone => {
    const visits = db.appointments.filter(a => a.customer.phone === phone);
    const first = visits[0];
    const stats = customerStats(phone);
    return { id: first.customer.id, fullName: first.customer.fullName, phone, phoneMasked: false,
      email: first.customer.email, totalVisits: stats.totalVisits, noShowCount: stats.noShowCount,
      note: db.notes[phone] ?? null, isNew: stats.totalVisits === 0,
      createdAt: visits[visits.length - 1]?.createdAt ?? first.createdAt };
  });
};
const invoiceLines = (items: { serviceId?: string; name: string; unitPrice: number; quantity: number }[]): InvoiceLine[] =>
  items.map(item => ({ id: uid(), serviceId: item.serviceId ?? null, name: item.name,
    unitPrice: item.unitPrice, unitPriceText: money(item.unitPrice), quantity: item.quantity,
    lineTotal: item.unitPrice * item.quantity, lineTotalText: money(item.unitPrice * item.quantity) }));
const computeInvoice = (invoice: Invoice, voucherCode?: string) => {
  invoice.subtotal = invoice.items.reduce((sum, item) => sum + item.lineTotal, 0);
  invoice.subtotalText = money(invoice.subtotal);
  const voucher = db.vouchers.find(v => v.code.toUpperCase() === voucherCode?.toUpperCase() && v.isActive &&
    v.startDate <= day() && v.endDate >= day());
  if (voucherCode && !voucher) bad('Mã giảm giá không hợp lệ');
  if (voucher?.minOrderValue && invoice.items.reduce((sum, item) => sum + item.lineTotal, 0) < voucher.minOrderValue)
    bad(`Mã ${voucher.code} chỉ áp dụng cho đơn từ ${money(voucher.minOrderValue)}`);
  invoice.voucherCode = voucher?.code ?? null;
  invoice.discountAmount = voucher ? Math.min(invoice.subtotal,
    voucher.discountType === 'percent' ? Math.round(invoice.subtotal * voucher.discountValue / 100) : voucher.discountValue) : 0;
  invoice.discountAmountText = money(invoice.discountAmount);
  invoice.total = invoice.subtotal - invoice.discountAmount; invoice.totalText = money(invoice.total);
  return invoice;
};
const createInvoice = (appointmentId: string, items?: { serviceId?: string; name: string; unitPrice: number; quantity: number }[]) => {
  const a = findAppointment(appointmentId);
  const lines = items ?? a.services.map(s => ({ serviceId: s.serviceId, name: s.name, unitPrice: s.price, quantity: 1 }));
  const invoice: Invoice = { id: uid(), code: `HD-${uid().slice(0, 6).toUpperCase()}`, appointmentId: a.id,
    appointmentCode: a.code, customerName: a.customer.fullName, customerPhone: a.customer.phone,
    stylistName: a.stylist.fullName, items: invoiceLines(lines), subtotal: 0, subtotalText: '', voucherCode: null,
    discountAmount: 0, discountAmountText: '', total: 0, totalText: '', paymentMethod: null,
    transferNote: null, status: 'draft', statusLabel: 'Bản nháp', adjustsInvoiceId: null,
    adjustReason: null, paidAt: null, closedAt: null, createdAt: new Date().toISOString() };
  computeInvoice(invoice); db.invoices.unshift(invoice); save(); return invoice;
};
const summary = (items: Appointment[]) => {
  const result = { pending: 0, confirmed: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 };
  items.forEach(a => { result[a.status] += 1; }); return result;
};
const dayTimeline = (date: string, stylistId?: string) => {
  const stylists = db.stylists.filter(s => s.isActive && (!stylistId || s.id === stylistId));
  const appointments = db.appointments.filter(a => a.date === date);
  const hours = db.workingHours.find(h => h.dayOfWeek === new Date(`${date}T12:00:00`).getDay());
  const holiday = db.holidays.find(h => h.startDate <= date && h.endDate >= date);
  const closed = !!holiday || !!hours?.isClosed;
  return { date, dayLabel: new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00`)),
    salonOpen: hours?.openTime ?? '08:00', salonClose: hours?.closeTime ?? '21:00',
    salonClosed: closed, closedReason: holiday?.reason ?? (hours?.isClosed ? 'Salon nghỉ trong ngày này' : null), stepMinutes: 15,
    columns: stylists.map(s => ({ stylistId: s.id, stylistName: s.fullName, avatarUrl: s.avatarUrl,
      workingBlocks: (closed ? [] : db.shifts.filter(shift => shift.stylistId === s.id && shift.workDate === date))
        .map(shift => ({ start: shift.startTime, end: shift.endTime })),
      offBlocks: db.shifts.filter(shift => shift.stylistId === s.id && shift.workDate === date && shift.breakStart && shift.breakEnd)
        .map(shift => ({ start: shift.breakStart!, end: shift.breakEnd!, reason: 'Nghỉ giữa ca' })),
      appointments: appointments.filter(a => a.stylist.id === s.id) })), summary: summary(appointments) };
};

function handle(method: string, path: string, p: Record<string, unknown>, q: Record<string, unknown>): unknown {
  authorize(method, path);
  if (path === '/auth/me') return getUser() ?? bad(MSG.UNAUTHORIZED, undefined, 401);
  if (path === '/auth/login') {
    // S1-01: thông báo chung, không tiết lộ email có tồn tại; sai 5 lần liên tiếp khoá 15 phút
    const user = db.users.find(u => u.email.toLowerCase() === String(p.email ?? '').trim().toLowerCase());
    if (!user) return bad(MSG.LOGIN_FAILED, undefined, 401);
    const cred = (db.auth[user.id] ??= { password: passwordForRole(user.role), failed: 0 });
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return bad(MSG.ACCOUNT_LOCKED(Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000))), undefined, 401);
    }
    if (String(p.password ?? '') !== cred.password) {
      cred.failed += 1;
      if (cred.failed >= MAX_FAILED_LOGINS) {
        cred.failed = 0; user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
        record('LOGIN', 'user', `Khoá ${user.email} ${LOCK_MINUTES} phút do nhập sai mật khẩu ${MAX_FAILED_LOGINS} lần`);
        return bad(MSG.ACCOUNT_LOCKED(LOCK_MINUTES), undefined, 401);
      }
      save(); return bad(MSG.LOGIN_FAILED, undefined, 401);
    }
    if (!user.isActive) return bad(MSG.ACCOUNT_INACTIVE, undefined, 403);
    cred.failed = 0; user.lockedUntil = null; user.lastLoginAt = new Date().toISOString();
    startSession(user.id); save();
    return { accessToken: 'demo-token', refreshToken: 'demo-refresh', expiresIn: 1800, user: getUser() };
  }
  if (path === '/auth/logout') { startSession(null); return {}; }
  if (path === '/auth/change-password') {
    const me = getUser() ?? bad(MSG.UNAUTHORIZED, undefined, 401);
    const cred = (db.auth[me.id] ??= { password: passwordForRole(me.role), failed: 0 });
    const next = String(p.newPassword ?? '');
    if (String(p.currentPassword ?? '') !== cred.password) bad(MSG.CURRENT_PASSWORD_WRONG, 'currentPassword');
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) bad(MSG.PASSWORD_WEAK, 'newPassword');
    if (next === cred.password) bad(MSG.PASSWORD_SAME_AS_OLD, 'newPassword');
    cred.password = next;
    const row = db.users.find(u => u.id === me.id); if (row) row.mustChangePassword = false;
    save(); return { success: true };
  }
  if (path === '/auth/reset-password') return {};
  if (path === '/auth/forgot-password') return { message: 'Liên kết đặt lại mật khẩu đã được gửi (bản demo).' };
  if (path === '/auth/permission-matrix') return {
    // Bản sao của PERMISSION_MATRIX ở backend (roles.constant.ts)
    roles: { customer: 'Khách', stylist: 'Thợ', receptionist: 'Lễ tân', owner: 'Chủ tiệm', admin: 'Quản trị' },
    matrix: {
      'Tài khoản và phân quyền': { customer: '-', stylist: '-', receptionist: '-', owner: 'R', admin: 'F' },
      'Danh mục dịch vụ và giá': { customer: 'R', stylist: 'R', receptionist: 'R', owner: 'F', admin: 'R' },
      'Hồ sơ thợ và ca làm việc': { customer: 'R', stylist: 'R', receptionist: 'W', owner: 'F', admin: 'R' },
      'Đặt lịch trên trang công khai': { customer: 'W', stylist: '-', receptionist: 'F', owner: 'F', admin: 'R' },
      'Lịch hẹn hằng ngày và check-in': { customer: 'R', stylist: 'W', receptionist: 'F', owner: 'F', admin: 'R' },
      'Phiếu tính tiền': { customer: 'R', stylist: 'R', receptionist: 'F', owner: 'F', admin: 'R' },
      'Hồ sơ và lịch sử dịch vụ của khách': { customer: 'R', stylist: 'R', receptionist: 'W', owner: 'F', admin: 'R' },
      'Báo cáo doanh thu và nhật ký hoạt động': { customer: '-', stylist: '-', receptionist: 'R', owner: 'F', admin: 'F' },
    },
  };

  if (path === '/public/catalog') {
    const search = String(q.search ?? '').toLocaleLowerCase('vi-VN');
    return db.categories.map(c => ({ categoryId: c.id, categoryName: c.name, displayOrder: c.displayOrder,
      services: db.services.filter(s => s.isActive && s.categoryId === c.id &&
        (!search || `${s.name} ${s.description}`.toLocaleLowerCase('vi-VN').includes(search)))
        .map(({ id, name, durationMinutes, price, priceText, description }) => ({ id, name, durationMinutes, price, priceText, description }))
    })).filter(group => group.services.length);
  }
  if (path === '/public/quote') {
    const services = db.services.filter(s => (p.serviceIds as string[]).includes(s.id));
    const total = services.reduce((sum, s) => sum + s.price, 0);
    return { services, totalDurationMinutes: services.reduce((sum, s) => sum + s.durationMinutes, 0),
      estimatedTotal: total, estimatedTotalText: money(total), note: 'Giá chưa bao gồm các dịch vụ phát sinh tại quầy.' };
  }
  if (path === '/public/stylists') return db.stylists.filter(s => s.isActive &&
    String(q.serviceIds ?? '').split(',').filter(Boolean).every(id => s.serviceIds.includes(id)))
    .map(({ id, fullName, avatarUrl, bio, avgRating }) => ({ id, fullName, avatarUrl, bio, avgRating }));
  if (path === '/public/availability' || path === '/appointments/availability')
    return availability(String(q.date), String(q.serviceIds ?? '').split(','), q.stylistId ? String(q.stylistId) : undefined,
      q.excludeAppointmentId ? String(q.excludeAppointmentId) : undefined);
  if (path === '/public/bookings') {
    const a = createAppointment(p); record('CREATE', 'appointment', `Đặt lịch ${a.code}`);
    return { code: a.code, appointmentId: a.id, date: a.date, startTime: a.startTime, endTime: a.endTime,
      startAtText: a.startAtText, stylistName: a.stylist.fullName, services: a.services.map(s => ({ name: s.name,
        durationMinutes: s.durationMinutes, price: s.price })), totalDurationMinutes: a.totalDurationMinutes,
      estimatedTotal: a.estimatedTotal, status: a.status, nameConflict: false, emailQueued: false };
  }
  if (path === '/public/lookup') return db.appointments.filter(a =>
    (p.code && a.code.toUpperCase() === String(p.code).toUpperCase()) ||
    (p.phone && a.customer.phone === p.phone)).map(publicAppointment);
  if (path === '/public/cancel') {
    const a = db.appointments.find(item => item.code.toUpperCase() === String(p.code).toUpperCase()) ?? bad('Không tìm thấy lịch hẹn');
    if (new Date(a.startAt).getTime() - Date.now() < 120 * 60000) bad('Chỉ được tự huỷ khi còn ít nhất 120 phút trước giờ hẹn');
    a.status = 'cancelled'; a.statusLabel = labels.cancelled; a.cancelReason = String(p.reason || 'Khách tự huỷ');
    a.cancelledAt = new Date().toISOString(); a.cancelledByLabel = 'Khách hàng'; save();
    record('CANCEL', 'appointment', `Khách huỷ lịch ${a.code}`); return publicAppointment(a);
  }

  if (path === '/appointments/timeline') return dayTimeline(String(q.date || day()), q.stylistId ? String(q.stylistId) : undefined);
  if (path === '/appointments/my-day') return db.appointments.filter(a => a.date === q.date && a.stylist.id === getUser()?.stylistId).map(forCurrentRole);
  if (path === '/appointments/pending') return db.appointments.filter(a => a.status === 'pending');
  if (path === '/appointments/reject-reasons') return ['Khung giờ không còn chỗ', 'Dịch vụ chưa phù hợp', 'Không liên hệ được khách', 'Khác'];
  if (path === '/appointments/today-summary') return summary(db.appointments.filter(a => a.date === (q.date || day())));
  if (path === '/appointments/bulk-reassign/suggestions') {
    const items = db.appointments.filter(a => a.date === q.date && a.stylist.id === q.stylistId &&
      ['pending', 'confirmed'].includes(a.status)).map(appointment => ({ appointment,
      sameTimeOptions: db.stylists.filter(s => s.id !== q.stylistId).map(s => ({ stylistId: s.id, stylistName: s.fullName })),
      alternativeTimeOptions: [], needsPhoneCall: false }));
    return { stylistId: q.stylistId, date: q.date, total: items.length, items };
  }
  if (path === '/appointments/bulk-reassign' && method === 'post') {
    const items = p.items as { appointmentId: string; targetStylistId?: string; targetTime?: string }[];
    items.forEach(item => { const a = findAppointment(item.appointmentId);
      const stylist = db.stylists.find(s => s.id === item.targetStylistId);
      if (stylist) a.stylist = { id: stylist.id, fullName: stylist.fullName };
      if (item.targetTime) { a.startTime = item.targetTime; a.endTime = addMinutes(item.targetTime, a.totalDurationMinutes);
        a.startAt = `${a.date}T${a.startTime}:00+07:00`; a.endAt = `${a.date}T${a.endTime}:00+07:00`;
        a.startAtText = `${a.startTime}, ${a.date}`; }
    }); save(); record('BULK_REASSIGN', 'appointment', `Chuyển ${items.length} lịch hẹn`);
    return { succeeded: items.length, failed: [] };
  }
  if (path === '/appointments/walk-in' && method === 'post') {
    const a = createAppointment(p, true); record('CREATE', 'appointment', `Khách vãng lai ${a.code}`); return a;
  }
  if (path === '/appointments' && method === 'get') {
    let items = [...db.appointments];
    if (q.from) items = items.filter(a => a.date >= String(q.from));
    if (q.to) items = items.filter(a => a.date <= String(q.to));
    if (q.status) items = items.filter(a => a.status === q.status);
    if (q.stylistId) items = items.filter(a => a.stylist.id === q.stylistId);
    if (q.search) items = items.filter(a => `${a.code} ${a.customer.fullName} ${a.customer.phone}`.toLowerCase().includes(String(q.search).toLowerCase()));
    if (getUser()?.role === 'stylist') items = items.filter(a => a.stylist.id === getUser()?.stylistId).map(forCurrentRole);
    return paginate(items, q);
  }
  const appointmentMatch = path.match(/^\/appointments\/([^/]+)(?:\/(.+))?$/);
  if (appointmentMatch) {
    const a = findAppointment(appointmentMatch[1]); const action = appointmentMatch[2];
    if (!action) return forCurrentRole(a);
    if (action === 'customer-history') return { customerId: a.customer.id,
      isNewCustomer: customerStats(a.customer.phone).totalVisits === 0,
      history: db.appointments.filter(item => item.customer.phone === a.customer.phone && item.id !== a.id).map(item => ({
        appointmentId: item.id, code: item.code, date: item.date, status: item.status,
        stylistName: item.stylist.fullName, services: item.services.map(s => s.name), technicalNote: db.notes[item.id] ?? null })) };
    if (action === 'service-note') { db.notes[a.id] = String(p.content); save(); return { content: p.content }; }
    const status: Record<string, AppointmentStatus> = { confirm: 'confirmed', reject: 'cancelled',
      'check-in': 'arrived', start: 'in_progress', complete: 'completed', 'no-show': 'no_show',
      'undo-no-show': 'confirmed', cancel: 'cancelled' };
    if (action === 'reschedule') {
      if (p.date) a.date = String(p.date);
      if (p.time) { a.startTime = String(p.time); a.endTime = addMinutes(a.startTime, a.totalDurationMinutes); }
      if (p.stylistId) { const stylist = db.stylists.find(s => s.id === p.stylistId);
        if (stylist) a.stylist = { id: stylist.id, fullName: stylist.fullName }; }
      a.startAt = `${a.date}T${a.startTime}:00+07:00`; a.endAt = `${a.date}T${a.endTime}:00+07:00`;
      a.startAtText = `${a.startTime}, ${a.date}`;
    } else if (status[action]) {
      a.status = status[action]; a.statusLabel = labels[a.status];
      if (action === 'reject') a.rejectedReason = String(p.reason);
      if (action === 'cancel') a.cancelReason = String(p.reason);
      if (action === 'complete') { a.completedAt = new Date().toISOString();
        a.actualDurationMinutes = a.startedAt ? Math.max(1, Math.round((Date.now() - new Date(a.startedAt).getTime()) / 60000)) : a.totalDurationMinutes; }
      if (action === 'start') a.startedAt = new Date().toISOString();
      if (action === 'check-in') a.arrivedAt = new Date().toISOString();
    } else bad('Thao tác không được hỗ trợ');
    save(); record(action.toUpperCase(), 'appointment', `${labels[a.status]} ${a.code}`); return a;
  }

  if (path === '/service-categories' && method === 'get') return db.categories.map(c => ({ ...c,
    serviceCount: db.services.filter(s => s.categoryId === c.id).length }));
  if (path === '/service-categories' && method === 'post') {
    const category = { id: uid(), name: String(p.name), displayOrder: Number(p.displayOrder ?? db.categories.length + 1) };
    db.categories.push(category); save(); record('CREATE', 'category', `Thêm danh mục ${category.name}`); return category;
  }
  const categoryMatch = path.match(/^\/service-categories\/([^/]+)$/);
  if (categoryMatch) {
    const category = db.categories.find(c => c.id === categoryMatch[1]) ?? bad('Không tìm thấy danh mục');
    if (method === 'delete') {
      const count = db.services.filter(s => s.categoryId === category.id).length;
      if (count) bad(MSG.CATEGORY_HAS_SERVICES(count), undefined, 409);
      db.categories = db.categories.filter(c => c.id !== category.id); save(); return {};
    }
    Object.assign(category, pick(p, ['name', 'displayOrder'])); recomputeLinks(); save(); return category;
  }
  if (path === '/services' && method === 'get') return db.services.filter(s =>
    (!q.categoryId || s.categoryId === q.categoryId) &&
    (q.isActive === undefined || s.isActive === (q.isActive === true || q.isActive === 'true')) &&
    (!q.search || `${s.name} ${s.description}`.toLowerCase().includes(String(q.search).toLowerCase())))
    .map(s => ({ ...s, appointmentCount: serviceUsage(s.id) }));
  if (path === '/services' && method === 'post') {
    validateService(p.durationMinutes, p.price);
    if (db.services.some(s => s.name.trim().toLowerCase() === String(p.name ?? '').trim().toLowerCase()))
      bad(MSG.SERVICE_NAME_DUPLICATED, 'name', 409);
    const item: ServiceItem = { id: uid(), categoryId: String(p.categoryId), categoryName: '', name: String(p.name).trim(),
      durationMinutes: Number(p.durationMinutes), price: Number(p.price), priceText: '',
      description: String(p.description || ''), isActive: p.isActive !== false,
      stylistIds: (p.stylistIds as string[]) ?? [], stylistCount: 0, hasNoStylist: true };
    db.services.push(item); recomputeLinks(); save(); record('CREATE', 'service', `Thêm dịch vụ ${item.name}`); return item;
  }
  const serviceMatch = path.match(/^\/services\/([^/]+)$/);
  if (serviceMatch) {
    const item = db.services.find(s => s.id === serviceMatch[1]) ?? bad('Không tìm thấy dịch vụ');
    if (method === 'delete') {
      // S1-05: dịch vụ đã có lịch hẹn tham chiếu thì chỉ được ngừng bán
      if (serviceUsage(item.id) > 0) bad(MSG.SERVICE_IN_USE, undefined, 409);
      db.services = db.services.filter(s => s.id !== item.id); recomputeLinks(); save();
      record('DELETE', 'service', `Xoá dịch vụ ${item.name}`); return {};
    }
    if (method !== 'patch') return { ...item, appointmentCount: serviceUsage(item.id) };
    validateService(p.durationMinutes, p.price);
    if (p.name !== undefined && db.services.some(s => s.id !== item.id &&
      s.name.trim().toLowerCase() === String(p.name).trim().toLowerCase())) bad(MSG.SERVICE_NAME_DUPLICATED, 'name', 409);
    Object.assign(item, pick(p, ['categoryId', 'name', 'durationMinutes', 'price', 'description', 'isActive', 'stylistIds']));
    item.durationMinutes = Number(item.durationMinutes); item.price = Number(item.price);
    recomputeLinks(); save(); record('UPDATE', 'service', `Cập nhật ${item.name}`); return item;
  }

  if (path === '/stylists' && method === 'get') return db.stylists.filter(s =>
    (q.isActive === undefined || s.isActive === q.isActive) &&
    (!q.serviceId || s.serviceIds.includes(String(q.serviceId)))).map(withEmail);
  if (path === '/stylists' && method === 'post') {
    const email = String(p.email ?? '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) bad('Email không đúng định dạng', 'email');
    if (email && emailTaken(email)) bad(MSG.EMAIL_DUPLICATED, 'email', 409);
    let tempPassword: string | null = null;
    const item: Stylist = { id: uid(), userId: null, fullName: String(p.fullName).trim(), phone: String(p.phone || '') || null,
      avatarUrl: null, bio: String(p.bio || '') || null, isActive: p.isActive !== false, serviceIds: [],
      serviceNames: [], avgRating: null, reviewCount: 0 };
    if (email) {
      // Hồ sơ thợ có email -> tạo luôn tài khoản vai trò Thợ, buộc đổi mật khẩu tạm ở lần đăng nhập đầu
      const user: UserRow = { id: uid(), fullName: item.fullName, email, phone: item.phone, role: 'stylist',
        isActive: item.isActive, mustChangePassword: true, lockedUntil: null, lastLoginAt: null, stylistId: item.id,
        createdAt: new Date().toISOString() };
      tempPassword = generateTempPassword();
      db.users.push(user); db.auth[user.id] = { password: tempPassword, failed: 0 }; item.userId = user.id;
    }
    db.stylists.push(item); setStylistServices(item.id, (p.serviceIds as string[]) ?? []);
    save(); record('CREATE', 'stylist', `Thêm ${item.fullName}`);
    return { ...withEmail(item), tempPassword };
  }
  const stylistMatch = path.match(/^\/stylists\/([^/]+)(?:\/(.+))?$/);
  if (stylistMatch) {
    const stylist = db.stylists.find(s => s.id === stylistMatch[1]) ?? bad('Không tìm thấy thợ');
    if (stylistMatch[2] === 'shifts') {
      for (const shift of p.shifts as Shift[]) {
        if (minute(shift.startTime) >= minute(shift.endTime)) bad('Giờ kết thúc phải sau giờ bắt đầu');
        if (db.shifts.some(existing => existing.stylistId === stylist.id && existing.workDate === shift.workDate &&
          minute(shift.startTime) < minute(existing.endTime) && minute(shift.endTime) > minute(existing.startTime)))
          bad('Ca làm bị chồng lấn với ca hiện có');
      }
      const added = (p.shifts as Shift[]).map(shift => ({ ...shift, id: uid(), stylistId: stylist.id,
        stylistName: stylist.fullName, dayLabel: new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(new Date(`${shift.workDate}T00:00:00`)) }));
      db.shifts.push(...added); save(); return added;
    }
    if (stylistMatch[2] === 'time-off') {
      const affected = db.appointments.filter(a => a.date === p.offDate && a.stylist.id === stylist.id &&
        !['cancelled', 'no_show'].includes(a.status) && (!p.startTime || !p.endTime ||
          (minute(a.startTime) < minute(String(p.endTime)) && minute(a.endTime) > minute(String(p.startTime)))));
      if (affected.length && !p.force) return { warning: `${affected.length} lịch hẹn bị ảnh hưởng. Hãy chuyển lịch trước khi lưu.`,
        affected: affected.length, codes: affected.map(a => a.code) };
      const item: TimeOff = { id: uid(), stylistId: stylist.id, offDate: String(p.offDate),
        startTime: p.startTime ? String(p.startTime) : null, endTime: p.endTime ? String(p.endTime) : null,
        reason: p.reason ? String(p.reason) : null };
      db.timeOff.push(item); save(); return item;
    }
    if (stylistMatch[2] === 'avatar') return withEmail(stylist);
    if (method === 'patch') {
      Object.assign(stylist, pick(p, ['fullName', 'phone', 'bio', 'isActive', 'avatarUrl']));
      if (p.serviceIds) setStylistServices(stylist.id, p.serviceIds as string[]);
      // Đồng bộ sang tài khoản nhân sự: họ tên, SĐT, trạng thái (thợ nghỉ việc mất quyền truy cập ngay)
      const user = db.users.find(u => u.id === stylist.userId);
      if (user) {
        user.fullName = stylist.fullName; user.phone = stylist.phone;
        if (p.isActive !== undefined) user.isActive = stylist.isActive;
      }
      db.shifts.forEach(sh => { if (sh.stylistId === stylist.id) sh.stylistName = stylist.fullName; });
      save(); record('UPDATE', 'stylist', `Cập nhật hồ sơ ${stylist.fullName}`); return withEmail(stylist);
    }
    return withEmail(stylist);
  }
  if (path === '/shifts' && method === 'get') return db.shifts.filter(s =>
    (!q.from || s.workDate >= String(q.from)) && (!q.to || s.workDate <= String(q.to)) &&
    (!q.stylistId || s.stylistId === q.stylistId));
  if (path === '/shifts/copy-week') {
    const source = String(p.sourceWeekStart); const target = String(p.targetWeekStart);
    const from = new Date(`${source}T12:00:00`); const to = new Date(`${target}T12:00:00`);
    const offset = Math.round((to.getTime() - from.getTime()) / 86400000);
    let created = 0; let skipped = 0; let overwritten = 0;
    const originals = db.shifts.filter(s => s.workDate >= source && s.workDate <= iso(new Date(from.getTime() + 6 * 86400000)) &&
      (!p.stylistId || s.stylistId === p.stylistId));
    originals.forEach(shift => {
      const date = iso(new Date(new Date(`${shift.workDate}T12:00:00`).getTime() + offset * 86400000));
      const existing = db.shifts.find(s => s.stylistId === shift.stylistId && s.workDate === date);
      if (existing && !p.overwrite) { skipped++; return; }
      if (existing) { db.shifts = db.shifts.filter(s => s.id !== existing.id); overwritten++; }
      db.shifts.push({ ...shift, id: uid(), workDate: date }); created++;
    }); save(); return { created, skipped, overwritten };
  }
  const shiftMatch = path.match(/^\/shifts\/([^/]+)$/);
  if (shiftMatch) {
    const shift = db.shifts.find(s => s.id === shiftMatch[1]) ?? bad('Không tìm thấy ca');
    if (method === 'delete') { db.shifts = db.shifts.filter(s => s.id !== shift.id); save(); return {}; }
    Object.assign(shift, p); save(); return shift;
  }
  if (path === '/time-off' && method === 'get') return db.timeOff.filter(t =>
    (!q.from || t.offDate >= String(q.from)) && (!q.to || t.offDate <= String(q.to)) &&
    (!q.stylistId || t.stylistId === q.stylistId));
  if (path.startsWith('/time-off/') && method === 'delete') {
    db.timeOff = db.timeOff.filter(t => t.id !== path.split('/')[2]); save(); return {};
  }

  if (path === '/customers' && method === 'get') {
    let items = customerList();
    if (q.q || q.search) items = items.filter(c => `${c.fullName} ${c.phone}`.toLowerCase().includes(String(q.q || q.search).toLowerCase()));
    return paginate(items, q);
  }
  if (path.startsWith('/customers/by-phone/')) {
    // Cùng dạng với máy chủ thật: SĐT mới → found=false, không mượn số liệu của hồ sơ khác
    const phone = decodeURIComponent(path.split('/')[3] ?? '');
    const customer = customerList().find(c => c.phone === phone) ?? null;
    return { found: !!customer, customer, history: customer ? db.appointments.filter(a => a.customer.phone === phone)
      .map(a => ({ appointmentId: a.id, code: a.code, date: a.date, status: a.status, stylistName: a.stylist.fullName,
        services: a.services.map(s => s.name), technicalNote: db.notes[a.id] ?? null })) : [] };
  }
  const customerMatch = path.match(/^\/customers\/([^/]+)(?:\/(history))?$/);
  if (customerMatch) {
    const customer = customerList().find(c => c.id === customerMatch[1]) ?? bad('Không tìm thấy khách hàng');
    if (customerMatch[2]) return db.appointments.filter(a => a.customer.phone === customer.phone).map(a => ({
      appointmentId: a.id, code: a.code, date: a.date, status: a.status, stylistName: a.stylist.fullName,
      services: a.services.map(s => s.name), technicalNote: db.notes[a.id] ?? null }));
    if (method === 'patch') { db.notes[customer.phone] = String(p.note || ''); save(); return { ...customer, note: db.notes[customer.phone] }; }
    return customer;
  }

  if (path === '/invoices' && method === 'get') {
    let items = [...db.invoices];
    if (q.status) items = items.filter(i => i.status === q.status);
    if (q.from) items = items.filter(i => i.createdAt.slice(0, 10) >= String(q.from));
    if (q.to) items = items.filter(i => i.createdAt.slice(0, 10) <= String(q.to));
    return paginate(items, q);
  }
  if (path === '/invoices' && method === 'post') return createInvoice(String(p.appointmentId), p.items as Parameters<typeof createInvoice>[1]);
  if (path === '/invoices/voucher-preview') {
    const subtotal = Number(q.subtotal); const voucher = db.vouchers.find(v => v.code.toUpperCase() === String(q.code).toUpperCase() && v.isActive);
    if (!voucher) return bad('Mã giảm giá không hợp lệ');
    if (voucher.minOrderValue && subtotal < voucher.minOrderValue)
      return bad(`Mã ${voucher.code} chỉ áp dụng cho đơn từ ${money(voucher.minOrderValue)}`);
    const discountAmount = Math.min(subtotal, voucher.discountType === 'percent' ? Math.round(subtotal * voucher.discountValue / 100) : voucher.discountValue);
    return { code: voucher.code, discountAmount, discountAmountText: money(discountAmount),
      total: subtotal - discountAmount, totalText: money(subtotal - discountAmount) };
  }
  if (path.startsWith('/invoices/by-appointment/')) return db.invoices.find(i => i.appointmentId === path.split('/')[3]) ?? null;
  const invoiceMatch = path.match(/^\/invoices\/([^/]+)(?:\/(.+))?$/);
  if (invoiceMatch) {
    const invoice = db.invoices.find(i => i.id === invoiceMatch[1]) ?? bad('Không tìm thấy phiếu');
    const action = invoiceMatch[2];
    if (action === 'adjust') {
      const adjusted = createInvoice(invoice.appointmentId, p.items as Parameters<typeof createInvoice>[1]);
      adjusted.adjustsInvoiceId = invoice.id; adjusted.adjustReason = String(p.reason);
      computeInvoice(adjusted, p.voucherCode ? String(p.voucherCode) : undefined); save(); return adjusted;
    }
    if (action === 'pay') { invoice.status = 'paid'; invoice.statusLabel = 'Đã thanh toán';
      invoice.paymentMethod = p.paymentMethod === 'transfer' ? 'transfer' : 'cash';
      invoice.transferNote = p.transferNote ? String(p.transferNote) : null; invoice.paidAt = new Date().toISOString(); }
    else if (action === 'close') { invoice.status = 'closed'; invoice.statusLabel = 'Đã đóng'; invoice.closedAt = new Date().toISOString(); }
    else if (method === 'patch') { invoice.items = invoiceLines(p.items as Parameters<typeof invoiceLines>[0]);
      computeInvoice(invoice, p.voucherCode ? String(p.voucherCode) : undefined); }
    save(); record('UPDATE', 'invoice', `Cập nhật phiếu ${invoice.code}`); return invoice;
  }
  if (path === '/vouchers' && method === 'get') return db.vouchers;
  if (path === '/vouchers' && method === 'post') {
    const voucher: Voucher = { ...p, id: uid(), usedCount: 0 } as unknown as Voucher;
    db.vouchers.push(voucher); save(); return voucher;
  }
  if (path.startsWith('/vouchers/') && method === 'patch') {
    const voucher = db.vouchers.find(v => v.id === path.split('/')[2]) ?? bad('Không tìm thấy mã giảm giá');
    Object.assign(voucher, p); save(); record('UPDATE', 'voucher', `Cập nhật mã ${voucher.code}`); return voucher;
  }
  if (path.startsWith('/vouchers/') && method === 'delete') {
    db.vouchers = db.vouchers.filter(v => v.id !== path.split('/')[2]); save(); return {};
  }

  if (path === '/working-hours' && method === 'get') return db.workingHours;
  if (path === '/working-hours' && method === 'put') {
    // S1-08: giờ đóng phải sau giờ mở ít nhất 60 phút
    const invalid = (p.days as WorkingHour[]).find(d => !d.isClosed && minute(d.closeTime) - minute(d.openTime) < 60);
    if (invalid) bad(`${db.workingHours.find(wh => wh.dayOfWeek === invalid.dayOfWeek)?.dayLabel ?? ''}: ${MSG.WORKING_HOURS_MIN_60}`,
      `days.${invalid.dayOfWeek}.closeTime`);
    db.workingHours = (p.days as WorkingHour[]).map((item, index) => ({ ...item, id: `wh${index}`,
      dayLabel: db.workingHours.find(wh => wh.dayOfWeek === item.dayOfWeek)?.dayLabel ?? '' }));
    save(); return db.workingHours;
  }
  if (path === '/holidays' && method === 'get') return db.holidays.filter(h =>
    (!q.from || h.endDate >= String(q.from)) && (!q.to || h.startDate <= String(q.to)));
  if (path === '/holidays' && method === 'post') {
    const affected = db.appointments.filter(a => a.date >= String(p.startDate) && a.date <= String(p.endDate) &&
      !['cancelled', 'no_show'].includes(a.status));
    if (affected.length && !p.force) return { warning: `${affected.length} lịch hẹn nằm trong ngày nghỉ. Hãy liên hệ và chuyển lịch trước khi lưu.`,
      affected: affected.length, codes: affected.map(a => a.code) };
    const holiday: Holiday = { id: uid(), startDate: String(p.startDate), endDate: String(p.endDate), reason: String(p.reason) };
    db.holidays.push(holiday); save(); return holiday;
  }
  if (path.startsWith('/holidays/') && method === 'delete') {
    db.holidays = db.holidays.filter(h => h.id !== path.split('/')[2]); save(); return {};
  }

  if (path === '/users' && method === 'get') {
    let items = db.users.map(u => ({ ...u, stylistId: db.stylists.find(s => s.userId === u.id)?.id ?? null }));
    if (q.search) items = items.filter(u => `${u.fullName} ${u.email} ${u.phone ?? ''}`.toLowerCase().includes(String(q.search).toLowerCase()));
    if (q.role) items = items.filter(u => u.role === q.role);
    return paginate(items, q);
  }
  if (path === '/users' && method === 'post') {
    const email = String(p.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) bad('Email không đúng định dạng', 'email');
    // S1-02: email trùng bị từ chối kèm thông báo chỉ rõ trường bị trùng
    if (emailTaken(email)) bad(MSG.EMAIL_DUPLICATED, 'email', 409);
    const user: UserRow = { id: uid(), fullName: String(p.fullName).trim(), email,
      phone: p.phone ? String(p.phone) : null, role: p.role as UserRow['role'], isActive: p.isActive !== false,
      mustChangePassword: true, lockedUntil: null, lastLoginAt: null, stylistId: null,
      createdAt: new Date().toISOString() };
    // S1-02 (Lỗi 4): sinh mật khẩu tạm và TRẢ VỀ cho quản trị viên để hiển thị/sao chép ngay
    const tempPassword = generateTempPassword();
    db.users.push(user); db.auth[user.id] = { password: tempPassword, failed: 0 };
    if (user.role === 'stylist' && p.createStylistProfile !== false) {
      const profile: Stylist = { id: uid(), userId: user.id, fullName: user.fullName, phone: user.phone, avatarUrl: null,
        bio: null, isActive: user.isActive, serviceIds: [], serviceNames: [], avgRating: null, reviewCount: 0 };
      db.stylists.push(profile); user.stylistId = profile.id;
    }
    save(); record('CREATE', 'user', `Thêm ${user.fullName}`); return { ...user, tempPasswordSentTo: user.email, tempPassword };
  }
  const userMatch = path.match(/^\/users\/([^/]+)(?:\/(.+))?$/);
  if (userMatch) {
    const user = db.users.find(u => u.id === userMatch[1]) ?? bad('Không tìm thấy tài khoản');
    const cred = (db.auth[user.id] ??= { password: passwordForRole(user.role), failed: 0 });
    if (userMatch[2] === 'reset-password') {
      const tempPassword = generateTempPassword();
      cred.password = tempPassword; cred.failed = 0; user.lockedUntil = null; user.mustChangePassword = true;
      save(); record('RESET_PASSWORD', 'user', `Cấp lại mật khẩu tạm cho ${user.email}`);
      return { success: true, sentTo: user.email, tempPassword };
    }
    if (userMatch[2] === 'unlock') { user.lockedUntil = null; cred.failed = 0; save(); return user; }
    if (method !== 'patch') return user;
    const changes = pick(p, ['fullName', 'phone', 'role', 'isActive']) as Partial<UserRow>;
    const willDeactivate = changes.isActive === false && user.isActive;
    const willLoseAdmin = changes.role !== undefined && changes.role !== 'admin' && user.role === 'admin';
    // S1-02: không cho phép ngưng hoạt động / hạ quyền quản trị viên cuối cùng
    if ((willDeactivate || willLoseAdmin) && user.role === 'admin' &&
      db.users.filter(u => u.role === 'admin' && u.isActive).length <= 1) bad(MSG.LAST_ADMIN);
    if (willDeactivate && user.id === getUser()?.id) bad(MSG.CANNOT_DEACTIVATE_SELF);
    Object.assign(user, changes);
    const profile = db.stylists.find(s => s.userId === user.id);
    if (profile) {
      profile.fullName = user.fullName; profile.phone = user.phone;
      profile.isActive = user.isActive && user.role === 'stylist';
    } else if (user.role === 'stylist') {
      const created: Stylist = { id: uid(), userId: user.id, fullName: user.fullName, phone: user.phone, avatarUrl: null,
        bio: null, isActive: user.isActive, serviceIds: [], serviceNames: [], avgRating: null, reviewCount: 0 };
      db.stylists.push(created); user.stylistId = created.id;
    }
    save(); record('UPDATE', 'user', `Cập nhật ${user.fullName}`); return user;
  }
  if (path === '/audit-logs') {
    let items = [...db.audit];
    if (q.actor || q.actorId) items = items.filter(a => a.actorEmail?.includes(String(q.actor || q.actorId)));
    if (q.action) items = items.filter(a => a.action === q.action);
    if (q.entityType) items = items.filter(a => a.entityType === q.entityType);
    if (q.from) items = items.filter(a => a.createdAt.slice(0, 10) >= String(q.from));
    if (q.to) items = items.filter(a => a.createdAt.slice(0, 10) <= String(q.to));
    return paginate(items, q);
  }
  if (path === '/notifications/unread-count') return { count: db.notifications.filter(item => !item.isRead).length };
  if (path === '/notifications') return paginate(db.notifications, q);
  if (path.startsWith('/notifications/') && method === 'patch') {
    if (path === '/notifications/read-all') db.notifications.forEach(item => { item.isRead = true; });
    else { const item = db.notifications.find(entry => entry.id === path.split('/')[2]); if (item) item.isRead = true; }
    save(); return {};
  }

  if (path === '/reviews/stylist-ratings') return db.stylists.map(s => ({ stylistId: s.id,
    stylistName: s.fullName, reviewCount: s.reviewCount, avgRating: s.avgRating,
    display: `${s.avgRating?.toFixed(1) ?? '—'} / 5` }));
  const reviewAppointment = path === '/reviews/by-code'
    ? db.appointments.find(a => a.code.toUpperCase() === String(q.code).toUpperCase())
    : path.startsWith('/reviews/token/') ? db.appointments.find(a => a.code === path.split('/')[3] || a.id === path.split('/')[3]) : null;
  if (path === '/reviews/by-code' || path.startsWith('/reviews/token/')) {
    const a = reviewAppointment ?? bad('Không tìm thấy lịch hẹn để đánh giá');
    if (method === 'post') { db.reviews[a.code] = { rating: Number(p.rating), comment: String(p.comment || '') };
      save(); record('CREATE', 'review', `Đánh giá ${a.code}`); }
    const review = db.reviews[a.code];
    return { token: a.code, appointmentCode: a.code, customerName: a.customer.fullName,
      stylistName: a.stylist.fullName, serviceNames: a.services.map(s => s.name), dateText: a.date,
      alreadySubmitted: !!review, rating: review?.rating ?? null, comment: review?.comment ?? null };
  }

  if (path === '/analytics/today') {
    const date = String(q.date || day()); const items = db.appointments.filter(a => a.date === date);
    const revenue = db.invoices.filter(i => i.status !== 'draft' &&
      db.appointments.find(a => a.id === i.appointmentId)?.date === date).reduce((sum, i) => sum + i.total, 0);
    return { date, statuses: summary(items), totalAppointments: items.length, revenue, revenueText: money(revenue),
      invoiceCount: db.invoices.filter(i => i.status !== 'draft').length, workingStylists: db.stylists.filter(s => s.isActive).length,
      refreshedAt: new Date().toISOString() };
  }
  if (path === '/analytics/revenue' || path.startsWith('/analytics/export/')) {
    const from = String(q.from || day(-30)); const to = String(q.to || day());
    const invoices = db.invoices.filter(i => i.status !== 'draft' && i.createdAt.slice(0, 10) >= from && i.createdAt.slice(0, 10) <= to);
    const total = invoices.reduce((sum, i) => sum + i.total, 0);
    const subtotal = invoices.reduce((sum, i) => sum + i.subtotal, 0);
    const byStylist = db.stylists.map(s => { const list = invoices.filter(i => i.stylistName === s.fullName);
      const revenue = list.reduce((sum, i) => sum + i.total, 0);
      return { stylistId: s.id, stylistName: s.fullName, completedCount: list.length, revenue,
        revenueText: money(revenue), avgPerVisit: list.length ? Math.round(revenue / list.length) : 0,
        avgPerVisitText: money(list.length ? Math.round(revenue / list.length) : 0) }; });
    const byService = db.services.map(s => { const lines = invoices.flatMap(i => i.items).filter(line => line.serviceId === s.id);
      const revenue = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      return { serviceId: s.id, serviceName: s.name, quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        revenue, revenueText: money(revenue) }; }).filter(s => s.quantity > 0);
    const byDay = [...new Set(invoices.map(i => i.createdAt.slice(0, 10)))].sort().map(date => {
      const list = invoices.filter(i => i.createdAt.slice(0, 10) === date);
      const revenue = list.reduce((sum, i) => sum + i.total, 0);
      return { date, revenue, revenueText: money(revenue), invoices: list.length };
    });
    if (path.startsWith('/analytics/export/')) {
      const kind = path.split('/')[3];
      const rows = kind === 'stylists' ? [['Thợ', 'Lượt', 'Doanh thu'], ...byStylist.map(s => [s.stylistName, s.completedCount, s.revenue])]
        : kind === 'services' ? [['Dịch vụ', 'Lượt', 'Doanh thu'], ...byService.map(s => [s.serviceName, s.quantity, s.revenue])]
          : [['Mã phiếu', 'Khách hàng', 'Doanh thu'], ...invoices.map(i => [i.code, i.customerName, i.total])];
      return `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
    }
    return { from, to, summary: { invoiceCount: invoices.length, subtotal, subtotalText: money(subtotal),
      discount: subtotal - total, discountText: money(subtotal - total), total, totalText: money(total) },
      byStylist, byService, byDay };
  }
  if (path === '/analytics/slot-density') {
    const items = db.appointments.filter(a => !q.from || a.date >= String(q.from)).filter(a => !q.to || a.date <= String(q.to));
    const status = summary(items);
    const density = Array.from({ length: 12 }, (_, index) => { const hour = index + 9;
      const matching = items.filter(a => Number(a.startTime.slice(0, 2)) === hour);
      return { hour, hourLabel: `${String(hour).padStart(2, '0')}:00`,
        weekdayCount: matching.filter(a => ![0, 6].includes(new Date(`${a.date}T00:00:00`).getDay())).length,
        weekendCount: matching.filter(a => [0, 6].includes(new Date(`${a.date}T00:00:00`).getDay())).length,
        totalCount: matching.length }; });
    const weeklyDensity = Array.from({ length: 7 * 12 }, (_, index) => {
      const weekday = index % 7; const hour = Math.floor(index / 7) + 9;
      return { weekday, hour, count: items.filter(a => new Date(`${a.date}T00:00:00`).getDay() === weekday &&
        Number(a.startTime.slice(0, 2)) === hour).length };
    });
    return { from: q.from, to: q.to, density, weeklyDensity, noShow: { total: items.length, noShow: status.no_show,
      cancelled: status.cancelled, completed: status.completed,
      noShowRate: items.length ? status.no_show * 100 / items.length : 0,
      cancelRate: items.length ? status.cancelled * 100 / items.length : 0,
      completionRate: items.length ? status.completed * 100 / items.length : 0 } };
  }
  bad(`Demo chưa hỗ trợ ${method.toUpperCase()} ${path}`);
}

export async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method || 'get').toLowerCase();
  const path = (config.url || '').split('?')[0];
  const params = (config.params ?? {}) as Record<string, unknown>;
  const payload = typeof config.data === 'string' ? JSON.parse(config.data || '{}') as Record<string, unknown>
    : (config.data ?? {}) as Record<string, unknown>;
  const result = handle(method, path, payload, params);
  if (config.responseType === 'blob') return { data: result, status: 200, statusText: 'OK', headers: {}, config };
  return { data: { success: true, data: result }, status: 200, statusText: 'OK', headers: {}, config };
}
