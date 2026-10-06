import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chốt chặn TẦNG CSDL cho dữ liệu tài chính lịch sử (S4-01, bất biến "không xoá cứng lịch sử tài chính"):
 *  - Phiếu đã ĐÓNG chỉ được chuyển sang "đã điều chỉnh" (khi lập phiếu điều chỉnh), không sửa số tiền / dòng dịch vụ,
 *    không xoá. Phiếu "đã điều chỉnh" bất biến hoàn toàn.
 *  - Dòng dịch vụ của phiếu đã đóng / đã điều chỉnh không sửa, không xoá được.
 *  - TRUNCATE nhật ký hoạt động và phiếu tính tiền bị chặn (trigger theo dòng không bắt được TRUNCATE).
 * Tầng ứng dụng đã kiểm tra, nhưng chỉ CSDL mới chặn được mọi đường ghi (script, công cụ quản trị, lỗi đua dữ liệu).
 * Chỉ THÊM hàm + trigger; down() gỡ bỏ sạch.
 */
export class ProtectFinancialHistory1791417600000 implements MigrationInterface {
  name = 'ProtectFinancialHistory1791417600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION invoices_protect_closed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          IF OLD.status IN ('closed', 'adjusted') THEN
            RAISE EXCEPTION 'Phiếu % đã đóng, không được xoá (lập phiếu điều chỉnh nếu cần sửa)', OLD.code
              USING ERRCODE = 'integrity_constraint_violation';
          END IF;
          RETURN OLD;
        END IF;
        IF OLD.status = 'adjusted'
           OR (OLD.status = 'closed' AND NOT (
                NEW.status IN ('closed', 'adjusted')
                AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at'))) THEN
          RAISE EXCEPTION 'Phiếu % đã đóng, không được sửa (lập phiếu điều chỉnh có ghi lý do)', OLD.code
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_invoices_protect_closed ON invoices');
    await queryRunner.query(`CREATE TRIGGER trg_invoices_protect_closed BEFORE UPDATE OR DELETE ON invoices
      FOR EACH ROW EXECUTE FUNCTION invoices_protect_closed()`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION invoice_items_protect_closed() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE st invoice_status;
      BEGIN
        SELECT status INTO st FROM invoices WHERE id = OLD.invoice_id;
        IF st IN ('closed', 'adjusted') THEN
          RAISE EXCEPTION 'Dòng dịch vụ thuộc phiếu đã đóng, không được sửa hoặc xoá'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END $$`);
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_invoice_items_protect_closed ON invoice_items');
    await queryRunner.query(`CREATE TRIGGER trg_invoice_items_protect_closed BEFORE UPDATE OR DELETE ON invoice_items
      FOR EACH ROW EXECUTE FUNCTION invoice_items_protect_closed()`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION forbid_truncate_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Không được TRUNCATE bảng % (dữ liệu lịch sử / tài chính)', TG_TABLE_NAME
          USING ERRCODE = 'integrity_constraint_violation';
      END $$`);
    for (const table of ['audit_logs', 'invoices', 'invoice_items']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${table}_no_truncate ON ${table}`);
      await queryRunner.query(`CREATE TRIGGER trg_${table}_no_truncate BEFORE TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_truncate_history()`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['audit_logs', 'invoices', 'invoice_items']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${table}_no_truncate ON ${table}`);
    }
    await queryRunner.query('DROP FUNCTION IF EXISTS forbid_truncate_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_invoice_items_protect_closed ON invoice_items');
    await queryRunner.query('DROP FUNCTION IF EXISTS invoice_items_protect_closed()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_invoices_protect_closed ON invoices');
    await queryRunner.query('DROP FUNCTION IF EXISTS invoices_protect_closed()');
  }
}
