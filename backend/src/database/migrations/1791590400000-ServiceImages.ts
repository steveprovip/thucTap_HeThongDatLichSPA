import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TASK v4 · NV2 — ảnh riêng cho TỪNG dịch vụ (trước đây giao diện đoán ảnh theo từ khoá trong tên).
 * Cột tuỳ chọn: NULL = giao diện tự chọn ảnh theo chủ đề như cũ, nên dữ liệu đang có không cần sửa. CHỈ THÊM cột.
 */
export class ServiceImages1791590400000 implements MigrationInterface {
  name = 'ServiceImages1791590400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE services DROP COLUMN IF EXISTS image_url');
  }
}
