/** Toàn bộ thông điệp trả về cho người dùng đều bằng tiếng Việt có dấu. */
export const MSG = {
  // Xác thực
  LOGIN_FAILED: 'Email hoặc mật khẩu không đúng',
  ACCOUNT_LOCKED: (minutes: number) =>
    `Tài khoản đã bị khoá do nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ${minutes} phút`,
  ACCOUNT_INACTIVE: 'Tài khoản đang ngưng hoạt động. Vui lòng liên hệ quản trị viên',
  TOKEN_INVALID: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  REFRESH_INVALID: 'Refresh token không hợp lệ hoặc đã bị thu hồi',
  MUST_CHANGE_PASSWORD: 'Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống',
  CURRENT_PASSWORD_WRONG: 'Mật khẩu hiện tại không đúng',
  PASSWORD_WEAK: 'Mật khẩu phải có tối thiểu 8 ký tự, gồm cả chữ và số',
  PASSWORD_SAME_AS_OLD: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  RESET_LINK_SENT: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi',
  RESET_TOKEN_INVALID: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng',
  RESET_TOKEN_EXPIRED: 'Liên kết đặt lại mật khẩu đã hết hạn, vui lòng yêu cầu liên kết mới',
  RESET_TOO_MANY: 'Bạn đã yêu cầu gửi lại liên kết quá 3 lần trong một giờ, vui lòng thử lại sau',

  // Phân quyền
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  FORBIDDEN_OWN_DATA: 'Bạn chỉ được thao tác trên dữ liệu của chính mình',

  // Tài khoản
  EMAIL_DUPLICATED: 'Email này đã được sử dụng cho một tài khoản khác',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản',
  LAST_ADMIN: 'Không thể ngưng hoạt động hoặc đổi vai trò tài khoản quản trị cuối cùng của hệ thống',
  CANNOT_DEACTIVATE_SELF: 'Không thể tự ngưng hoạt động tài khoản đang đăng nhập',

  // Dịch vụ
  SERVICE_NOT_FOUND: 'Không tìm thấy dịch vụ',
  SERVICE_NAME_DUPLICATED: 'Tên dịch vụ đã tồn tại',
  SERVICE_DURATION_INVALID: 'Thời lượng phải là bội số của 15 phút và nằm trong khoảng 15 đến 240 phút',
  SERVICE_PRICE_INVALID: 'Giá phải là số nguyên dương và không vượt quá 20.000.000 đ',
  SERVICE_IN_USE: 'Dịch vụ đã có lịch hẹn tham chiếu nên không xoá được, hãy chuyển sang trạng thái ngừng bán',
  SERVICE_IN_INVOICE: 'Dịch vụ đã xuất hiện trên phiếu tính tiền nên không xoá được, hãy chuyển sang trạng thái ngừng bán',
  CATEGORY_NOT_FOUND: 'Không tìm thấy nhóm dịch vụ',
  CATEGORY_NAME_DUPLICATED: 'Tên nhóm dịch vụ đã tồn tại',
  CATEGORY_HAS_SERVICES: (n: number) => `Nhóm này còn ${n} dịch vụ đang bán nên không xoá được`,

  // Thợ / ca làm
  STYLIST_NOT_FOUND: 'Không tìm thấy thợ',
  STYLIST_INACTIVE: 'Thợ này đã nghỉ việc, không thể nhận lịch mới',
  STYLIST_MISSING_SKILL: (names: string) => `Thợ không thực hiện được dịch vụ: ${names}`,
  SHIFT_NOT_FOUND: 'Không tìm thấy ca làm',
  SHIFT_OVERLAP: 'Ca làm bị chồng lấn với một ca khác của cùng thợ trong ngày',
  /** QA-07: nêu rõ TÊN CA và KHUNG GIỜ đang bị xung đột. */
  SHIFT_OVERLAP_DETAIL: (newRange: string, label: string, range: string, day: string) =>
    `Ca ${newRange} bị chồng lấn với "${label}" (${range}) ngày ${day}. Vui lòng chọn khung giờ khác hoặc sửa ca đã có`,
  SHIFT_ON_HOLIDAY: (day: string, reason: string) => `${day}: tiệm nghỉ (${reason}) nên không xếp ca được`,
  SHIFT_OUT_OF_SALON_HOURS: (open: string, close: string) =>
    `Ca làm phải nằm trong giờ mở cửa của tiệm hôm đó (${open} - ${close})`,
  SHIFT_HAS_APPOINTMENTS: 'Ca làm đang chứa lịch hẹn nên không xoá được',
  SALON_CLOSED_THAT_DAY: 'Tiệm đóng cửa vào ngày này',
  WORKING_HOURS_MIN_60: 'Giờ đóng cửa phải sau giờ mở cửa ít nhất 60 phút',
  HOLIDAY_NOT_FOUND: 'Không tìm thấy ngày nghỉ',
  TIME_OFF_NOT_FOUND: 'Không tìm thấy khai báo nghỉ',

  // Đặt lịch
  SLOT_TAKEN: 'Khung giờ vừa có người đặt, vui lòng chọn khung giờ khác',
  SLOT_INVALID: 'Khung giờ không hợp lệ hoặc không còn trống',
  SLOT_IN_PAST: 'Không thể đặt lịch cho thời điểm trong quá khứ',
  SLOT_TOO_SOON: (m: number) => `Vui lòng đặt lịch trước ít nhất ${m} phút so với giờ bắt đầu`,
  MAX_SERVICES: (n: number) => `Mỗi lượt đặt chỉ được chọn tối đa ${n} dịch vụ`,
  NO_SERVICE_SELECTED: 'Vui lòng chọn ít nhất một dịch vụ',
  PHONE_INVALID: 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09',
  TOO_MANY_ACTIVE_BOOKINGS: (n: number) =>
    `Số điện thoại này đang có ${n} lịch hẹn chưa hoàn tất, vui lòng hoàn tất hoặc huỷ bớt trước khi đặt thêm`,
  BOOKING_RATE_LIMITED: 'Bạn đã đặt quá nhiều lịch trong một giờ, vui lòng thử lại sau',
  LOOKUP_RATE_LIMITED: (m: number) => `Bạn đã tra cứu sai quá nhiều lần, vui lòng thử lại sau ${m} phút`,
  APPOINTMENT_NOT_FOUND: 'Không tìm thấy lịch hẹn',
  CODE_NOT_FOUND: 'Không tìm thấy lịch hẹn với mã tra cứu này',
  CANCEL_TOO_LATE: (m: number) =>
    `Chỉ huỷ được khi còn cách giờ hẹn tối thiểu ${m} phút. Vui lòng gọi điện cho tiệm để được hỗ trợ`,
  ALREADY_CANCELLED: 'Lịch hẹn đã được huỷ trước đó',
  INVALID_STATUS_TRANSITION: (from: string, to: string) =>
    `Không thể chuyển lịch hẹn từ trạng thái "${from}" sang "${to}"`,
  CHECKIN_WINDOW: 'Chỉ check-in được trong khoảng 60 phút trước đến 60 phút sau giờ hẹn',
  CHECKIN_REQUIRES_CONFIRMED: 'Chỉ check-in được lịch hẹn đã xác nhận',
  NO_SHOW_TOO_EARLY: (m: number) => `Chỉ đánh dấu không đến sau giờ hẹn ít nhất ${m} phút`,
  NO_SHOW_ALREADY_ARRIVED: 'Khách đã được check-in nên không đánh dấu không đến được',
  UNDO_WINDOW_EXPIRED: (m: number) => `Chỉ hoàn tác được trong vòng ${m} phút sau thao tác`,
  START_REQUIRES_ARRIVED: 'Chỉ bắt đầu được khi khách đã đến',
  COMPLETE_REQUIRES_STARTED: 'Chỉ hoàn tất được khi lượt dịch vụ đã bắt đầu',
  REJECT_REASON_REQUIRED: 'Vui lòng chọn lý do từ chối',

  // Phiếu tính tiền
  INVOICE_NOT_FOUND: 'Không tìm thấy phiếu tính tiền',
  INVOICE_EXISTS: 'Lịch hẹn này đã có phiếu tính tiền',
  INVOICE_CLOSED: 'Phiếu đã đóng nên không sửa được. Hãy tạo phiếu điều chỉnh kèm lý do',
  INVOICE_REQUIRES_COMPLETED: 'Chỉ lập phiếu khi thợ đã bấm hoàn tất lượt dịch vụ',
  CLOSE_REQUIRES_PAID: 'Chỉ đóng lịch hẹn khi phiếu đã được thanh toán',
  TRANSFER_NOTE_REQUIRED: 'Thanh toán chuyển khoản cần nhập ghi chú đối soát',
  VOUCHER_NOT_FOUND: 'Mã giảm giá không tồn tại',
  VOUCHER_EXPIRED: 'Mã giảm giá đã hết hạn hoặc chưa tới ngày áp dụng',
  VOUCHER_USED_UP: 'Mã giảm giá đã hết lượt sử dụng',
  VOUCHER_ALREADY_APPLIED: 'Mỗi phiếu chỉ được áp dụng một mã giảm giá',
  INVOICE_NO_ITEMS: 'Phiếu phải có ít nhất một dòng dịch vụ',

  // Đánh giá
  REVIEW_TOKEN_INVALID: 'Liên kết đánh giá không hợp lệ',
  REVIEW_TOKEN_USED: 'Liên kết đánh giá này đã được sử dụng',
  REVIEW_TOKEN_EXPIRED: 'Liên kết đánh giá đã hết hạn',
  REVIEW_REQUIRES_COMPLETED: 'Chỉ đánh giá được lịch hẹn đã hoàn tất',
  NOT_ENOUGH_REVIEWS: 'Chưa đủ dữ liệu',

  // Khác
  VALIDATION_FAILED: 'Dữ liệu gửi lên không hợp lệ',
  NOT_FOUND: 'Không tìm thấy dữ liệu',
  INTERNAL_ERROR: 'Hệ thống gặp sự cố, vui lòng thử lại sau',
  DATE_RANGE_TOO_LONG: 'Khoảng ngày không được vượt quá 365 ngày',
  DATE_RANGE_INVALID: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
  FILE_TOO_LARGE: (mb: number) => `Tệp vượt quá dung lượng cho phép (${mb}MB)`,
  FILE_TYPE_INVALID: 'Chỉ chấp nhận ảnh định dạng JPG hoặc PNG',
} as const;

/** Mã lỗi máy đọc được, trả kèm trường `code` trong phản hồi lỗi để giao diện rẽ nhánh. */
export const ERROR_CODES = {
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SHIFT_HAS_APPOINTMENTS: 'SHIFT_HAS_APPOINTMENTS',
  SHIFT_OVERLAP: 'SHIFT_OVERLAP',
  SHIFT_OUTSIDE_OPERATING_HOURS: 'SHIFT_OUTSIDE_OPERATING_HOURS',
  MAX_APPOINTMENTS_EXCEEDED: 'MAX_APPOINTMENTS_EXCEEDED',
  LOOKUP_LOCKED: 'LOOKUP_LOCKED',
  EXCEEDS_LONGEST_SHIFT: 'EXCEEDS_LONGEST_SHIFT',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  arrived: 'Đã đến',
  in_progress: 'Đang làm',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  no_show: 'Không đến',
};

export const REJECT_REASONS = [
  'Thợ đã kín lịch khung giờ này',
  'Tiệm nghỉ đột xuất',
  'Khách đặt trùng nhiều lịch',
  'Không liên hệ được với khách',
  'Đặt sát giờ, tiệm không kịp chuẩn bị',
  'Lý do khác',
] as const;
