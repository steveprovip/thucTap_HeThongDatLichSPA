import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateLimit } from '../../database/entities/rate-limit.entity';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  blockedUntil: Date | null;
}

/**
 * Bộ đếm tần suất theo cửa sổ cố định (mặc định 1 giờ, mở cửa sổ mới khi cửa sổ cũ hết hạn), lưu trong CSDL để nhiều tiến trình
 * backend cùng dùng chung (chống spam đặt lịch S2-07, tra cứu S2-09, gửi lại
 * liên kết đặt lại mật khẩu S1-04).
 */
@Injectable()
export class RateLimitService {
  constructor(@InjectRepository(RateLimit) private readonly repo: Repository<RateLimit>) {}

  /**
   * Tăng bộ đếm và cho biết có được phép đi tiếp không.
   * @param windowMinutes độ dài cửa sổ đếm
   * @param blockMinutes  nếu > 0, khi vượt ngưỡng sẽ chặn thêm khoảng thời gian này
   */
  async hit(
    scope: string,
    identifier: string,
    limit: number,
    windowMinutes = 60,
    blockMinutes = 0,
  ): Promise<RateLimitResult> {
    // MỘT câu lệnh nguyên tử: đọc-sửa-ghi kiểu cũ để N request song song cùng đọc hit_count cũ
    // (vượt ngưỡng) và request đầu tiên của một IP mới đụng unique index -> lỗi 409 giả.
    const rows: { hit_count: number; blocked_until: Date | null; was_blocked: boolean }[] = await this.repo.query(
      `INSERT INTO rate_limits AS r (scope, identifier, hit_count, window_start, blocked_until, updated_at)
       VALUES ($1, $2, 1, now(), NULL, now())
       ON CONFLICT (scope, identifier) DO UPDATE SET
         -- Hết thời gian khoá (blocked_until đã qua) thì mở cửa sổ đếm MỚI; kiểu cũ giữ nguyên bộ đếm
         -- nên lượt đầu tiên sau khi mở khoá lại vượt ngưỡng và bị khoá tiếp ngay lập tức (QA-20).
         hit_count     = CASE WHEN r.blocked_until > now() THEN r.hit_count
                              WHEN r.blocked_until IS NOT NULL
                                OR r.window_start < now() - make_interval(mins => $3) THEN 1
                              ELSE r.hit_count + 1 END,
         window_start  = CASE WHEN r.blocked_until > now() THEN r.window_start
                              WHEN r.blocked_until IS NOT NULL
                                OR r.window_start < now() - make_interval(mins => $3) THEN now()
                              ELSE r.window_start END,
         blocked_until = CASE WHEN r.blocked_until > now() THEN r.blocked_until ELSE NULL END,
         updated_at    = now()
       RETURNING hit_count, blocked_until, (blocked_until IS NOT NULL AND blocked_until > now()) AS was_blocked`,
      [scope, identifier, windowMinutes],
    );
    const row = rows[0];
    if (row.was_blocked) return { allowed: false, remaining: 0, blockedUntil: row.blocked_until };

    const allowed = row.hit_count <= limit;
    let blockedUntil: Date | null = null;
    if (!allowed && blockMinutes > 0) {
      blockedUntil = new Date(Date.now() + blockMinutes * 60_000);
      await this.repo.update({ scope, identifier }, { blockedUntil });
    }
    return { allowed, remaining: Math.max(0, limit - row.hit_count), blockedUntil };
  }

  /** Trả lại một lượt đã tính (thao tác thất bại không do người dùng, ví dụ thua cuộc tranh khung giờ). */
  async refund(scope: string, identifier: string): Promise<void> {
    await this.repo.query(
      `UPDATE rate_limits SET hit_count = GREATEST(hit_count - 1, 0), updated_at = now()
        WHERE scope = $1 AND identifier = $2 AND (blocked_until IS NULL OR blocked_until <= now())`,
      [scope, identifier],
    );
  }

  /** Xoá bộ đếm khi thao tác thành công (ví dụ tra cứu đúng mã). */
  async reset(scope: string, identifier: string): Promise<void> {
    await this.repo.delete({ scope, identifier });
  }

  /** Thời điểm hết khoá nếu (scope, identifier) ĐANG bị khoá, ngược lại null. Không tăng bộ đếm. */
  async blockedUntil(scope: string, identifier: string): Promise<Date | null> {
    const row = await this.repo.findOne({ where: { scope, identifier } });
    return row?.blockedUntil && row.blockedUntil.getTime() > Date.now() ? row.blockedUntil : null;
  }

  async peek(scope: string, identifier: string): Promise<RateLimit | null> {
    return this.repo.findOne({ where: { scope, identifier } });
  }
}
