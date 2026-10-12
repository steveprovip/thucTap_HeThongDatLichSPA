import http from 'http';

/**
 * Bắn tải song song cho kiểm thử chịu tải (QA 12/10). `n` request được gửi CÙNG LÚC qua một pool kết nối keep-alive
 * (mặc định 200 kết nối — giống Nginx / Vite proxy giữ kết nối tới API): request vượt số kết nối xếp hàng ở pool.
 * Không mở 1000 kết nối TCP mới trong cùng một mili-giây: Windows chỉ nhận ~230 cú connect dồn dập trên loopback dù
 * backlog lớn (đo bằng máy chủ http trần), đó là giới hạn của hệ điều hành chứ không phải của ứng dụng.
 * Mỗi request có thể mang IP giả lập riêng qua X-Forwarded-For (app đặt 'trust proxy' = loopback trong bài kiểm thử).
 */
export interface LoadResult<T> {
  n: number;
  wallMs: number;
  rps: number;
  status: Record<number, number>;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  bodies: T[];
}

function request(agent: http.Agent, url: string, method: string, body: string | undefined, ip?: string): Promise<{ code: number; json: unknown }> {
  return new Promise((resolve) => {
    const req = http.request(url, {
      agent, method,
      headers: {
        'Content-Type': 'application/json', ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let json: unknown = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* không phải JSON */ }
        resolve({ code: res.statusCode ?? 0, json });
      });
    });
    req.on('error', () => resolve({ code: -1, json: null })); // lỗi mạng / từ chối kết nối
    req.end(body);
  });
}

export async function fire<T = unknown>(
  n: number,
  make: (i: number) => { url: string; method?: string; body?: unknown; ip?: string },
  connections = 200,
): Promise<LoadResult<T>> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections });
  const lat: number[] = [];
  const status: Record<number, number> = {};
  const bodies: T[] = [];
  const t0 = performance.now();
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    const r = make(i);
    const s = performance.now();
    const body = r.body ? JSON.stringify(r.body) : undefined;
    const res = await request(agent, r.url, r.method ?? (body ? 'POST' : 'GET'), body, r.ip);
    lat.push(performance.now() - s);
    status[res.code] = (status[res.code] ?? 0) + 1;
    bodies[i] = res.json as T;
  }));
  const wallMs = performance.now() - t0;
  agent.destroy();
  lat.sort((a, b) => a - b);
  const q = (p: number) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]);
  return { n, wallMs: Math.round(wallMs), rps: Math.round((n / wallMs) * 1000), status, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(lat[lat.length - 1]), bodies };
}

export const ipOf = (i: number): string => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

export const summary = (label: string, r: LoadResult<unknown>): string =>
  `[load] ${label}: ${r.n} req trong ${r.wallMs} ms (${r.rps} req/s) · p50 ${r.p50} ms · p95 ${r.p95} ms · p99 ${r.p99} ms · max ${r.max} ms · mã ${JSON.stringify(r.status)}`;
