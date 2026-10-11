/**
 * Nạp dữ liệu TẢI x10 (Part 4) để đo hiệu năng: 100 dịch vụ · 50 thợ · 10.000 khách · ~54.000 lịch hẹn.
 *   npm run seed:scale              -> áp dụng migration còn thiếu rồi nạp (đã có thì bỏ qua)
 *   npm run seed:scale -- --reset   -> xoá RIÊNG dữ liệu tải (đánh dấu [scale-seed]) rồi nạp lại
 *
 * Chỉ cho máy phát triển: bị chặn khi NODE_ENV=production (trừ SEED_ALLOW_PRODUCTION=1). Không động tới
 * dữ liệu khác — mọi bản ghi tải đều mang dấu nhận diện riêng (xem đầu database/seed-scale.sql).
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, hintFor, PgError } from './db-tools';
import { runMigrations } from './migrate';
import { readScaleSeedSql } from './sql-files';

loadEnv();

const RESET_SQL = `
  DELETE FROM appointments
   WHERE code LIKE 'Z%' AND stylist_id IN (SELECT id FROM stylists WHERE full_name LIKE 'Tải thử Thợ %');
  DELETE FROM customers c
   WHERE c.note = '[scale-seed]' AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id = c.id);
  DELETE FROM stylists s
   WHERE s.full_name LIKE 'Tải thử Thợ %' AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.stylist_id = s.id);
  DELETE FROM services v
   WHERE v.name LIKE 'Tải thử DV %' AND NOT EXISTS (SELECT 1 FROM appointment_services x WHERE x.service_id = v.id);
  DELETE FROM service_categories c
   WHERE c.name = '[scale-seed] Gói tải thử' AND NOT EXISTS (SELECT 1 FROM services v WHERE v.category_id = c.id);
`;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw Object.assign(new Error('Từ chối nạp dữ liệu tải khi NODE_ENV=production.'), { code: 'SEED_BLOCKED' });
  }
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);
  await runMigrations(conn, { backup: 'auto' });

  const client = await connectWithRetry(conn);
  try {
    client.on('notice', (n) => console.log(`  ${n.message}`));
    if (process.argv.includes('--reset')) {
      console.log('> Xoá dữ liệu tải cũ ...');
      await client.query(`BEGIN; ${RESET_SQL} COMMIT;`);
    }
    const t0 = Date.now();
    console.log('> Nạp backend/database/seed-scale.sql ...');
    await client.query(readScaleSeedSql());
    console.log(`  Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} giây.`);
    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM services)     AS services,
              (SELECT COUNT(*) FROM stylists)     AS stylists,
              (SELECT COUNT(*) FROM customers)    AS customers,
              (SELECT COUNT(*) FROM stylist_shifts) AS shifts,
              (SELECT COUNT(*) FROM appointments) AS appointments`,
    );
    console.log('> Tổng trong CSDL:', rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err: PgError) => {
  console.error('Nạp dữ liệu tải thất bại:', err.message || err.code || String(err));
  const hint = hintFor(resolveDbConnection(), err);
  if (hint) console.error(`Gợi ý: ${hint}`);
  process.exit(1);
});
