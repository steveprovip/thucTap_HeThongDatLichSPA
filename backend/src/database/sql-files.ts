/**
 * Định vị và đọc các tệp SQL ở thư mục `database/` (schema.sql, seed.sql).
 * Dùng chung cho migration gốc, lệnh nạp dữ liệu mẫu và bộ kiểm thử.
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export const findSqlDir = (): string => {
  const candidates = [
    resolve(process.cwd(), '..', 'database'),
    resolve(process.cwd(), 'database'),
    resolve(__dirname, '..', '..', '..', 'database'),
  ];
  for (const c of candidates) if (existsSync(join(c, 'schema.sql'))) return c;
  throw new Error('Không tìm thấy thư mục database chứa schema.sql');
};

export const readSchemaSql = (): string => readFileSync(join(findSqlDir(), 'schema.sql'), 'utf8');
export const readSeedSql = (): string => readFileSync(join(findSqlDir(), 'seed.sql'), 'utf8');
