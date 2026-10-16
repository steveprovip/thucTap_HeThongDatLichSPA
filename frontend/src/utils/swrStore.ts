/**
 * Bộ nhớ đệm stale-while-revalidate trong RAM (RFC-2026-SPA-V3 · Pillar II.1 — "zero-skeleton"):
 *  - Mở lại một bộ lọc / trang đã xem → hiện NGAY dữ liệu cũ, tải lại ngầm rồi vá vào (không khung chờ, không nhảy cuộn).
 *  - Hai màn hình cùng hỏi một khoá → một request (gộp request đang chạy); tải lại SAU KHI GHI thì ép request mới (`force`).
 *  - Chỉ request MỚI NHẤT của mỗi khoá được ghi đệm: phản hồi cũ (đọc CSDL trước khi ghi) về muộn không đè dữ liệu mới.
 *  - Thao tác lạc quan sửa thẳng các bản đệm liên quan (`update`) để mọi trang đã xem đều đúng ngay.
 *  - Giới hạn số khoá (LRU) để không phình bộ nhớ khi lễ tân lọc nhiều ngày liền.
 *  - Đăng xuất / đổi tài khoản → `clear()`: người sau không thấy dữ liệu (SĐT chưa che…) của người trước.
 */
export interface SwrEntry<T> { data: T; at: number }

export class SwrStore {
  private readonly cache = new Map<string, SwrEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /** Vé của request mới nhất theo khoá — chỉ request giữ vé này được ghi đệm. */
  private readonly latest = new Map<string, number>();
  /** Bộ đếm vé tăng mãi (không đặt lại khi `clear`) để vé của phiên trước không bao giờ trùng vé mới. */
  private ticket = 0;

  constructor(private readonly max = 80) {}

  get<T>(key: string): SwrEntry<T> | undefined {
    const hit = this.cache.get(key) as SwrEntry<T> | undefined;
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); } // LRU: dùng gần đây → về cuối hàng
    return hit;
  }

  set<T>(key: string, data: T, at = Date.now()): void {
    this.cache.delete(key);
    this.cache.set(key, { data, at });
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value as string);
  }

  /**
   * Tải `key`; nếu đã có request cùng khoá đang chạy thì dùng chung kết quả của nó.
   * `force`: luôn gửi request mới (tải lại sau khi ghi / có sự kiện đồng bộ) — request đang chạy có thể đã đọc CSDL
   * TRƯỚC khi ghi, dùng chung nó sẽ đưa trạng thái cũ trở lại màn hình.
   */
  fetch<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running && !force) return running;
    const mine = ++this.ticket;
    this.latest.set(key, mine);
    const p: Promise<T> = fetcher()
      .then((data) => { if (this.latest.get(key) === mine) this.set(key, data); return data; })
      .finally(() => {
        if (this.inflight.get(key) === p) this.inflight.delete(key);
        if (this.latest.get(key) === mine) this.latest.delete(key); // xong rồi thì bỏ vé — request cũ hơn vẫn không khớp vé nào
      });
    this.inflight.set(key, p);
    return p;
  }

  /** Sửa mọi bản đệm có khoá thoả `match` (cập nhật lạc quan). */
  update<T>(match: (key: string) => boolean, fn: (data: T) => T): void {
    for (const [key, entry] of this.cache) {
      if (match(key)) this.cache.set(key, { data: fn(entry.data as T), at: entry.at });
    }
  }

  /** Bỏ các bản đệm theo tiền tố (dữ liệu đã chắc chắn cũ). */
  invalidate(prefix: string): void {
    for (const key of [...this.cache.keys()]) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  /** Xoá sạch đệm (đăng xuất / đổi tài khoản); request của phiên trước về muộn cũng không được ghi lại vào đệm. */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
    this.latest.clear();
  }

  get size(): number { return this.cache.size; }
}

export const swrStore = new SwrStore();
