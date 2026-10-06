/** Kiểu dữ liệu dùng chung giữa các màn hình, khớp với phản hồi của API. */

export type Role = 'customer' | 'stylist' | 'receptionist' | 'owner' | 'admin';

export type AppointmentStatus =
  | 'pending' | 'confirmed' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type AppointmentSource = 'online' | 'walk_in';
export type PaymentMethod = 'cash' | 'transfer';
export type InvoiceStatus = 'draft' | 'paid' | 'closed' | 'adjusted';
export type DiscountType = 'percent' | 'amount';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface ApiError {
  success: false;
  statusCode: number;
  message: string;
  field?: string;
  errors?: Record<string, string>;
  /** Mã lỗi máy đọc được, vd. ACCOUNT_LOCKED, SHIFT_HAS_APPOINTMENTS, RATE_LIMITED. */
  code?: string;
  details?: ApiErrorDetails;
}

/** Dữ liệu kèm theo lỗi để giao diện xử lý riêng (QA-01, QA-09). */
export interface ApiErrorDetails {
  lockedUntil?: string;
  retryAfterSeconds?: number;
  appointments?: ShiftConflictAppointment[];
}

export interface ShiftConflictAppointment {
  id: string;
  code: string;
  startTime: string;
  endTime: string;
  customerName: string;
  status: AppointmentStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  stylistId: string | null;
  mustChangePassword: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ----------------------------------------------------------- Danh mục
export interface ServiceCategory {
  id: string;
  name: string;
  displayOrder: number;
  serviceCount?: number;
}

export interface ServiceItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
  isActive: boolean;
  stylistIds: string[];
  stylistCount: number;
  hasNoStylist: boolean;
  /** Số lịch hẹn đang tham chiếu dịch vụ; > 0 thì không được xoá, chỉ được ngừng kinh doanh (S1-05). */
  appointmentCount?: number;
}

export interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
}

export interface PublicCatalogGroup {
  categoryId: string;
  categoryName: string;
  displayOrder: number;
  services: PublicService[];
}

// ----------------------------------------------------------- Thợ, ca làm
export type StylistGender = 'male' | 'female';

export interface Stylist {
  id: string;
  userId: string | null;
  /** Email đăng nhập của tài khoản nhân sự gắn với hồ sơ; null khi thợ chưa có tài khoản. */
  email?: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  /** Giới tính để chọn ảnh đại diện phù hợp; null với hồ sơ cũ chưa cập nhật. */
  gender: StylistGender | null;
  bio: string | null;
  isActive: boolean;
  serviceIds: string[];
  serviceNames: string[];
  avgRating: number | null;
  reviewCount: number;
}

export interface PublicStylist {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  gender?: StylistGender | null;
  bio: string | null;
  avgRating?: number | null;
}

export interface Shift {
  id: string;
  stylistId: string;
  stylistName: string;
  workDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  note: string | null;
}

export interface TimeOff {
  id: string;
  stylistId: string;
  offDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface WorkingHour {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface Holiday {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

/** Mentor S2 · mục 9: độ phủ ca làm theo ngày. */
export interface CoverageGap {
  startTime: string;
  endTime: string;
  minutes: number;
  minCount: number;
  candidates: { stylistId: string; fullName: string; weekMinutes: number }[];
}
export interface CoverageDay {
  date: string;
  dayText: string;
  closedReason: string | null;
  openTime: string | null;
  closeTime: string | null;
  staffCount: number;
  openMinutes: number;
  coveredMinutes: number;
  coveragePercent: number;
  peakCount: number;
  hourly: { hour: number; count: number }[];
  gaps: CoverageGap[];
}
export interface CoverageReport {
  from: string;
  to: string;
  minStaff: number;
  totalGapMinutes: number;
  understaffedDays: number;
  workload: { stylistId: string; fullName: string; minutes: number }[];
  days: CoverageDay[];
}

/** Mentor S2 · mục 6: thợ tự đăng ký ca làm / nghỉ, quản lý duyệt. */
export type ShiftRequestKind = 'shift' | 'time_off';
export type ShiftRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface ShiftRequest {
  id: string;
  stylistId: string;
  stylistName: string;
  kind: ShiftRequestKind;
  workDate: string;
  dayText: string;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  note: string | null;
  status: ShiftRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  createdAt: string;
}
export interface ShiftRequestItem {
  kind: ShiftRequestKind;
  workDate: string;
  startTime?: string | null;
  endTime?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  note?: string;
}

/** Mentor S2 · mục 5: ngày lễ quốc gia do trợ lý đề xuất, đã đối chiếu dữ liệu tiệm. */
export interface HolidaySuggestion {
  key: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  calendar: 'solar' | 'lunar';
  rule: string;
  note: string | null;
  status: 'ready' | 'exists' | 'conflict' | 'past';
  existingReason: string | null;
  affectedAppointments: number;
  affectedCodes: string[];
}

export interface GenerateHolidaysResult {
  year: number;
  created: { key: string; id: string; name: string; startDate: string; endDate: string }[];
  skipped: { key: string; name: string; reason: string }[];
}

// ----------------------------------------------------------- Đặt lịch
export interface Slot {
  time: string;
  stylistIds: string[];
}

export interface Availability {
  date: string;
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  salonClosed: boolean;
  closedReason: string | null;
  slots: Slot[];
  suggestedDates: string[];
  exceedsLongestShift: boolean;
}

export interface Quote {
  services: { id: string; name: string; durationMinutes: number; price: number; priceText: string }[];
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  /** QA-13: ca dài nhất trong 7 ngày tới của các thợ làm được gói (phút, 0 = chưa xếp ca). */
  longestShiftMinutes?: number;
  exceedsLongestShift?: boolean;
  warningCode?: 'EXCEEDS_LONGEST_SHIFT' | null;
  note: string;
}

/** Mentor S2 · mục 4: Trợ lý AI xếp lịch cho nhân viên. */
export interface SmartSlot {
  date: string;
  time: string;
  endTime: string;
  stylistId: string;
  stylistName: string;
  score: number;
  reasons: string[];
}
export interface SmartSlotsResult {
  fromDate: string;
  days: number;
  totalDurationMinutes: number;
  suggestions: SmartSlot[];
  windows: {
    date: string;
    closedReason: string | null;
    stylists: { stylistId: string; stylistName: string; loadMinutes: number; free: { start: string; end: string }[] }[];
  }[];
}

/** Mentor S2 · mục 11: chỗ đang tạm giữ trong lúc khách điền thông tin. */
export interface SlotHold {
  holdToken: string;
  stylistId: string;
  stylistName: string;
  date: string;
  time: string;
  endTime: string;
  expiresAt: string;
  holdMinutes: number;
}

export interface BookingResult {
  code: string;
  appointmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  startAtText: string;
  stylistName: string;
  services: { name: string; durationMinutes: number; price: number }[];
  totalDurationMinutes: number;
  estimatedTotal: number;
  status: AppointmentStatus;
  nameConflict: boolean;
  emailQueued: boolean;
}

export interface PublicAppointment {
  code: string;
  status: AppointmentStatus;
  statusLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  startAtText: string;
  expectedEndText: string;
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  customerName: string;
  customerPhoneMasked: string;
  stylistName: string;
  services: { name: string; durationMinutes: number; price: number; priceText: string }[];
  customerNote: string | null;
  cancelledAt: string | null;
  cancelledByLabel: string | null;
  cancelReason: string | null;
}

export interface AppointmentServiceLine {
  id: string;
  serviceId: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
}

export interface Appointment {
  id: string;
  code: string;
  status: AppointmentStatus;
  statusLabel: string;
  source: AppointmentSource;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  startAtText: string;
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  customer: {
    id: string; fullName: string; phone: string; phoneMasked: boolean;
    email: string | null;
    /** Lượt hoàn tất / lượt không đến / tổng lịch đã đặt — đều đếm từ bảng lịch hẹn. */
    totalVisits: number; noShowCount: number; totalAppointments: number;
  };
  stylist: { id: string; fullName: string };
  services: AppointmentServiceLine[];
  customerNote: string | null;
  isLate: boolean;
  lateMinutes: number;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actualDurationMinutes: number | null;
  cancelledAt: string | null;
  cancelledByLabel: string | null;
  cancelReason: string | null;
  rejectedReason: string | null;
  confirmedAt: string | null;
  noShowAt: string | null;
  pendingOverdue: boolean;
  createdAt: string;
  changes?: AppointmentChange[];
}

export interface AppointmentChange {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface TimelineColumn {
  stylistId: string;
  stylistName: string;
  avatarUrl: string | null;
  gender?: StylistGender | null;
  workingBlocks: { start: string; end: string }[];
  offBlocks: { start: string; end: string; reason: string }[];
  appointments: Appointment[];
}

export interface DayTimeline {
  date: string;
  dayLabel: string;
  salonOpen: string;
  salonClose: string;
  salonClosed: boolean;
  closedReason: string | null;
  stepMinutes: number;
  columns: TimelineColumn[];
  summary: Record<AppointmentStatus, number>;
}

// ----------------------------------------------------------- Khách hàng
export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  phoneMasked: boolean;
  email: string | null;
  /** Lượt hoàn tất (lịch trạng thái "Hoàn tất"). */
  totalVisits: number;
  /** Lượt không đến (lịch trạng thái "Không đến"). */
  noShowCount: number;
  /** Tổng lịch đã đặt (mọi trạng thái). */
  totalAppointments: number;
  note: string | null;
  isNew: boolean;
  createdAt: string;
}

export interface VisitHistoryItem {
  appointmentId: string;
  code: string;
  date: string;
  status: AppointmentStatus;
  stylistName: string;
  services: string[];
  technicalNote: string | null;
}

// ----------------------------------------------------------- Thanh toán
export interface InvoiceLine {
  id: string;
  serviceId: string | null;
  name: string;
  unitPrice: number;
  unitPriceText: string;
  quantity: number;
  lineTotal: number;
  lineTotalText: string;
}

export interface Invoice {
  id: string;
  code: string;
  appointmentId: string;
  appointmentCode: string;
  customerName: string;
  customerPhone: string;
  stylistName: string;
  items: InvoiceLine[];
  subtotal: number;
  subtotalText: string;
  voucherCode: string | null;
  discountAmount: number;
  discountAmountText: string;
  total: number;
  totalText: string;
  paymentMethod: PaymentMethod | null;
  transferNote: string | null;
  status: InvoiceStatus;
  statusLabel: string;
  adjustsInvoiceId: string | null;
  adjustReason: string | null;
  paidAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface Voucher {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  maxUsage: number | null;
  /** Giá trị đơn tối thiểu (đ) để áp mã; null = không giới hạn. */
  minOrderValue?: number | null;
  usedCount: number;
  isActive: boolean;
}

// ----------------------------------------------------------- Đánh giá
export interface ReviewForm {
  token: string;
  appointmentCode: string;
  customerName: string;
  stylistName: string;
  serviceNames: string[];
  dateText: string;
  alreadySubmitted: boolean;
  rating: number | null;
  comment: string | null;
}

export interface StylistRating {
  stylistId: string;
  stylistName: string;
  reviewCount: number;
  avgRating: number | null;
  display: string;
}

// ----------------------------------------------------------- Thông báo
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  appointmentId: string | null;
  isRead: boolean;
  createdAt: string;
}

// ----------------------------------------------------------- Tài khoản
export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  stylistId: string | null;
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  actorEmail: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// ----------------------------------------------------------- Báo cáo
export interface TodayDashboard {
  date: string;
  statuses: Record<AppointmentStatus, number>;
  totalAppointments: number;
  revenue: number;
  revenueText: string;
  invoiceCount: number;
  workingStylists: number;
  refreshedAt: string;
}

export interface RevenueReport {
  from: string;
  to: string;
  summary: {
    invoiceCount: number; subtotal: number; subtotalText: string;
    discount: number; discountText: string; total: number; totalText: string;
  };
  byStylist: {
    stylistId: string; stylistName: string; completedCount: number;
    revenue: number; revenueText: string; avgPerVisit: number; avgPerVisitText: string;
  }[];
  byService: {
    serviceId: string | null; serviceName: string; quantity: number;
    revenue: number; revenueText: string;
  }[];
  byDay: { date: string; revenue: number; revenueText: string; invoices: number }[];
}

export interface SlotDensityReport {
  from: string;
  to: string;
  density: { hour: number; hourLabel: string; weekdayCount: number; weekendCount: number; totalCount: number }[];
  weeklyDensity?: { weekday: number; hour: number; count: number }[];
  noShow: {
    total: number; noShow: number; cancelled: number; completed: number;
    noShowRate: number; cancelRate: number; completionRate: number;
  };
}
