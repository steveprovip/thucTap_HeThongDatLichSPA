import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vòng tự cải tiến của Trợ lý tư vấn (kiểu "Recommendations" của Intercom Fin / data engine): câu khách gõ mà luật chưa hiểu
 * nhưng mô hình viết lại được (hoặc khách tự diễn đạt lại) thành ĐỀ XUẤT; chủ tiệm duyệt thì trợ lý dùng ngay, không cần mô hình.
 * - kind 'question': cả câu (bỏ dấu) → câu viết lại rõ nghĩa; 'alias': cụm từ ("mat xoa") → cụm chuẩn ("massage");
 *   'answer': câu hỏi ngoài dữ liệu ("cho de xe") → câu trả lời chủ tiệm soạn.
 * CHỈ THÊM bảng mới.
 */
export class AssistantLearning1791763200000 implements MigrationInterface {
  name = 'AssistantLearning1791763200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assistant_learned_phrases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind varchar(10) NOT NULL CHECK (kind IN ('question', 'alias', 'answer')),
        phrase varchar(200) NOT NULL,
        rewrite varchar(1000) NOT NULL,
        intent varchar(40),
        status varchar(10) NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'approved', 'rejected')),
        source varchar(10) NOT NULL CHECK (source IN ('llm', 'rephrase', 'owner')),
        hits int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT assistant_learned_phrase_unique UNIQUE (kind, phrase)
      )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_assistant_learned_status ON assistant_learned_phrases (status, hits DESC)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS assistant_learned_phrases');
  }
}
