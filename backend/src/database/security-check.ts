/**
 * Phát hiện (và khoá) các tài khoản MẪU còn mật khẩu mặc định công khai trong README (Admin@123, Owner@123…).
 *
 *   npm run security:check               liệt kê tài khoản còn mật khẩu mặc định (mã thoát 3 nếu có)
 *   npm run security:check -- --lock     khoá các tài khoản đó (ngưng hoạt động + thu hồi mọi phiên đăng nhập)
 *
 * Vì sao quan trọng: ngay khi mở hệ thống ra Internet (Cloudflare Tunnel, Render…), bất kỳ ai đọc README đều đăng nhập
 * được bằng tài khoản mẫu. Máy thật phải tạo tài khoản thật (npm run bootstrap hoặc màn hình Người dùng) rồi khoá tài khoản mẫu.
 * Tài khoản đã đổi mật khẩu thì KHÔNG bị đụng tới.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, hintFor, PgError } from './db-tools';

/** Đúng danh sách trong database/seed.sql và README. */
export const DEMO_ACCOUNTS: ReadonlyArray<{ email: string; password: string }> = [
  { email: 'admin@salon.vn', password: 'Admin@123' },
  { email: 'owner@salon.vn', password: 'Owner@123' },
  { email: 'reception@salon.vn', password: 'Reception@123' },
  ...[1, 2, 3, 4, 5].map((n) => ({ email: `stylist${n}@salon.vn`, password: 'Stylist@123' })),
];

/** Email các tài khoản ĐANG HOẠT ĐỘNG mà mật khẩu vẫn là mật khẩu mặc định. */
export async function findDefaultPasswordAccounts(client: Client): Promise<string[]> {
  const rows = await client.query(
    `SELECT email, password_hash FROM users WHERE is_active = TRUE AND lower(email) = ANY($1::text[])`,
    [DEMO_ACCOUNTS.map((a) => a.email)],
  );
  const found: string[] = [];
  for (const r of rows.rows as Array<{ email: string; password_hash: string }>) {
    const demo = DEMO_ACCOUNTS.find((a) => a.email === r.email.toLowerCase());
    if (demo && (await bcrypt.compare(demo.password, r.password_hash))) found.push(r.email);
  }
  return found.sort();
}

export async function lockDefaultPasswordAccounts(client: Client): Promise<string[]> {
  const emails = await findDefaultPasswordAccounts(client);
  if (emails.length === 0) return [];
  await client.query(
    `UPDATE users SET is_active = FALSE, sessions_valid_from = now() WHERE lower(email) = ANY($1::text[])`,
    [emails.map((e) => e.toLowerCase())],
  );
  return emails;
}

async function main(): Promise<number> {
  loadEnv();
  const conn = resolveDbConnection();
  const client = await connectWithRetry(conn);
  try {
    console.log(`> Kết nối ${describeDb(conn)}`);
    if (process.argv.includes('--lock')) {
      const locked = await lockDefaultPasswordAccounts(client);
      console.log(locked.length ? `> Đã khoá ${locked.length} tài khoản mẫu còn mật khẩu mặc định: ${locked.join(', ')}` : '> Không có tài khoản mẫu nào còn mật khẩu mặc định.');
      return 0;
    }
    const found = await findDefaultPasswordAccounts(client);
    if (found.length === 0) {
      console.log('> An toàn: không có tài khoản mẫu nào còn mật khẩu mặc định.');
      return 0;
    }
    console.log(`[CẢNH BÁO BẢO MẬT] ${found.length} tài khoản còn mật khẩu mặc định công khai trong README: ${found.join(', ')}`);
    console.log('  Đừng mở hệ thống ra Internet khi chưa xử lý. Cách xử lý:');
    console.log('  - Tạo tài khoản thật (đăng nhập quản trị > Người dùng), rồi chạy: npm run security:lock --prefix backend');
    console.log('    (khoá hết tài khoản mẫu chưa đổi mật khẩu), hoặc đổi mật khẩu từng tài khoản.');
    return 3;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err: PgError) => {
    console.error('Kiểm tra bảo mật thất bại:', err.message || err.code || String(err));
    const hint = hintFor(resolveDbConnection(), err);
    if (hint) console.error(`Gợi ý: ${hint}`);
    process.exit(1);
  });
}
