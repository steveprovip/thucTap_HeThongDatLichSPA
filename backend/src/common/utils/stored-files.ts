import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Ảnh tải lên bền vững trên hosting miễn phí (đĩa tạm): ghi thêm bản sao vào PostgreSQL, và khi tệp trên đĩa đã mất
 * (máy chủ ngủ dậy / triển khai lại) thì lấy lại từ CSDL ở lần xem đầu tiên. Máy chạy tại tiệm vẫn dùng đĩa như cũ;
 * bản sao trong CSDL đi kèm luôn các bản sao lưu pg_dump.
 */
const SAFE_NAME = /^[\w.-]{1,200}$/;
const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export const mimeOf = (name: string): string | null => MIME_BY_EXT[name.slice(name.lastIndexOf('.')).toLowerCase()] ?? null;

/** Lưu bản sao của tệp vừa tải lên (bỏ qua lỗi: bản trên đĩa vẫn dùng được). */
export async function mirrorUpload(ds: DataSource, filePath: string): Promise<void> {
  const name = basename(filePath);
  const mime = mimeOf(name);
  if (!mime || !SAFE_NAME.test(name)) return;
  try {
    const data = await readFile(filePath);
    await ds.query(
      `INSERT INTO stored_files (name, mime, size, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, data = EXCLUDED.data`,
      [name, mime, data.length, data]);
  } catch { /* bảng chưa có (CSDL cũ) — giữ hành vi cũ */ }
}

type Req = { method?: string; path?: string; url?: string };
type Res = { setHeader: (k: string, v: string) => void; status: (c: number) => Res; end: (b?: Buffer) => void };

/**
 * Middleware Express đặt SAU phục vụ tệp tĩnh /uploads: tệp không còn trên đĩa → tìm trong CSDL, ghi lại ra đĩa (lần sau
 * phục vụ thẳng) rồi trả ảnh. Không có trong CSDL → đi tiếp (404 như cũ).
 */
export function restoreUploads(ds: DataSource, uploadDir: string) {
  return async (req: Req, res: Res, next: () => void): Promise<void> => {
    const m = /^\/uploads\/([^/?#]+)$/.exec(req.path ?? req.url ?? '');
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !m || !SAFE_NAME.test(m[1])) return next();
    try {
      const rows: { mime: string; data: Buffer }[] = await ds.query('SELECT mime, data FROM stored_files WHERE name = $1', [m[1]]);
      if (!rows.length) return next();
      const { mime, data } = rows[0];
      await mkdir(uploadDir, { recursive: true }).catch(() => undefined);
      await writeFile(join(uploadDir, m[1]), data).catch(() => undefined);
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).end(req.method === 'HEAD' ? undefined : data);
    } catch {
      next();
    }
  };
}
