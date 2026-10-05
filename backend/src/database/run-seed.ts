/**
 * Nạp dữ liệu MẪU cho máy phát triển / kiểm thử thủ công.
 *   npm run seed   -> áp dụng migration còn thiếu (gồm lược đồ gốc), rồi nạp seed.sql
 *
 * KHÔNG dùng cho máy đang vận hành thật: seed.sql đặt lại mật khẩu 8 tài khoản mẫu (Admin@123…) và sinh
 * lịch hẹn mẫu theo ngày hôm nay. Máy thật dùng `npm run migration:run` + `npm run bootstrap`.
 *
 * Lược đồ do migration quản lý (database/schema.sql chỉ là migration gốc, không còn được chạy trực tiếp),
 * và seed.sql viết theo hướng chạy lại được, không nhân đôi bản ghi (S1-10).
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, hintFor, PgError } from './db-tools';
import { runMigrations } from './migrate';
import { readSeedSql } from './sql-files';

loadEnv();

async function main(): Promise<void> {
  // seed.sql LUÔN đặt lại mật khẩu 8 tài khoản mẫu (Admin@123...). Chạy nhầm vào CSDL thật = mở cửa
  // hậu cho ai đọc README. Chặn ở production trừ khi chủ động cho phép.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw Object.assign(new Error('Từ chối nạp dữ liệu mẫu khi NODE_ENV=production (đặt SEED_ALLOW_PRODUCTION=1 nếu thật sự muốn).'), { code: 'SEED_BLOCKED' });
  }
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);

  // Cho phép bỏ qua phần dữ liệu mẫu nhưng vẫn cập nhật cấu trúc (launcher đặt SALON_SEED=never trên máy thật)
  console.log('> Áp dụng migration (cấu trúc CSDL) ...');
  await runMigrations(conn, { backup: 'auto' });

  if (process.env.SALON_SEED?.trim().toLowerCase() === 'never') {
    console.log('> SALON_SEED=never: bỏ qua dữ liệu mẫu, giữ nguyên dữ liệu hiện có.');
    return;
  }

  const client = await connectWithRetry(conn);
  try {
    console.log('> Nạp database/seed.sql ...');
    client.on('notice', (n) => console.log(`  ${n.message}`));
    await client.query(readSeedSql());
    console.log('  Xong.');

    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM users)        AS users,
         (SELECT COUNT(*) FROM stylists)     AS stylists,
         (SELECT COUNT(*) FROM services)     AS services,
         (SELECT COUNT(*) FROM appointments) AS appointments,
         (SELECT COUNT(*) FROM invoices)     AS invoices`,
    );
    console.log('> Kết quả:', counts.rows[0]);
    console.log('\nTài khoản mẫu:');
    console.log('  admin@salon.vn      / Admin@123      (Quản trị hệ thống)');
    console.log('  owner@salon.vn      / Owner@123      (Chủ tiệm)');
    console.log('  reception@salon.vn  / Reception@123  (Lễ tân)');
    console.log('  stylist1@salon.vn   / Stylist@123    (Thợ — còn stylist2..5)');
  } finally {
    await client.end();
  }
}

main().catch((err: PgError) => {
  console.error('Nạp dữ liệu thất bại:', err.message || err.code || String(err));
  const hint = hintFor(resolveDbConnection(), err);
  if (hint) console.error(`Gợi ý: ${hint}`);
  process.exit(1);
});
