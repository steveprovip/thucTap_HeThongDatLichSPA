import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mentor Sprint 2 · mục 6 — Thợ TỰ ĐĂNG KÝ ca làm / ngày nghỉ, quản lý DUYỆT rồi mới thành ca thật.
 * Chỉ THÊM bảng + giá trị enum, không đụng dữ liệu cũ; viết để chạy lại nhiều lần vẫn an toàn.
 */
export class ShiftRequests1791331200000 implements MigrationInterface {
  name = 'ShiftRequests1791331200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shift_requests (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stylist_id    UUID NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
        kind          VARCHAR(16) NOT NULL,
        work_date     DATE NOT NULL,
        start_time    TIME,
        end_time      TIME,
        break_start   TIME,
        break_end     TIME,
        note          VARCHAR(255),
        status        VARCHAR(16) NOT NULL DEFAULT 'pending',
        review_note   VARCHAR(255),
        reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at   TIMESTAMPTZ,
        result_id     UUID,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT shift_requests_kind_chk CHECK (kind IN ('shift', 'time_off')),
        CONSTRAINT shift_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT shift_requests_shift_times_chk CHECK (
          kind <> 'shift' OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
        ),
        CONSTRAINT shift_requests_off_times_chk CHECK (
          kind <> 'time_off' OR (start_time IS NULL AND end_time IS NULL)
            OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
        )
      )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_shift_requests_status_date ON shift_requests (status, work_date)');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS ix_shift_requests_stylist_date ON shift_requests (stylist_id, work_date)');
    await queryRunner.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shift_request_new'`);
    await queryRunner.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shift_request_reviewed'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Giá trị enum của PostgreSQL không xoá được an toàn; chỉ gỡ bảng (yêu cầu đăng ký là dữ liệu phụ trợ).
    await queryRunner.query('DROP TABLE IF EXISTS shift_requests');
  }
}
