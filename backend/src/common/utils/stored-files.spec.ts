import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { mimeOf, mirrorUpload, restoreUploads } from './stored-files';

/** Hosting miễn phí (đĩa tạm): ảnh tải lên có bản sao trong CSDL và tự khôi phục khi đĩa bị xoá. */
describe('Ảnh tải lên bền vững (stored_files)', () => {
  const store = new Map<string, { mime: string; data: Buffer }>();
  const ds = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('INSERT')) { store.set(params[0] as string, { mime: params[1] as string, data: params[3] as Buffer }); return []; }
      const row = store.get(params[0] as string);
      return row ? [row] : [];
    }),
  } as unknown as DataSource;
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'uploads-')); store.clear(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const res = () => {
    const r = { headers: {} as Record<string, string>, code: 0, body: undefined as Buffer | undefined,
      setHeader(k: string, v: string) { r.headers[k] = v; }, status(c: number) { r.code = c; return r; }, end(b?: Buffer) { r.body = b; } };
    return r;
  };

  it('ghi bản sao khi tải lên; đĩa mất ảnh thì trả ảnh từ CSDL và ghi lại ra đĩa', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    writeFileSync(join(dir, 'avatar-1.png'), png);
    await mirrorUpload(ds, join(dir, 'avatar-1.png'));
    rmSync(join(dir, 'avatar-1.png')); // máy chủ ngủ dậy: đĩa tạm trống

    const r = res();
    const next = jest.fn();
    await restoreUploads(ds, dir)({ method: 'GET', path: '/uploads/avatar-1.png' }, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.code).toBe(200);
    expect(r.headers['Content-Type']).toBe('image/png');
    expect(r.body?.equals(png)).toBe(true);
    expect(readFileSync(join(dir, 'avatar-1.png')).equals(png)).toBe(true); // lần sau phục vụ thẳng từ đĩa
  });

  it('không có trong CSDL / đường dẫn lạ / tên tệp nguy hiểm → đi tiếp (404 như cũ)', async () => {
    for (const path of ['/uploads/khong-co.png', '/api/stylists', '/uploads/..%2f.env', '/uploads/a/b.png']) {
      const next = jest.fn();
      await restoreUploads(ds, dir)({ method: 'GET', path }, res(), next);
      expect(next).toHaveBeenCalled();
    }
    const next = jest.fn();
    await restoreUploads(ds, dir)({ method: 'POST', path: '/uploads/a.png' }, res(), next);
    expect(next).toHaveBeenCalled();
  });

  it('chỉ nhận ảnh JPG / PNG', () => {
    expect(mimeOf('a.png')).toBe('image/png');
    expect(mimeOf('a.JPG')).toBe('image/jpeg');
    expect(mimeOf('a.html')).toBeNull();
  });
});
