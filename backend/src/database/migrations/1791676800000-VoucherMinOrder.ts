import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QA 12/10 — "Giá trị đơn tối thiểu" của mã giảm giá: giao diện đã cho nhập nhưng CSDL chưa có cột nên giá trị bị bỏ
 * qua (mã vẫn áp cho mọi đơn). Cột tuỳ chọn: NULL = không yêu cầu, nên mã đang có giữ nguyên hành vi. CHỈ THÊM cột.
 */
export class VoucherMinOrder1791676800000 implements MigrationInterface {
  name = 'VoucherMinOrder1791676800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(12,0)');
    await queryRunner.query('ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS voucher_min_order');
    await queryRunner.query('ALTER TABLE vouchers ADD CONSTRAINT voucher_min_order CHECK (min_order_value IS NULL OR min_order_value >= 0)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS voucher_min_order');
    await queryRunner.query('ALTER TABLE vouchers DROP COLUMN IF EXISTS min_order_value');
  }
}
