import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bản sao ảnh tải lên (ảnh đại diện thợ…) trong PostgreSQL. Gói miễn phí của Render / Koyeb… chỉ có ĐĨA TẠM: mỗi lần máy
 * chủ ngủ dậy hay triển khai lại là thư mục uploads/ mất sạch. Ảnh được ghi song song vào bảng này và tự khôi phục ra đĩa
 * khi có người xem. Ảnh ≤ 2 MB nên vài chục thợ chỉ tốn vài chục MB. CHỈ THÊM bảng mới.
 */
export class StoredFiles1791849600000 implements MigrationInterface {
  name = 'StoredFiles1791849600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stored_files (
        name varchar(200) PRIMARY KEY,
        mime varchar(40) NOT NULL,
        size int NOT NULL CHECK (size > 0 AND size <= 5242880),
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS stored_files');
  }
}
