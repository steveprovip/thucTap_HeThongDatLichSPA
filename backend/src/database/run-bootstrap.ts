/**
 * Khởi tạo tối thiểu cho máy VẬN HÀNH THẬT (production / cloud), thay cho seed.sql:
 *   npm run bootstrap
 *
 * Chỉ làm đúng hai việc và CHỈ KHI bảng còn trống — chạy lại bao nhiêu lần cũng không ghi đè gì:
 *   1. bảng users chưa có ai   -> tạo MỘT tài khoản admin từ BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 *      (bắt buộc đổi mật khẩu ở lần đăng nhập đầu);
 *   2. bảng salon_working_hours trống -> đặt giờ mở cửa mặc định, chủ tiệm chỉnh lại trong màn hình Thiết lập.
 * Không tạo thợ, dịch vụ, khách hay lịch hẹn mẫu nào.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { isSafeEmail, isSafePasswordCharset, isStrongPassword } from '../common/utils/password.util';
import { connectWithRetry, hintFor, PgError } from './db-tools';

type Logger = (msg: string) => void;

const DEFAULT_HOURS: Array<[number, string, string]> = [
  [1, '08:30', '20:00'], [2, '08:30', '20:00'], [3, '08:30', '20:00'], [4, '08:30', '20:00'], [5, '08:30', '20:00'],
  [6, '08:00', '21:00'], [0, '08:00', '21:00'],
];

export interface BootstrapResult {
  adminCreated: boolean;
  hoursCreated: boolean;
}

export async function bootstrapProduction(
  client: Client,
  env: Record<string, string | undefined> = process.env,
  log: Logger = console.log,
): Promise<BootstrapResult> {
  const result: BootstrapResult = { adminCreated: false, hoursCreated: false };

  const users = Number((await client.query('SELECT COUNT(*) AS n FROM users')).rows[0].n);
  if (users > 0) {
    log(`> Đã có ${users} tài khoản — giữ nguyên, không tạo thêm admin.`);
  } else {
    const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
    const password = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) {
      log('[CẢNH BÁO] CSDL chưa có tài khoản nào. Đặt BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD rồi chạy lại: npm run bootstrap');
    } else if (!isSafeEmail(email)) {
      throw new Error('BOOTSTRAP_ADMIN_EMAIL không hợp lệ (chỉ gồm chữ không dấu, số và . _ % + -).');
    } else if (!isStrongPassword(password) || !isSafePasswordCharset(password)) {
      throw new Error(
        'BOOTSTRAP_ADMIN_PASSWORD phải từ 8 ký tự, có cả chữ và số, không dấu, không khoảng trắng. ' +
          'Lưu ý: trong tệp .env, ký tự # mở đầu phần ghi chú nên mật khẩu có # bị cắt cụt - hãy bỏ # hoặc đặt cả mật khẩu trong dấu nháy kép.',
      );
    } else {
      const rounds = Number(env.BCRYPT_ROUNDS ?? 10);
      const hash = await bcrypt.hash(password, Number.isFinite(rounds) ? rounds : 10);
      await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $2, $3, 'admin', TRUE, TRUE)
         ON CONFLICT DO NOTHING`,
        ['Quản trị hệ thống', email, hash],
      );
      result.adminCreated = true;
      log(`> Đã tạo tài khoản admin ${email} (phải đổi mật khẩu ở lần đăng nhập đầu).`);
    }
  }

  const hours = Number((await client.query('SELECT COUNT(*) AS n FROM salon_working_hours')).rows[0].n);
  if (hours === 0) {
    for (const [dow, open, close] of DEFAULT_HOURS) {
      await client.query(
        `INSERT INTO salon_working_hours (day_of_week, open_time, close_time, is_closed)
         VALUES ($1, $2, $3, FALSE) ON CONFLICT DO NOTHING`,
        [dow, open, close],
      );
    }
    result.hoursCreated = true;
    log('> Đã đặt giờ mở cửa mặc định (Thứ 2–6: 08:30–20:00, Thứ 7 & CN: 08:00–21:00).');
  } else {
    log('> Giờ mở cửa đã có — giữ nguyên.');
  }
  return result;
}

async function main(): Promise<void> {
  loadEnv();
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);
  const client = await connectWithRetry(conn);
  try {
    await bootstrapProduction(client);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err: PgError) => {
    console.error('Bootstrap thất bại:', err.message || err.code || String(err));
    const hint = hintFor(resolveDbConnection(), err);
    if (hint) console.error(`Gợi ý: ${hint}`);
    process.exit(1);
  });
}
