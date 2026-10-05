/**
 * Đọc thông tin kết nối PostgreSQL từ biến môi trường — MỘT nơi duy nhất cho ứng dụng NestJS,
 * lệnh migration, lệnh nạp dữ liệu và bộ kiểm thử, nên không còn chỗ nào "tự đọc" khác nhau.
 *
 * Hai cách khai báo (cách 1 thắng nếu có cả hai):
 *   1. DATABASE_URL=postgresql://user:matkhau@host:5432/tencsdl?sslmode=require
 *      (chuỗi kết nối do Supabase / Neon / Render cấp sẵn — dán nguyên vào là chạy)
 *   2. DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (cách quen thuộc khi chạy Docker tại máy)
 *
 * Mã hoá đường truyền (TLS):
 *   DB_SSL=false (mặc định, Docker/PostgreSQL tại máy)
 *   DB_SSL=true | verify  -> mã hoá và KIỂM TRA chứng chỉ máy chủ (Neon dùng chứng chỉ công khai: dùng được)
 *   DB_SSL=require | no-verify -> mã hoá nhưng KHÔNG kiểm tra chứng chỉ (Supabase pooler hay cần cách này)
 *   Nếu không đặt DB_SSL mà DATABASE_URL có ?sslmode=… thì theo ngữ nghĩa của libpq:
 *   disable -> tắt; require/prefer/allow -> mã hoá không kiểm tra; verify-ca/verify-full -> kiểm tra đủ.
 */
export type DbSsl = false | { rejectUnauthorized: boolean };

export interface DbConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: DbSsl;
  /** Số kết nối tối đa của pool (gói miễn phí thường chỉ cho 5–20 kết nối). */
  poolMax: number;
  /**
   * Gửi `-c timezone=…` khi mở kết nối. Bộ gộp kết nối (Neon pooler, Supabase pooler) từ chối tham số
   * khởi tạo này nên khi dùng chúng phải đặt DB_STARTUP_TIMEZONE=false. Không ảnh hưởng dữ liệu:
   * mọi cột thời điểm là TIMESTAMPTZ và các truy vấn thô đều ghi rõ AT TIME ZONE 'Asia/Ho_Chi_Minh'.
   */
  startupTimezone: boolean;
}

type Env = Record<string, string | undefined>;

const TRUE_WORDS = ['1', 'true', 'yes', 'on', 'verify'];
const NO_VERIFY_WORDS = ['require', 'no-verify', 'noverify'];
const FALSE_WORDS = ['', '0', 'false', 'no', 'off', 'disable'];

const toInt = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
};

/** `DB_SSL` (ưu tiên) hoặc `sslmode` trong chuỗi kết nối -> cấu hình TLS cho `pg`. */
export function parseSsl(dbSsl: string | undefined, sslmode?: string | null): DbSsl {
  const explicit = dbSsl?.trim().toLowerCase();
  if (explicit !== undefined && explicit !== '') {
    if (FALSE_WORDS.includes(explicit)) return false;
    if (NO_VERIFY_WORDS.includes(explicit)) return { rejectUnauthorized: false };
    if (TRUE_WORDS.includes(explicit)) return { rejectUnauthorized: true };
    throw new Error(`DB_SSL="${dbSsl}" không hợp lệ. Dùng: false, true (kiểm tra chứng chỉ) hoặc require (không kiểm tra).`);
  }
  const mode = sslmode?.trim().toLowerCase();
  if (!mode || mode === 'disable') return false;
  if (mode === 'verify-ca' || mode === 'verify-full') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false }; // require / prefer / allow
}

export function resolveDbConnection(env: Env = process.env): DbConnection {
  const poolMax = toInt(env.DB_POOL_MAX, 20);
  const startupTimezone = !FALSE_WORDS.slice(1).includes((env.DB_STARTUP_TIMEZONE ?? 'true').trim().toLowerCase());
  const url = env.DATABASE_URL?.trim();

  if (url) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      // Không in lại chuỗi kết nối vì có mật khẩu
      throw new Error('DATABASE_URL không đúng định dạng postgresql://tài_khoản:mật_khẩu@máy_chủ:cổng/tên_csdl');
    }
    if (!/^postgres(ql)?:$/.test(u.protocol)) {
      throw new Error('DATABASE_URL phải bắt đầu bằng postgresql:// hoặc postgres://');
    }
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      ssl: parseSsl(env.DB_SSL, u.searchParams.get('sslmode')),
      poolMax,
      startupTimezone,
    };
  }

  return {
    host: env.DB_HOST ?? 'localhost',
    port: toInt(env.DB_PORT, 5432),
    username: env.DB_USER ?? 'salon',
    password: env.DB_PASSWORD ?? 'salon123',
    database: env.DB_NAME ?? 'salon_booking',
    ssl: parseSsl(env.DB_SSL),
    poolMax,
    startupTimezone,
  };
}

/** Mô tả an toàn để ghi log (không có mật khẩu). */
export const describeDb = (c: DbConnection): string => `${c.username}@${c.host}:${c.port}/${c.database}`;
