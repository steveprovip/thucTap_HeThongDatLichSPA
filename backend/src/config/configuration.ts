/**
 * Tập trung toàn bộ biến môi trường về một nơi, có ép kiểu và giá trị mặc định.
 * Mọi module khác chỉ đọc qua ConfigService để tránh rải rác process.env.
 */
const int = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
};
const bool = (v: string | undefined, def = false): boolean =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

/** Production thiếu secret → dừng khởi động, không ký JWT bằng khoá mặc định công khai trong mã nguồn. */
const secret = (name: string, devDefault: string): string => {
  const v = process.env[name];
  const isProd = process.env.NODE_ENV === 'production';
  // Giá trị mẫu trong .env.example đã công khai trên git -> coi như chưa đặt
  if (v && isProd && (v.startsWith('doi_chuoi_nay') || v.length < 32)) {
    throw new Error(`${name} đang dùng giá trị mẫu hoặc quá ngắn (< 32 ký tự)`);
  }
  if (v) return v;
  if (isProd) throw new Error(`Thiếu biến môi trường bắt buộc ${name}`);
  return devDefault;
};

const configuration = () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: int(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    timezone: process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    /** Express 'trust proxy': chỉ tin X-Forwarded-For do proxy tin cậy gắn (mặc định: proxy chạy trên cùng máy, vd. Vite). */
    trustProxy: process.env.TRUST_PROXY ?? 'loopback',
    swaggerEnabled: bool(process.env.SWAGGER_ENABLED, process.env.NODE_ENV !== 'production'),
    salonName: process.env.SALON_NAME ?? 'Salon & Spa Hương Sen',
    salonAddress: process.env.SALON_ADDRESS ?? '128 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
    salonHotline: process.env.SALON_HOTLINE ?? '028 3838 6868',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'salon',
    password: process.env.DB_PASSWORD ?? 'salon123',
    database: process.env.DB_NAME ?? 'salon_booking',
    logging: bool(process.env.DB_LOGGING, false),
  },
  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: secret('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '30m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  security: {
    loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5),
    loginLockMinutes: int(process.env.LOGIN_LOCK_MINUTES, 15),
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
    bookingIpLimitPerHour: int(process.env.BOOKING_IP_LIMIT_PER_HOUR, 5),
    lookupIpLimitPerHour: int(process.env.LOOKUP_IP_LIMIT_PER_HOUR, 10),
    lookupBlockMinutes: int(process.env.LOOKUP_BLOCK_MINUTES, 30),
    resetEmailLimitPerHour: int(process.env.RESET_EMAIL_LIMIT_PER_HOUR, 3),
    resetTokenMinutes: 30,
  },
  business: {
    minLeadTimeMinutes: int(process.env.MIN_LEAD_TIME_MINUTES, 60),
    cancelCutoffMinutes: int(process.env.CANCEL_CUTOFF_MINUTES, 120),
    maxServicesPerBooking: int(process.env.MAX_SERVICES_PER_BOOKING, 5),
    maxActiveBookingsPerPhone: int(process.env.MAX_ACTIVE_BOOKINGS_PER_PHONE, 3),
    slotStepMinutes: int(process.env.SLOT_STEP_MINUTES, 15),
    noShowAfterMinutes: int(process.env.NO_SHOW_AFTER_MINUTES, 30),
    overrunWarningMinutes: int(process.env.OVERRUN_WARNING_MINUTES, 20),
    reviewTokenDays: int(process.env.REVIEW_TOKEN_DAYS, 7),
    minReviewsToShowAvg: int(process.env.MIN_REVIEWS_TO_SHOW_AVG, 5),
    checkInWindowMinutes: 60,
    noShowUndoMinutes: 15,
    pendingOverdueHours: 12,
    reminderHoursBefore: 24,
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: int(process.env.SMTP_PORT, 1025),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    fromName: process.env.MAIL_FROM_NAME ?? 'Salon & Spa Hương Sen',
    fromAddress: process.env.MAIL_FROM_ADDRESS ?? 'no-reply@salon.vn',
    workerEnabled: bool(process.env.MAIL_WORKER_ENABLED, true),
    maxAttempts: 3,
    retryMinutes: 10,
  },
  upload: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxAvatarSizeMb: int(process.env.MAX_AVATAR_SIZE_MB, 2),
  },
});

export default configuration;

export type AppConfiguration = ReturnType<typeof configuration>;
