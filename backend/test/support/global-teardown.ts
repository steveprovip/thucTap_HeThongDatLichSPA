/** Chạy MỘT lần sau toàn bộ test: xoá CSDL kiểm thử (đặt TEST_DB_KEEP=1 để giữ lại soi lỗi). */
import { openMaintenance } from './global-setup';
import { resolveTestDb } from './test-db';

export default async function globalTeardown(): Promise<void> {
  const conn = resolveTestDb();
  if (process.env.TEST_DB_KEEP === '1') {
    console.log(`\n[e2e] TEST_DB_KEEP=1: giữ lại CSDL "${conn.database}".`);
    return;
  }
  try {
    const admin = await openMaintenance(conn);
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${conn.database}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
    console.log(`\n[e2e] Đã xoá CSDL kiểm thử "${conn.database}".`);
  } catch (e) {
    console.warn(`\n[e2e] Không xoá được CSDL kiểm thử "${conn.database}": ${(e as Error).message}`);
  }
}
