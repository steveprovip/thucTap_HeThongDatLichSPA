/**
 * Chịu tải cho Trợ lý AI (QA 12/10 — "1000 người hỏi cùng lúc"). Máy chủ AI local chỉ phục vụ 1–2 câu một lúc
 * (llama-server -np 1); để 1000 câu cùng chờ thì mỗi khách đợi tới AI_TIMEOUT_MS rồi mới nhận câu trả lời theo luật.
 *   - LlmGate: tối đa `maxConcurrent` câu đang gọi mô hình + `maxQueue` câu chờ tối đa `maxWaitMs`; vượt nữa → trả null
 *     NGAY để tầng trên trả lời bằng số liệu thật (vài mili giây) thay vì treo.
 *   - TtlCache: câu hỏi mở đầu giống nhau ("Xem bảng giá", "Dịch vụ hot") dùng lại câu trả lời trong vài phút.
 *   - SingleFlight: nhiều request CÙNG khoá đang chạy dùng chung một lời gọi (một lần gọi mô hình / một lần đọc CSDL).
 */
export class LlmGate {
  private active = 0;
  private readonly waiters: { resolve: (ok: boolean) => void; timer: NodeJS.Timeout }[] = [];

  constructor(private readonly maxConcurrent: number, private readonly maxQueue: number, private readonly maxWaitMs: number) {}

  get stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.waiters.length };
  }

  /** Chạy `fn` khi có chỗ; hết chỗ chờ / chờ quá lâu → null (không gọi `fn`). */
  async run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (!(await this.acquire())) return null;
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<boolean> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(true);
    }
    if (this.waiters.length >= this.maxQueue) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const w = {
        resolve,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          resolve(false);
        }, this.maxWaitMs),
      };
      this.waiters.push(w);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(true); // chuyển thẳng chỗ cho người chờ, `active` giữ nguyên
    } else {
      this.active -= 1;
    }
  }
}

export { SingleFlight, TtlCache } from '../../common/utils/concurrency';
