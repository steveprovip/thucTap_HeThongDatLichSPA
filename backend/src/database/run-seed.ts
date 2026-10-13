/**
 * Nạp dữ liệu MẪU cho máy phát triển / kiểm thử thủ công.
 *   npm run seed   -> áp dụng migration còn thiếu (gồm lược đồ gốc), rồi nạp seed.sql
 *
 * KHÔNG dùng cho máy đang vận hành thật: seed.sql đặt lại mật khẩu 8 tài khoản mẫu (Admin@123…) và sinh
 * lịch hẹn mẫu theo ngày hôm nay. Máy thật dùng `npm run migration:run` + `npm run bootstrap`.
 *
 * Lược đồ do migration quản lý (backend/database/schema.sql chỉ là migration gốc, không còn được chạy trực tiếp),
 * và seed.sql viết theo hướng chạy lại được, không nhân đôi bản ghi (S1-10).
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { describeDb, resolveDbConnection } from '../config/db-connection';
import { connectWithRetry, hintFor, PgError } from './db-tools';
import { runMigrations } from './migrate';
import { cleanupJunk, seedRealistic, seedRealisticCustomers } from './seed-realistic';
import { ageThenLog, scenariosThenLog } from './seed-scenarios';
import { readSeedSql } from './sql-files';

loadEnv();

async function main(): Promise<void> {
  // seed.sql LUÔN đặt lại mật khẩu 8 tài khoản mẫu (Admin@123...). Chạy nhầm vào CSDL thật = mở cửa
  // hậu cho ai đọc README. Chặn ở production trừ khi chủ động cho phép.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw Object.assign(new Error('Từ chối nạp dữ liệu mẫu khi NODE_ENV=production (đặt SEED_ALLOW_PRODUCTION=1 nếu thật sự muốn).'), { code: 'SEED_BLOCKED' });
  }
  const conn = resolveDbConnection();
  console.log(`> Kết nối ${describeDb(conn)}`);

  // Cho phép bỏ qua phần dữ liệu mẫu nhưng vẫn cập nhật cấu trúc (launcher đặt SALON_SEED=never trên máy thật)
  console.log('> Áp dụng migration (cấu trúc CSDL) ...');
  await runMigrations(conn, { backup: 'auto' });

  if (process.env.SALON_SEED?.trim().toLowerCase() === 'never') {
    console.log('> SALON_SEED=never: bỏ qua dữ liệu mẫu, giữ nguyên dữ liệu hiện có.');
    return;
  }

  const client = await connectWithRetry(conn);
  try {
    const realistic = process.env.SALON_SEED_REALISTIC?.trim().toLowerCase() !== 'off';
    if (realistic) {
      // Dọn dữ liệu rác (bộ tải "Tải thử" cũ, bản ghi QA) TRƯỚC seed.sql để seed.sql không sinh ca cho thợ rác
      const removed = await cleanupJunk(client);
      const total = Object.values(removed).reduce((a, b) => a + b, 0);
      if (total) console.log(`> Đã dọn ${total} bản ghi rác: ${Object.entries(removed).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      // Khách thực tế có mặt trước khi seed.sql chọn khách ngẫu nhiên cho lịch mẫu → không dồn hàng trăm lịch vào 15 khách
      const added = await seedRealisticCustomers(client);
      if (added) console.log(`> Đã thêm ${added} khách hàng thực tế.`);
    }
    console.log('> Nạp backend/database/seed.sql ...');
    client.on('notice', (n) => console.log(`  ${n.message}`));
    await client.query(readSeedSql());
    console.log('  Xong.');

    // TASK v4 · NV2: lớp dữ liệu THỰC TẾ (43 dịch vụ có ảnh, 14 chuyên viên, khách & lịch hẹn theo giờ cao điểm) + dọn dữ liệu rác.
    // Chạy lại nhiều lần không nhân đôi; SALON_SEED_REALISTIC=off để chỉ dùng bộ mẫu tối giản của seed.sql.
    if (realistic) {
      console.log('> Nạp dữ liệu thực tế (seed-realistic) ...');
      const t0 = Date.now();
      await ageThenLog(client);
      const r = await seedRealistic(client);
      console.log(`  Xong sau ${((Date.now() - t0) / 1000).toFixed(1)} giây: +${r.customersAdded} khách, +${r.shiftsAdded} ca, `
        + `+${r.appointmentsAdded} lịch hẹn, +${r.invoicesAdded} phiếu, dọn ${Object.values(r.removed).reduce((a, b) => a + b, 0)} bản ghi rác.`);
      // Ghi chú test 13/10: đủ tình huống để test hết 39 user story (kiểm tra: npm run seed:check)
      await scenariosThenLog(client);
    }

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
  const hint = hintFor(resolveDbConnection(), err);
  if (hint) console.error(`Gợi ý: ${hint}`);
  process.exit(1);
});
