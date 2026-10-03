import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './setup-app';

/**
 * QA-20: /public/cancel dùng chung hạn mức "đoán mã" với /public/lookup. Trước đây endpoint huỷ không giới hạn,
 * là cửa sau để dò mã tra cứu vô hạn (404 = sai mã, 400/200 = mã đúng) mà không bao giờ bị khoá.
 * Hạ hạn mức xuống 3 lần/giờ cho nhanh (sản phẩm dùng 10 lần/giờ, khoá 30 phút).
 */
describe('QA-20 — chặn dò mã qua /public/cancel', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let validCode: string;
  const previous = process.env.LOOKUP_IP_LIMIT_PER_HOUR;

  const cancel = (code: string) => request(server).post('/api/public/cancel').send({ code });
  const lookup = (code: string) => request(server).post('/api/public/lookup').send({ code });

  beforeAll(async () => {
    process.env.LOOKUP_IP_LIMIT_PER_HOUR = '3';
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'lookup_ip'`);
    [{ code: validCode }] = await ds.query(
      `SELECT code FROM appointments WHERE status = 'completed' ORDER BY created_at LIMIT 1`,
    );
  }, 60000);

  afterAll(async () => {
    await ds?.query(`DELETE FROM rate_limits WHERE scope = 'lookup_ip'`);
    if (previous === undefined) delete process.env.LOOKUP_IP_LIMIT_PER_HOUR;
    else process.env.LOOKUP_IP_LIMIT_PER_HOUR = previous;
    await app?.close();
  });

  it('đoán sai mã huỷ quá hạn mức -> 429 LOOKUP_LOCKED kèm Retry-After; mã đúng cũng bị chặn khi đang khoá', async () => {
    expect((await cancel('ZZZZZZZ1')).status).toBe(404);
    expect((await cancel('ZZZZZZZ2')).status).toBe(404);
    expect((await cancel('ZZZZZZZ3')).status).toBe(404);
    const blocked = await cancel('ZZZZZZZ4');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('LOOKUP_LOCKED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Đang khoá: mã đúng cũng không được xử lý (trả 429 thay vì 400 "không thể huỷ")
    expect((await cancel(validCode)).status).toBe(429);
  });

  it('hạn mức dùng chung với /public/lookup: khoá ở một endpoint thì endpoint kia cũng bị khoá', async () => {
    const res = await lookup(validCode);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('LOOKUP_LOCKED');
  });

  it('hết thời gian khoá thì huỷ lại bình thường; mã đúng không bị đếm', async () => {
    await ds.query(`UPDATE rate_limits SET blocked_until = now() - interval '1 second' WHERE scope = 'lookup_ip'`);
    // Lịch đã hoàn tất -> 400 "không thể huỷ" (mã đúng, không phải 404/429) và KHÔNG tăng bộ đếm
    expect((await cancel(validCode)).status).toBe(400);
    expect((await cancel(validCode)).status).toBe(400);
    expect((await cancel(validCode)).status).toBe(400);
    expect((await cancel(validCode)).status).toBe(400);
  });
});
