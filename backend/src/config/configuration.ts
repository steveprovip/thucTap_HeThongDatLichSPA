import { resolveDbConnection } from './db-connection';

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
    /** Các nguồn (origin) được phép gọi API từ trình duyệt, cách nhau bằng dấu phẩy: giao diện đặt trên tên miền khác (Cloudflare Pages…). */
    corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
    /** true: NestJS phục vụ luôn giao diện đã build (frontend/dist) -> chỉ cần MỘT địa chỉ / một đường hầm cho cả web lẫn API. */
    serveFrontend: bool(process.env.SERVE_FRONTEND, false),
    frontendDist: process.env.FRONTEND_DIST ?? '',
    /** Express 'trust proxy': chỉ tin X-Forwarded-For do proxy tin cậy gắn (mặc định: proxy chạy trên cùng máy, vd. Vite). */
    trustProxy: process.env.TRUST_PROXY ?? 'loopback',
    swaggerEnabled: bool(process.env.SWAGGER_ENABLED, process.env.NODE_ENV !== 'production'),
    salonName: process.env.SALON_NAME ?? 'Salon & Spa Hương Sen',
    salonAddress: process.env.SALON_ADDRESS ?? '128 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
    salonHotline: process.env.SALON_HOTLINE ?? '028 3838 6868',
    /** Mentor S2 · mục 7: thông tin liên hệ & mạng xã hội hiển thị ở chân trang công khai. */
    salonEmail: process.env.SALON_EMAIL ?? 'lienhe@huongsen.vn',
    salonFacebookUrl: process.env.SALON_FACEBOOK_URL ?? 'https://www.facebook.com/',
    salonZalo: process.env.SALON_ZALO ?? '0909686868',
    salonWebsiteUrl: process.env.SALON_WEBSITE_URL ?? '',
    salonMapUrl: process.env.SALON_MAP_URL ?? '',
    salonSlogan: process.env.SALON_SLOGAN ?? 'Chăm sóc tóc, da và tinh thần trong không gian tinh tế',
    // Tài khoản nhận chuyển khoản VietQR — đọc lúc CHẠY (Launcher > Thiết lập cửa hàng ghi vào đây), không cần build lại
    // giao diện như VITE_BANK_* cũ. Mã BIN NAPAS 6 số, ví dụ 970436 = Vietcombank.
    bankBin: process.env.BANK_BIN ?? '',
    bankAccountNo: process.env.BANK_ACCOUNT_NO ?? '',
    bankAccountName: process.env.BANK_ACCOUNT_NAME ?? '',
  },
  database: {
    // DATABASE_URL (Supabase / Neon / Render) hoặc DB_HOST… (Docker tại máy); xem config/db-connection.ts
    ...resolveDbConnection(),
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
    /** QA 11/10: bắt buộc email khi khách tự đặt online (mặc định tắt — vẫn nhắc rõ lợi ích nếu bỏ trống). */
    requireBookingEmail: bool(process.env.BOOKING_REQUIRE_EMAIL, false),
    reviewTokenDays: int(process.env.REVIEW_TOKEN_DAYS, 7),
    minReviewsToShowAvg: int(process.env.MIN_REVIEWS_TO_SHOW_AVG, 5),
    checkInWindowMinutes: 60,
    noShowUndoMinutes: 15,
    pendingOverdueHours: 12,
    reminderHoursBefore: 24,
    /** Mentor S2 · mục 11: giữ chỗ khung giờ khi khách đang điền thông tin (5–15 phút, mặc định 10). */
    slotHoldMinutes: Math.min(15, Math.max(5, int(process.env.SLOT_HOLD_MINUTES, 10))),
    slotHoldIpLimitPerHour: int(process.env.SLOT_HOLD_IP_LIMIT_PER_HOUR, 30),
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
  /** Part 5 — Trợ lý AI: mô hình nhỏ tuỳ chọn (Ollama cục bộ / API tương thích OpenAI). Trống = chỉ dùng luật. */
  ai: {
    // TASK v4 · NV5: để trống = 'auto' — tự dò AI local (model_AI_local) tại AI_BASE_URL, không có thì trả lời theo luật.
    // 'off' = luôn theo luật; 'ollama' | 'openai' = cấu hình cố định như trước.
    provider: (process.env.AI_PROVIDER ?? '').trim().toLowerCase() || 'auto',
    baseUrl: process.env.AI_BASE_URL ?? '',
    // Trống: chế độ auto lấy model máy chủ local đang nạp; chế độ cố định dùng qwen2.5:3b như trước
    model: (process.env.AI_MODEL ?? '').trim(),
    apiKey: process.env.AI_API_KEY ?? '',
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 25000),
    // QA 12/10 — chịu tải: số câu gọi mô hình cùng lúc (llama-server -np 1 → 1–2), hàng chờ tối đa và thời gian chờ chỗ;
    // vượt ngưỡng thì trả lời ngay theo số liệu thật. Câu mở đầu giống nhau dùng lại câu trả lời AI trong AI_CACHE_MINUTES.
    maxConcurrency: Math.max(1, int(process.env.AI_MAX_CONCURRENCY, 2)),
    maxQueue: Math.max(0, int(process.env.AI_MAX_QUEUE, 6)),
    queueWaitMs: Math.max(0, int(process.env.AI_QUEUE_WAIT_MS, 4000)),
    cacheMinutes: Math.max(0, int(process.env.AI_CACHE_MINUTES, 10)),
    // Câu dẫn tư vấn do mô hình viết (1 = bật). Mặc định tắt: dùng câu dẫn soạn sẵn theo nhu cầu (mô hình nhỏ hay viết sai nghĩa).
    llmLead: ['1', 'true', 'on', 'yes'].includes((process.env.AI_LLM_LEAD ?? '').trim().toLowerCase()),
    // QA 12/10: chế độ auto tự bật lại model_AI_local khi máy chủ AI local tắt (sau khi khởi động lại máy). 0 = tắt.
    autostart: !['0', 'false', 'off', 'no'].includes((process.env.AI_LOCAL_AUTOSTART ?? '').trim().toLowerCase())
      && process.env.NODE_ENV !== 'test',
  },
  // Thông báo đa kênh: webhook nhận sự kiện appointment.created / appointment.confirmed (Zalo ZNS, SMS Brandname, n8n…)
  dispatch: {
    webhookUrls: (process.env.DISPATCH_WEBHOOK_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    secret: process.env.DISPATCH_WEBHOOK_SECRET ?? '',
    timeoutMs: int(process.env.DISPATCH_TIMEOUT_MS, 5000),
  },
  upload: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxAvatarSizeMb: int(process.env.MAX_AVATAR_SIZE_MB, 2),
  },
});

export default configuration;

export type AppConfiguration = ReturnType<typeof configuration>;
