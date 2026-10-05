/**
 * Công cụ dùng chung cho các lệnh ngoài ứng dụng (migration, nạp dữ liệu, bootstrap, kiểm thử):
 * dựng DataSource, chờ CSDL sẵn sàng, gợi ý cách sửa lỗi kết nối.
 * Ứng dụng NestJS KHÔNG dùng tệp này (nó có TypeOrmModule riêng, xem config/database.config.ts).
 */
import 'reflect-metadata';
import { join } from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { DbConnection, describeDb } from '../config/db-connection';
import { ALL_ENTITIES } from './entities';

/** Đường dẫn glob tới các migration: .ts khi chạy ts-node, .js khi chạy từ thư mục dist. */
export const MIGRATIONS_GLOB = join(__dirname, 'migrations', '*.{ts,js}');

export const clientOptions = (conn: DbConnection, database = conn.database) => ({
  host: conn.host,
  port: conn.port,
  user: conn.username,
  password: conn.password,
  database,
  ssl: conn.ssl,
  ...(conn.startupTimezone ? { options: '-c timezone=Asia/Ho_Chi_Minh' } : {}),
});

export function createDataSource(conn: DbConnection): DataSource {
  return new DataSource({
    type: 'postgres',
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    database: conn.database,
    ssl: conn.ssl,
    entities: ALL_ENTITIES,
    migrations: [MIGRATIONS_GLOB],
    migrationsTableName: 'migrations',
    // Mỗi migration một giao dịch riêng: migration hỏng được hoàn tác sạch, migration trước đó vẫn giữ nguyên
    migrationsTransactionMode: 'each',
    synchronize: false,
    logging: ['error'],
    extra: {
      max: 2,
      connectionTimeoutMillis: 30_000,
      ...(conn.startupTimezone ? { options: '-c timezone=Asia/Ho_Chi_Minh' } : {}),
    },
  });
}

/** Mã lỗi cho thấy máy chủ CSDL CHƯA sẵn sàng (đáng để thử lại), khác với sai cấu hình. */
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  '57P03', // cannot_connect_now: "the database system is starting up / shutting down"
  '53300', // too_many_connections
]);

export type PgError = Error & { code?: string };

export const isTransient = (err: PgError): boolean =>
  (err.code !== undefined && TRANSIENT_CODES.has(err.code)) ||
  /terminat|starting up|shutting down|Connection terminated/i.test(err.message);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Kết nối được thử lại tối đa DB_WAIT_SECONDS giây (mặc định 120): lần đầu dựng volume, container
 * PostgreSQL chạy init script rồi KHỞI ĐỘNG LẠI; CSDL miễn phí trên mây thì cần vài giây để thức dậy.
 */
export async function connectWithRetry(conn: DbConnection, database = conn.database): Promise<Client> {
  const waitSeconds = Number(process.env.DB_WAIT_SECONDS ?? 120);
  const deadline = Date.now() + waitSeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const client = new Client({ ...clientOptions(conn, database), connectionTimeoutMillis: 10_000 });
    // Lỗi bất ngờ của một kết nối rảnh không được làm sập tiến trình
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.query('SELECT 1');
      return client;
    } catch (e) {
      const err = e as PgError;
      await client.end().catch(() => undefined);
      if (!isTransient(err) || Date.now() >= deadline) throw err;
      if (attempt === 1) {
        console.log(`> Chờ PostgreSQL tại ${conn.host}:${conn.port} sẵn sàng (tối đa ${waitSeconds} giây) ...`);
      }
      await sleep(2000);
    }
  }
}

/** Gợi ý khắc phục theo mã lỗi PostgreSQL / Node để người dùng tự sửa được. */
export const hintFor = (conn: DbConnection, err: PgError): string | null => {
  switch (err.code) {
    case '28P01':
    case '28000':
      return (
        `Sai tài khoản/mật khẩu CSDL (${describeDb(conn)}). Nguyên nhân hay gặp: máy đã cài sẵn PostgreSQL chiếm cổng ${conn.port}, ` +
        'nên kết nối đi vào PostgreSQL của máy chứ không phải container. Cách sửa: đặt POSTGRES_PORT=5433 trong .env ' +
        'và DB_PORT=5433 trong backend/.env rồi chạy lại.'
      );
    case '3D000':
      return `CSDL "${conn.database}" chưa tồn tại. Nếu dùng Docker: npm run db:reset. Nếu dùng PostgreSQL riêng: tạo CSDL rồi chạy lại.`;
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `Không có PostgreSQL nào lắng nghe ở ${conn.host}:${conn.port}. Hãy bật Docker Desktop rồi chạy lại launcher (hoặc: docker compose up -d).`;
    default:
      if (/SSL|TLS|certificate/i.test(err.message)) {
        return 'Lỗi mã hoá đường truyền. CSDL trên mây cần DB_SSL=true (hoặc DB_SSL=require nếu chứng chỉ không xác minh được); CSDL tại máy cần DB_SSL=false.';
      }
      return null;
  }
};
