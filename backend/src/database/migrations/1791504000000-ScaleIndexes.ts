import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part 4 — chỉ mục cho tải x10 (50.000+ lịch hẹn, 10.000+ khách). CHỈ THÊM chỉ mục, không đổi dữ liệu.
 *
 *  - ix_appt_start_stylist_status (start_at, stylist_id, status): timeline ngày / báo cáo / đếm tải theo thợ
 *    lọc theo khoảng thời gian rồi theo thợ + trạng thái → quét chỉ mục, không cần đọc bảng.
 *  - ix_appt_active_stylist_range (stylist_id, start_at, end_at) WHERE trạng thái còn giữ chỗ: truy vấn lô tìm khung
 *    giờ trống chỉ đọc lịch còn hiệu lực (bỏ ~80% lịch đã hoàn tất / huỷ).
 *  - ix_appt_start_id (start_at DESC, id DESC): phân trang keyset danh sách lịch hẹn (nextCursor) và ORDER BY mặc định.
 *  - ix_customers_phone_trgm GIN: tìm khách theo một phần SĐT (LIKE '%0901%') — ux_customers_phone (btree, UNIQUE)
 *    chỉ phục vụ tra đúng số.
 *  - ix_customers_updated (updated_at DESC): danh sách khách mặc định sắp theo cập nhật gần nhất.
 *
 * customers(phone) đã có UNIQUE INDEX từ lược đồ gốc nên không tạo trùng.
 */
export class ScaleIndexes1791504000000 implements MigrationInterface {
  name = 'ScaleIndexes1791504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS ix_appt_start_stylist_status ON appointments (start_at, stylist_id, status)');
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_appt_active_stylist_range ON appointments (stylist_id, start_at, end_at)
      WHERE status IN ('pending','confirmed','arrived','in_progress')`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_appt_start_id ON appointments (start_at DESC, id DESC)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_customers_phone_trgm ON customers USING gin (phone gin_trgm_ops)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_customers_updated ON customers (updated_at DESC)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const ix of ['ix_customers_updated', 'ix_customers_phone_trgm', 'ix_appt_start_id',
      'ix_appt_active_stylist_range', 'ix_appt_start_stylist_status']) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${ix}`);
    }
  }
}
