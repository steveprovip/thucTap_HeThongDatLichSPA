/**
 * Định vị và đọc các tệp SQL ở thư mục `backend/database/` (schema.sql, seed.sql).
 * Dùng chung cho migration gốc, lệnh nạp dữ liệu mẫu và bộ kiểm thử.
 *
 * Từ v1.4.0 thư mục SQL nằm TRONG backend (backend tự chứa đủ để build/deploy với rootDir=backend).
 * Vẫn dò vị trí cũ `<gốc dự án>/database/` để bản sao chưa cập nhật cấu trúc thư mục không bị gãy.
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export const findSqlDir = (): string => {
  const candidates = [
    resolve(__dirname, '..', '..', 'database'), // src/database | dist/database -> backend/database
    resolve(process.cwd(), 'database'), // cwd = backend
    resolve(process.cwd(), 'backend', 'database'), // cwd = gốc dự án
    resolve(process.cwd(), '..', 'database'), // bố cục cũ
    resolve(__dirname, '..', '..', '..', 'database'), // bố cục cũ
  ];
  for (const c of candidates) if (existsSync(join(c, 'schema.sql'))) return c;
  throw new Error('Không tìm thấy thư mục database chứa schema.sql');
};

export const readSchemaSql = (): string => readFileSync(join(findSqlDir(), 'schema.sql'), 'utf8');
export const readSeedSql = (): string => readFileSync(join(findSqlDir(), 'seed.sql'), 'utf8');
export const readScaleSeedSql = (): string => readFileSync(join(findSqlDir(), 'seed-scale.sql'), 'utf8');

/**
 * Thư mục gốc của dự án (chứa backend/ và frontend/). Dùng cho những thứ thuộc về CẢ dự án như backups/,
 * không phụ thuộc thư mục SQL nằm ở đâu.
 */
export const findProjectRoot = (): string => {
  const candidates = [
    resolve(__dirname, '..', '..', '..'), // backend/src/database | backend/dist/database -> gốc
    resolve(process.cwd(), '..'),
    process.cwd(),
  ];
  for (const c of candidates) if (existsSync(join(c, 'backend')) && existsSync(join(c, 'frontend'))) return c;
  return resolve(findSqlDir(), '..', '..');
};
