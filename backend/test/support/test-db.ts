/**
 * CSDL RIÊNG cho bộ kiểm thử end-to-end — để test không bao giờ chạm vào CSDL đang vận hành.
 *
 * Trước đây `npm run test:e2e` dùng chung CSDL `salon_booking` trong backend/.env: mỗi lần chạy test
 * để lại khách giả, lịch hẹn giả (và có test còn đặt lại mật khẩu) ngay trong dữ liệu làm việc.
 *
 * Giờ: trước khi chạy test tạo CSDL `salon_booking_test` mới tinh (migration + seed.sql), chạy xong thì XOÁ.
 *   TEST_DB_NAME           tên CSDL test, bắt buộc kết thúc bằng _test (mặc định salon_booking_test)
 *   TEST_DB_HOST/PORT/USER/PASSWORD   máy chủ PostgreSQL dùng để chạy test (mặc định lấy DB_* trong backend/.env,
 *                          rồi localhost:5432 salon/salon123). DATABASE_URL (CSDL trên mây) KHÔNG BAO GIỜ được dùng cho test.
 *   TEST_DB_KEEP=1         giữ lại CSDL test sau khi chạy xong để soi lỗi
 *   TEST_DB_ALLOW_REMOTE=1 cho phép chạy test trên máy chủ không phải localhost (mặc định chặn)
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseEnvFile } from 'dotenv';
import { DbConnection } from '../../src/config/db-connection';

export const DEFAULT_TEST_DB = 'salon_booking_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

const envFile = (): Record<string, string> => {
  const file = join(__dirname, '..', '..', '.env');
  return existsSync(file) ? parseEnvFile(readFileSync(file)) : {};
};

export const assertSafeTestDbName = (name: string): void => {
  if (!/^[a-z][a-z0-9_]*_test$/.test(name)) {
    throw new Error(
      `Tên CSDL kiểm thử "${name}" không hợp lệ: chỉ gồm chữ thường, số, gạch dưới và PHẢI kết thúc bằng "_test" ` +
        '(để không bao giờ trùng với CSDL thật).',
    );
  }
};

export function resolveTestDb(env: Record<string, string | undefined> = process.env): DbConnection {
  const file = envFile();
  const pick = (key: string, fallback: string): string =>
    env[`TEST_DB_${key}`] || file[`TEST_DB_${key}`] || env[`DB_${key}`] || file[`DB_${key}`] || fallback;

  const database = env.TEST_DB_NAME || file.TEST_DB_NAME || DEFAULT_TEST_DB;
  assertSafeTestDbName(database);

  const host = pick('HOST', 'localhost');
  if (!LOCAL_HOSTS.has(host) && env.TEST_DB_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Từ chối chạy kiểm thử trên máy chủ CSDL "${host}" vì không phải máy cục bộ (test sẽ tạo và XOÁ CSDL). ` +
        'Nếu thật sự muốn, đặt TEST_DB_ALLOW_REMOTE=1.',
    );
  }
  return {
    host,
    port: Number(pick('PORT', '5432')),
    username: env.TEST_DB_USER || file.TEST_DB_USER || env.DB_USER || file.DB_USER || 'salon',
    password: pick('PASSWORD', 'salon123'),
    database,
    ssl: false,
    poolMax: 10,
    startupTimezone: true,
  };
}

/** Ép mọi biến môi trường trỏ vào CSDL test, KỂ CẢ khi backend/.env có DATABASE_URL hay DB_NAME của CSDL thật. */
export function applyTestEnv(conn: DbConnection): void {
  process.env.DATABASE_URL = ''; // chuỗi rỗng: ConfigModule không nạp lại giá trị từ .env
  process.env.DB_HOST = conn.host;
  process.env.DB_PORT = String(conn.port);
  process.env.DB_USER = conn.username;
  process.env.DB_PASSWORD = conn.password;
  process.env.DB_NAME = conn.database;
  process.env.DB_SSL = 'false';
  process.env.DB_STARTUP_TIMEZONE = 'true';
}
