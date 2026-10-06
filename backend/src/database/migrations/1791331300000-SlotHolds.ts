import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mentor Sprint 2 · mục 11 — TẠM GIỮ CHỖ khung giờ trong lúc khách điền thông tin đặt lịch (10–15 phút),
 * tránh trường hợp khách chưa kịp xác nhận / thanh toán thì người khác đặt mất.
 * Bản ghi hết hạn tự vô hiệu (expires_at) và được dọn định kỳ; chỉ THÊM bảng mới.
 */
export class SlotHolds1791331300000 implements MigrationInterface {
  name = 'SlotHolds1791331300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS slot_holds (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token       VARCHAR(64) NOT NULL UNIQUE,
        stylist_id  UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
        start_at    TIMESTAMPTZ NOT NULL,
        end_at      TIMESTAMPTZ NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_ip  VARCHAR(64),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT slot_holds_range_chk CHECK (end_at > start_at)
      )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_slot_holds_stylist_expiry ON slot_holds (stylist_id, expires_at)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_slot_holds_expiry ON slot_holds (expires_at)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS slot_holds');
  }
}
