/**
 * Áp dụng migration (thay đổi CẤU TRÚC CSDL) một cách an toàn cho dữ liệu khách.
 *
 *   npm run migration:run                  chạy các migration còn thiếu (có sao lưu tự động trước khi chạy)
 *   npm run migration:status               liệt kê migration đã chạy / còn chờ
 *   npm run migration:run -- --skip-backup bỏ sao lưu (chỉ dùng khi chắc chắn)
 *   npm run migration:run -- --backup=required   bắt buộc sao lưu được mới chạy (update_project.bat dùng chế độ này)
 *   npm run migration:run:prod             bản chạy từ thư mục dist (máy chủ production, không cần ts-node)
 *
 * NGUYÊN TẮC BẤT DI BẤT DỊCH: tệp này chỉ chạy migration (DDL). Nó KHÔNG BAO GIỜ chạy database/seed.sql,
 * KHÔNG xoá bảng, KHÔNG ghi đè dữ liệu đang có. seed.sql chỉ do `npm run seed` (máy phát triển) gọi.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { describeDb, resolveDbConnection, DbConnection } from '../config/db-connection';
import { backupDatabase, BackupResult } from './backup';
import { connectWithRetry, createDataSource, hintFor, PgError } from './db-tools';

export type BackupMode = 'auto' | 'required' | 'off';

export interface MigrationReport {
  executedBefore: string[];
  pending: string[];
  applied: string[];
  backupFile: string | null;
}

type Logger = (msg: string) => void;

/** Các bảng cho thấy CSDL đã có dữ liệu thật của tiệm. Có ít nhất một dòng ở đây = cần sao lưu. */
const DATA_TABLES = ['users', 'customers', 'appointments', 'invoices'];

async function hasUserData(ds: DataSource): Promise<boolean> {
  for (const t of DATA_TABLES) {
    const exists = await ds.query('SELECT to_regclass($1) AS t', [`public.${t}`]);
    if (!exists[0].t) continue;
    const rows = await ds.query(`SELECT 1 FROM "${t}" LIMIT 1`);
    if (rows.length) return true;
  }
  return false;
}

interface Inspection {
  all: string[];
  executed: string[];
  pending: string[];
}

/** Đối chiếu migration trong mã nguồn với bảng `migrations` (trống nếu CSDL mới tinh). */
async function inspect(ds: DataSource): Promise<Inspection> {
  const all = ds.migrations.map((m) => m.name ?? m.constructor.name).sort();
  const exists = await ds.query(`SELECT to_regclass('public.migrations') AS t`);
  const executed: string[] = exists[0].t
    ? (await ds.query('SELECT name FROM migrations ORDER BY id')).map((r: { name: string }) => r.name)
    : [];
  return { all, executed, pending: all.filter((n) => !executed.includes(n)) };
}

/** Chờ CSDL sẵn sàng (có thể đang khởi động / đang thức dậy) rồi mở DataSource. */
async function open(conn: DbConnection): Promise<DataSource> {
  await (await connectWithRetry(conn)).end();
  const ds = createDataSource(conn);
  await ds.initialize();
  return ds;
}

export async function listMigrations(conn: DbConnection): Promise<Inspection> {
  const ds = await open(conn);
  try {
    return await inspect(ds);
  } finally {
    await ds.destroy();
  }
}

export async function runMigrations(
  conn: DbConnection,
  opts: { backup?: BackupMode; log?: Logger } = {},
): Promise<MigrationReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const mode = opts.backup ?? 'auto';
  const ds = await open(conn);
  try {
    const { executed, pending } = await inspect(ds);
    const report: MigrationReport = { executedBefore: executed, pending, applied: [], backupFile: null };

    if (pending.length === 0) {
      log('> Cấu trúc CSDL đã mới nhất, không có migration nào cần chạy.');
      return report;
    }
    log(`> ${pending.length} migration chờ chạy: ${pending.join(', ')}`);

    if (mode !== 'off' && (await hasUserData(ds))) {
      log('> CSDL đang có dữ liệu — sao lưu trước khi thay đổi cấu trúc ...');
      let result: BackupResult | null = null;
      try {
        result = backupDatabase(conn, pending[0]);
      } catch (e) {
        if (mode === 'required') throw new Error(`${(e as Error).message}. Dừng lại, CHƯA thay đổi gì trong CSDL.`);
        log(`  [CẢNH BÁO] ${(e as Error).message}`);
      }
      if (result) {
        report.backupFile = result.file;
        log(`  Đã sao lưu (${result.method}): ${result.file}`);
      } else if (mode === 'required') {
        throw new Error(
          'Không sao lưu được: máy chưa có pg_dump và không tìm thấy container Docker salon_postgres. ' +
            'Dừng lại, CHƯA thay đổi gì trong CSDL. Bật Docker Desktop rồi chạy lại, hoặc dùng --backup=auto để bỏ qua bước này.',
        );
      } else {
        log('  [CẢNH BÁO] Không có công cụ sao lưu (pg_dump / Docker) — vẫn tiếp tục vì migration chỉ thêm/sửa cấu trúc.');
      }
    }

    try {
      const done = await ds.runMigrations({ transaction: 'each' });
      report.applied = done.map((m) => m.name);
      for (const name of report.applied) log(`  ✓ ${name}`);
    } catch (e) {
      if (report.backupFile) (e as Error).message += `\n  Bản sao lưu trước khi chạy: ${report.backupFile}`;
      throw e;
    }
    return report;
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const command = args.find((a) => !a.startsWith('-')) ?? 'run';
  const conn = resolveDbConnection();

  const flag = args.find((a) => a.startsWith('--backup='))?.split('=')[1];
  let backup: BackupMode = (process.env.MIGRATION_BACKUP as BackupMode | undefined) ?? 'auto';
  if (args.includes('--skip-backup')) backup = 'off';
  if (flag === 'auto' || flag === 'required' || flag === 'off') backup = flag;
  if (!['auto', 'required', 'off'].includes(backup)) backup = 'auto';

  console.log(`> Kết nối ${describeDb(conn)}`);
  if (command === 'status') {
    const { all, executed, pending } = await listMigrations(conn);
    console.log(`Tổng ${all.length} migration; đã chạy ${executed.length}; còn chờ ${pending.length}.`);
    for (const n of all) console.log(`  [${executed.includes(n) ? 'x' : ' '}] ${n}`);
    return;
  }
  if (command !== 'run') throw new Error(`Lệnh không hợp lệ "${command}". Dùng: run | status`);
  await runMigrations(conn, { backup });
}

if (require.main === module) {
  main().catch((err: PgError) => {
    const conn = resolveDbConnection();
    console.error(`Chạy migration thất bại: ${err.message || err.code || String(err)}`);
    const hint = hintFor(conn, err);
    if (hint) console.error(`Gợi ý: ${hint}`);
    console.error('Dữ liệu cũ được giữ nguyên (mỗi migration chạy trong một giao dịch, lỗi là hoàn tác).');
    process.exit(1);
  });
}
