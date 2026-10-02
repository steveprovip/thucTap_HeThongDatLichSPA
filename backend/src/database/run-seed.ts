/**
 * Nạp lược đồ và dữ liệu mẫu vào cơ sở dữ liệu.
 *   npm run seed   -> chạy schema.sql rồi seed.sql
 *
 * Cả hai tệp SQL đều viết theo hướng chạy lại được, không nhân đôi bản ghi (S1-10),
 * nên schema.sql được áp dụng MỖI LẦN: máy đã có CSDL cũ vẫn nhận đủ bảng/cột/chỉ mục mới
 * sau khi git pull. (Cờ --force cũ vẫn được chấp nhận để tương thích.)
 *
 * Kết nối được thử lại tối đa DB_WAIT_SECONDS giây (mặc định 120): lần đầu dựng volume,
 * container PostgreSQL chạy init script rồi KHỞI ĐỘNG LẠI, trong lúc đó cổng TCP chưa mở.
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

/** Mã lỗi cho thấy máy chủ CSDL CHƯA sẵn sàng (đáng để thử lại), khác với sai cấu hình. */
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  '57P03', // cannot_connect_now: "the database system is starting up / shutting down"
  '53300', // too_many_connections
]);

type PgError = Error & { code?: string };

const isTransient = (err: PgError): boolean =>
  (err.code !== undefined && TRANSIENT_CODES.has(err.code)) ||
  /terminat|starting up|shutting down|Connection terminated/i.test(err.message);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connectWithRetry(): Promise<Client> {
  const waitSeconds = Number(process.env.DB_WAIT_SECONDS ?? 120);
  const deadline = Date.now() + waitSeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const client = new Client({ ...DB, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return client;
    } catch (e) {
      const err = e as PgError;
      await client.end().catch(() => undefined);
      if (!isTransient(err) || Date.now() >= deadline) throw err;
      if (attempt === 1) {
        console.log(`> Chờ PostgreSQL tại ${DB.host}:${DB.port} sẵn sàng (tối đa ${waitSeconds} giây) ...`);
      }
      await sleep(2000);
    }
  }
}

/** Gợi ý khắc phục theo mã lỗi PostgreSQL / Node để người dùng tự sửa được. */
const hintFor = (err: PgError): string | null => {
  switch (err.code) {
    case '28P01':
    case '28000':
      return (
        `Sai tài khoản/mật khẩu CSDL. Nguyên nhân hay gặp: máy đã cài sẵn PostgreSQL chiếm cổng ${DB.port}, ` +
        'nên kết nối đi vào PostgreSQL của máy chứ không phải container. Cách sửa: đặt POSTGRES_PORT=5433 trong .env ' +
        'và DB_PORT=5433 trong backend/.env rồi chạy lại.'
      );
    case '3D000':
      return `CSDL "${DB.database}" chưa tồn tại. Nếu dùng Docker: npm run db:reset. Nếu dùng PostgreSQL riêng: tạo CSDL rồi chạy lại.`;
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `Không có PostgreSQL nào lắng nghe ở ${DB.host}:${DB.port}. Hãy bật Docker Desktop rồi chạy lại launcher (hoặc: docker compose up -d).`;
    default:
      return null;
  }
};

async function main(): Promise<void> {
  // seed.sql LUÔN đặt lại mật khẩu 8 tài khoản mẫu (Admin@123...). Chạy nhầm vào CSDL thật = mở cửa
  // hậu cho ai đọc README. Chặn ở production trừ khi chủ động cho phép.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw Object.assign(new Error('Từ chối nạp dữ liệu mẫu khi NODE_ENV=production (đặt SEED_ALLOW_PRODUCTION=1 nếu thật sự muốn).'), { code: 'SEED_BLOCKED' });
  }
  const sqlDir = findSqlDir();
  const client = await connectWithRetry();
  console.log(`> Kết nối ${DB.user}@${DB.host}:${DB.port}/${DB.database}`);

  try {
    console.log('> Áp dụng database/schema.sql (idempotent) ...');
    await client.query(readFileSync(join(sqlDir, 'schema.sql'), 'utf8'));
    console.log('  Xong.');

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

main().catch((err: PgError) => {
  console.error('Nạp dữ liệu thất bại:', err.message || err.code || String(err));
  const hint = hintFor(err);
  if (hint) console.error(`Gợi ý: ${hint}`);
  process.exit(1);
});
