/**
 * Sao lưu CSDL NGAY BÂY GIỜ, không cần có migration chờ chạy:
 *   npm run db:backup            (từ thư mục gốc dự án)
 *   npm run backup               (từ thư mục backend)
 *
 * Tệp nén (-Fc) lưu ở backups/ (đổi bằng BACKUP_DIR), giữ 15 bản mới nhất. Khôi phục bằng pg_restore (docs/TRIEN-KHAI.md mục 4.5).
 */
import { config as loadEnv } from 'dotenv';
import { statSync } from 'fs';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { backupDatabase, KEEP_BACKUPS } from './backup';

loadEnv();

function main(): number {
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);
  // --label=truoc_cap_nhat: Launcher gắn nhãn bản sao lưu tự động trước khi cập nhật phiên bản
  const label = process.argv.find((a) => a.startsWith('--label='))?.slice('--label='.length).replace(/[^\w-]+/g, '_') || 'thu_cong';
  const result = backupDatabase(conn, '', label);
  if (!result) {
    console.error('[LỖI] Không tìm thấy pg_dump trên máy và cũng không dùng được Docker (container salon_postgres).');
    console.error('      Bật Docker Desktop rồi chạy lại, hoặc cài công cụ PostgreSQL client (có pg_dump).');
    return 1;
  }
  const mb = (statSync(result.file).size / 1024 / 1024).toFixed(2);
  console.log(`> Đã sao lưu (${result.method}, ${mb} MB): ${result.file}`);
  console.log(`  Giữ lại ${KEEP_BACKUPS} bản mới nhất. Hãy chép thư mục backups/ sang USB hoặc ổ đám mây.`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`[LỖI] ${(err as Error).message}`);
  process.exit(1);
}
