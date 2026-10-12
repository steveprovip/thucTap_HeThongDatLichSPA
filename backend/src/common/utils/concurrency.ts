/**
 * Tiện ích chịu tải dùng chung (QA 12/10): bộ nhớ đệm có hạn dùng và gộp lời gọi trùng khoá đang chạy dở.
 * Dùng cho danh mục công khai (AvailabilityService) và Trợ lý AI (AssistantService).
 */
/** Bộ nhớ đệm có hạn dùng + giới hạn số mục (bỏ mục cũ nhất — Map giữ thứ tự chèn). */
export class TtlCache<V> {
  private readonly map = new Map<string, { at: number; value: V }>();

  constructor(private readonly ttlMs: number, private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { at: Date.now(), value });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value as string);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Gộp các lời gọi trùng khoá đang chạy dở thành MỘT lời gọi. */
export class SingleFlight<V> {
  private readonly inflight = new Map<string, Promise<V>>();

  do(key: string, fn: () => Promise<V>): Promise<V> {
    const running = this.inflight.get(key);
    if (running) return running;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
