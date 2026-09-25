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
 * Bộ đếm tần suất theo cửa sổ trượt 1 giờ, lưu trong CSDL để nhiều tiến trình
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
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60_000);

    let row = await this.repo.findOne({ where: { scope, identifier } });
    if (!row) {
      row = this.repo.create({ scope, identifier, hitCount: 0, windowStart: now, blockedUntil: null });
    }

    if (row.blockedUntil && row.blockedUntil > now) {
      return { allowed: false, remaining: 0, blockedUntil: row.blockedUntil };
    }

    if (row.windowStart < windowStart) {
      row.hitCount = 0;
      row.windowStart = now;
      row.blockedUntil = null;
    }

    row.hitCount += 1;
    const allowed = row.hitCount <= limit;
    if (!allowed && blockMinutes > 0) {
      row.blockedUntil = new Date(now.getTime() + blockMinutes * 60_000);
    }
    await this.repo.save(row);

    return {
      allowed,
      remaining: Math.max(0, limit - row.hitCount),
      blockedUntil: row.blockedUntil,
    };
  }

  /** Xoá bộ đếm khi thao tác thành công (ví dụ tra cứu đúng mã). */
  async reset(scope: string, identifier: string): Promise<void> {
    await this.repo.delete({ scope, identifier });
  }

  async peek(scope: string, identifier: string): Promise<RateLimit | null> {
    return this.repo.findOne({ where: { scope, identifier } });
  }
}
