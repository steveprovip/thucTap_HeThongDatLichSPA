/**
 * Nạp lược đồ và dữ liệu mẫu vào cơ sở dữ liệu.
 *   npm run seed            -> chạy schema.sql (nếu bảng chưa có) rồi seed.sql
 *   npm run seed -- --force -> chạy lại cả hai tệp
 *
 * Cả hai tệp SQL đều viết theo hướng chạy lại được, không nhân đôi bản ghi (S1-10).
 */
import 'reflect-metadata';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv();

const DB = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'salon',
  password: process.env.DB_PASSWORD ?? 'salon123',
  database: process.env.DB_NAME ?? 'salon_booking',
};

const findSqlDir = (): string => {
  const candidates = [
    resolve(process.cwd(), '..', 'database'),
    resolve(process.cwd(), 'database'),
    resolve(__dirname, '..', '..', '..', 'database'),
  ];
  for (const c of candidates) if (existsSync(join(c, 'schema.sql'))) return c;
  throw new Error('Không tìm thấy thư mục database chứa schema.sql');
};

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const sqlDir = findSqlDir();
  const client = new Client(DB);
  await client.connect();
  console.log(`> Kết nối ${DB.user}@${DB.host}:${DB.port}/${DB.database}`);

  try {
    const { rows } = await client.query(
      `SELECT to_regclass('public.appointments') IS NOT NULL AS ready`,
    );
    const schemaReady: boolean = rows[0].ready;

    if (!schemaReady || force) {
      console.log('> Áp dụng database/schema.sql ...');
      await client.query(readFileSync(join(sqlDir, 'schema.sql'), 'utf8'));
      console.log('  Xong.');
    } else {
      console.log('> Lược đồ đã tồn tại, bỏ qua schema.sql (dùng --force để chạy lại).');
    }

    console.log('> Nạp database/seed.sql ...');
    client.on('notice', (n) => console.log(`  ${n.message}`));
    await client.query(readFileSync(join(sqlDir, 'seed.sql'), 'utf8'));
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

main().catch((err) => {
  console.error('Nạp dữ liệu thất bại:', err.message);
  process.exit(1);
});
