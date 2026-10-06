import { MigrationInterface, QueryRunner } from 'typeorm';
import { readSchemaSql } from '../sql-files';

/**
 * MIGRATION GỐC — đưa CSDL về đúng lược đồ của `backend/database/schema.sql`.
 *
 * Vì sao chạy lại schema.sql thay vì viết lại từng lệnh CREATE TABLE?
 *  - schema.sql chứa những thứ TypeORM không tự sinh được (ràng buộc EXCLUDE chống trùng giờ thợ,
 *    CHECK, trigger, chỉ mục GIN tìm không dấu) và đã được viết để chạy lại nhiều lần vẫn an toàn
 *    (CREATE ... IF NOT EXISTS, DO $$ ... EXCEPTION ...).
 *  - Nhờ vậy cùng một migration dùng được cho CẢ BA tình huống:
 *      1. CSDL trống (máy mới, Supabase/Neon mới)        -> tạo toàn bộ lược đồ;
 *      2. CSDL Docker cũ đã nạp schema.sql từ trước       -> không đổi gì, chỉ ghi nhận "đã chạy";
 *      3. CSDL đang có dữ liệu khách thật                 -> KHÔNG xoá, KHÔNG ghi đè dòng nào.
 *
 * QUY ƯỚC TỪ NAY: schema.sql ĐÓNG BĂNG ở mốc này. Mọi thay đổi cấu trúc mới (thêm cột, thêm bảng,
 * thêm chỉ mục…) viết thành MỘT migration MỚI trong thư mục này. Tuyệt đối không sửa schema.sql
 * và không đưa seed.sql vào migration — seed.sql là dữ liệu mẫu, chỉ dành cho máy phát triển.
 */
export class BaselineSchema1791158400000 implements MigrationInterface {
  name = 'BaselineSchema1791158400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(readSchemaSql());
  }

  public async down(): Promise<void> {
    // Hoàn tác mốc gốc = xoá toàn bộ bảng cùng dữ liệu khách. Không bao giờ được làm âm thầm.
    throw new Error(
      'Không hỗ trợ hoàn tác migration gốc vì sẽ xoá toàn bộ dữ liệu. ' +
        'Muốn quay về bản cũ hãy khôi phục từ tệp sao lưu trong thư mục backups/.',
    );
  }
}
