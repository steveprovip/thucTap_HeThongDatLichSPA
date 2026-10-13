import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EventsService } from '../src/modules/events/events.service';
import { ACCOUNTS, createTestApp } from './setup-app';

interface SseMessage { event: string; data: Record<string, unknown> }
interface SseClient {
  status: number;
  headers: http.IncomingHttpHeaders;
  messages: SseMessage[];
  comments: number;
  close: () => void;
  waitFor: (pred: (m: SseMessage) => boolean, ms?: number) => Promise<SseMessage>;
}

/** Máy khách SSE tối giản dùng cho test (trình duyệt thật dùng fetch streaming, xem frontend/src/utils/realtime.ts). */
function openSse(port: number, token?: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/events/stream', headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => {
        const client: SseClient = {
          status: res.statusCode ?? 0,
          headers: res.headers,
          messages: [],
          comments: 0,
          close: () => req.destroy(),
          waitFor: (pred, ms = 3000) =>
            new Promise((ok, fail) => {
              const started = Date.now();
              const tick = () => {
                const found = client.messages.find(pred);
                if (found) return ok(found);
                if (Date.now() - started > ms) return fail(new Error('Hết thời gian chờ sự kiện SSE'));
                setTimeout(tick, 25);
              };
              tick();
            }),
        };
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (block.startsWith(':')) { client.comments += 1; continue; }
            let event = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (data) client.messages.push({ event, data: JSON.parse(data) });
          }
        });
        res.on('error', () => undefined);
        resolve(client);
      },
    );
    req.on('error', (e) => { if ((e as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(e); });
    req.end();
  });
}

const login = async (app: INestApplication, acc: { email: string; password: string }) =>
  (await request(app.getHttpServer()).post('/api/auth/login').send(acc).expect(200)).body.data as {
    accessToken: string; refreshToken: string;
  };

describe('Đồng bộ trực tiếp giữa các thiết bị (SSE)', () => {
  let app: INestApplication;
  let port: number;
  let admin: string;
  let owner: string;
  const open: SseClient[] = [];

  beforeAll(async () => {
    process.env.SSE_HEARTBEAT_MS = '150';
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
    admin = (await login(app, ACCOUNTS.admin)).accessToken;
    owner = (await login(app, ACCOUNTS.owner)).accessToken;
  }, 60_000);
  afterEach(() => { while (open.length) open.pop()!.close(); });
  afterAll(async () => { delete process.env.SSE_HEARTBEAT_MS; await app?.close(); });

  const connect = async (token?: string) => { const c = await openSse(port, token); open.push(c); return c; };
  const createCategory = (name: string) =>
    request(app.getHttpServer()).post('/api/service-categories').set('Authorization', `Bearer ${owner}`).send({ name });

  it('không có token thì không nối được luồng (401)', async () => {
    const c = await connect();
    expect(c.status).toBe(401);
  });

  it('nhân viên nối được: header SSE đúng và nhận lời chào kèm mã khởi động', async () => {
    const c = await connect(admin);
    expect(c.status).toBe(200);
    expect(c.headers['content-type']).toContain('text/event-stream');
    expect(c.headers['cache-control']).toContain('no-transform');
    expect(c.headers['x-accel-buffering']).toBe('no');
    const hello = await c.waitFor((m) => m.event === 'hello');
    expect(hello.data.bootId).toBe(app.get(EventsService).bootId);
  });

  it('thiết bị A ghi dữ liệu -> thiết bị B (đang mở luồng) nhận sự kiện NGAY, không chứa dữ liệu cá nhân', async () => {
    const deviceB = await connect(admin);
    await deviceB.waitFor((m) => m.event === 'hello');
    const t0 = Date.now();
    await createCategory('Nhóm thử đồng bộ').expect(201);
    const change = await deviceB.waitFor((m) => m.event === 'change');
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(change.data.scope).toBe('service-categories');
    // Chỉ có số thứ tự, nhóm dữ liệu và thời điểm — không tên khách, không số điện thoại, không nội dung ghi
    expect(Object.keys(change.data).sort()).toEqual(['at', 'scope', 'seq']);
    expect(JSON.stringify(change.data)).not.toContain('Nhóm thử đồng bộ');
  });

  it('thao tác ghi bị từ chối (400) hoặc chỉ đọc (GET) thì KHÔNG phát sự kiện', async () => {
    const c = await connect(admin);
    await c.waitFor((m) => m.event === 'hello');
    await createCategory('').expect(400);
    await request(app.getHttpServer()).get('/api/service-categories').set('Authorization', `Bearer ${owner}`).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send(ACCOUNTS.owner).expect(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(c.messages.filter((m) => m.event === 'change')).toHaveLength(0);
  });

  it('gửi nhịp tim định kỳ để kết nối không bị proxy coi là rảnh', async () => {
    const c = await connect(admin);
    await c.waitFor((m) => m.event === 'hello');
    await new Promise((r) => setTimeout(r, 500));
    expect(c.comments).toBeGreaterThanOrEqual(2);
  });

  it('/events/version tăng sau mỗi lần ghi (chế độ hỏi định kỳ khi luồng bị chặn)', async () => {
    const get = async () => (await request(app.getHttpServer()).get('/api/events/version').set('Authorization', `Bearer ${admin}`).expect(200)).body.data;
    const before = await get();
    await createCategory('Nhóm thử phiên bản').expect(201);
    const after = await get();
    expect(after.bootId).toBe(before.bootId);
    expect(after.seq).toBe(before.seq + 1);
    expect(after.version).not.toBe(before.version);
  });

  it('đóng kết nối thì máy chủ dọn đăng ký (không rò rỉ)', async () => {
    const events = app.get(EventsService);
    const base = events.clientCount;
    const c = await connect(admin);
    await c.waitFor((m) => m.event === 'hello');
    expect(events.clientCount).toBe(base + 1);
    c.close();
    for (let i = 0; i < 40 && events.clientCount !== base; i++) await new Promise((r) => setTimeout(r, 25));
    expect(events.clientCount).toBe(base);
  });
});

describe('Phiên đăng nhập sống sót qua khởi động lại API (cập nhật 1-click)', () => {
  it('token cấp trước khi restart vẫn dùng được và làm mới được sau khi API khởi động lại', async () => {
    const app1 = await createTestApp();
    const tokens = await login(app1, ACCOUNTS.receptionist);
    await app1.close(); // "tắt" API như lúc scripts\windows\update_project.bat dừng dịch vụ

    const app2 = await createTestApp(); // "bật" lại với cùng khoá JWT trong .env và cùng CSDL
    try {
      const me = await request(app2.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(ACCOUNTS.receptionist.email);
      const refreshed = await request(app2.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.data.accessToken).toBeTruthy();
    } finally {
      await app2.close();
    }
  }, 60_000);
});

describe('NestJS phục vụ giao diện đã build (SERVE_FRONTEND) — một địa chỉ cho cả web và API', () => {
  let dist: string;
  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'salon-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>SALON-SPA-INDEX</title>');
    writeFileSync(join(dist, 'version.json'), '{"id":"abc"}');
    writeFileSync(join(dist, 'assets', 'app-1a2b3c.js'), 'console.log(1)');
  });

  /**
   * Dựng ứng dụng bằng NestFactory.create (đúng như main.ts), KHÔNG dùng Test.createTestingModule:
   * ServeStaticModule chọn bộ nạp theo HTTP adapter ngay lúc khởi tạo provider, mà ở Test.createTestingModule
   * adapter chưa có nên nó rơi vào NoopLoader và không phục vụ tệp nào.
   */
  const withEnv = async (env: Record<string, string | undefined>, fn: (app: INestApplication) => Promise<void>) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] });
    await app.init();
    try { await fn(app); } finally {
      await app.close();
      for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  };

  it('bật SERVE_FRONTEND: trang chủ và đường dẫn React Router trả index.html; API và /uploads không bị nuốt', async () => {
    await withEnv({ SERVE_FRONTEND: 'true', FRONTEND_DIST: dist }, async (app) => {
      const srv = app.getHttpServer();
      const root = await request(srv).get('/');
      expect(root.status).toBe(200);
      expect(root.text).toContain('SALON-SPA-INDEX');
      expect(root.headers['cache-control']).toBe('no-cache');

      const spa = await request(srv).get('/quan-ly/khach-hang');
      expect(spa.status).toBe(200);
      expect(spa.text).toContain('SALON-SPA-INDEX');

      const asset = await request(srv).get('/assets/app-1a2b3c.js');
      expect(asset.status).toBe(200);
      expect(asset.headers['cache-control']).toContain('immutable');

      const version = await request(srv).get('/version.json');
      expect(version.status).toBe(200);
      expect(version.headers['cache-control']).toBe('no-cache');

      expect((await request(srv).get('/health')).body.data.status).toBe('ok');
      const api404 = await request(srv).get('/api/khong-co-endpoint-nay');
      expect(api404.status).toBe(404);
      expect(api404.text).not.toContain('SALON-SPA-INDEX');
      const up404 = await request(srv).get('/uploads/khong-co.png');
      expect(up404.status).toBe(404);
      expect(up404.text).not.toContain('SALON-SPA-INDEX');
    });
  }, 60_000);

  it('mặc định (không bật): chỉ phục vụ API, không có trang giao diện', async () => {
    await withEnv({ SERVE_FRONTEND: undefined, FRONTEND_DIST: dist }, async (app) => {
      expect((await request(app.getHttpServer()).get('/')).status).toBe(404);
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    });
  }, 60_000);

  it('bật nhưng chưa build giao diện: không sập, vẫn chạy API', async () => {
    await withEnv({ SERVE_FRONTEND: 'true', FRONTEND_DIST: join(dist, 'khong-ton-tai') }, async (app) => {
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
      expect((await request(app.getHttpServer()).get('/')).status).toBe(404);
    });
  }, 60_000);
});
