/**
 * Sinh migration từ khác biệt giữa entity (mã nguồn) và CSDL — bản AN TOÀN của `typeorm migration:generate`.
 *
 *   npm run migration:generate -- ThemCotGhiChuKhach
 *
 * Vì sao không dùng thẳng lệnh gốc? Lược đồ của dự án do schema.sql viết tay (ràng buộc EXCLUDE chống trùng giờ thợ,
 * CHECK, trigger, chỉ mục GIN…) và entity không khai báo hết. Lệnh gốc thấy "khác biệt" nên sinh ~320 lệnh
 * DROP/CREATE INDEX và ADD/DROP CONSTRAINT — chạy nó là phá chỉ mục và ràng buộc đang bảo vệ dữ liệu.
 * Bản này dùng chính bộ so sánh của TypeORM nhưng LOẠI các lệnh về chỉ mục / ràng buộc / khoá ngoại và ghi rõ số
 * lệnh đã loại. Phần còn lại (thêm/sửa/xoá bảng, cột, kiểu enum) giữ nguyên để bạn kiểm tra.
 *
 * Cần thêm chỉ mục / ràng buộc mới -> viết tay: npm run migration:create -- src/database/migrations/TenThayDoi
 * Lệnh gốc (nguy hiểm, chỉ để đối chiếu): npm run migration:generate:raw -- src/database/migrations/Ten
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, createDataSource } from './db-tools';

/** Lệnh thuộc nhóm mà schema.sql quản lý bằng tay -> không sinh tự động. */
export const isHandManaged = (sql: string): boolean => /\b(CONSTRAINT|INDEX)\b/i.test(sql);

export const toPascal = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

export function renderMigration(className: string, ts: number, up: string[], down: string[], skipped: number): string {
  const lines = (qs: string[]) => qs.map((q) => `    await queryRunner.query(\`${esc(q)}\`);`).join('\n');
  return `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sinh tự động bằng \`npm run migration:generate\`. ĐỌC KỸ trước khi chạy.
 * Đã loại ${skipped} lệnh về chỉ mục / ràng buộc / khoá ngoại (do schema.sql quản lý bằng tay).
 */
export class ${className}${ts} implements MigrationInterface {
  name = '${className}${ts}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${lines(up)}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
${lines(down)}
  }
}
`;
}

async function main(): Promise<void> {
  loadEnv();
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const base = arg ? toPascal(arg.split(/[\\/]/).pop()!.replace(/\.ts$/, '')) : '';
  if (!base) {
    throw new Error('Thiếu tên migration. Ví dụ: npm run migration:generate -- ThemCotGhiChuKhach');
  }
  const conn = resolveDbConnection();
  await (await connectWithRetry(conn)).end();
  const ds = createDataSource(conn);
  await ds.initialize();
  try {
    const sql = await ds.driver.createSchemaBuilder().log();
    const keep: number[] = [];
    sql.upQueries.forEach((q, i) => { if (!isHandManaged(q.query)) keep.push(i); });
    const skipped = sql.upQueries.length - keep.length;
    if (keep.length === 0) {
      console.log(`Entity và CSDL khớp nhau (đã bỏ qua ${skipped} lệnh chỉ mục/ràng buộc do SQL viết tay quản lý). Không có gì để sinh.`);
      return;
    }
    const up = keep.map((i) => sql.upQueries[i].query);
    const down = keep.map((i) => sql.downQueries[i].query).reverse();
    const ts = Date.now();
    const dir = join(__dirname, 'migrations');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${ts}-${base}.ts`);
    writeFileSync(file, renderMigration(base, ts, up, down, skipped), 'utf8');
    console.log(`Đã sinh ${file}`);
    console.log(`  ${up.length} lệnh được giữ, ${skipped} lệnh chỉ mục/ràng buộc bị loại.`);
    console.log('  Đọc kỹ tệp vừa sinh, kiểm tra các lệnh DROP, rồi chạy: npm run migration:run');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((e: Error) => {
    console.error(`Sinh migration thất bại: ${e.message}`);
    process.exit(1);
  });
}
