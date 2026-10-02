import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './setup-app';

/**
 * QA-20: chỉ lượt tra SAI bị đếm; tra đúng không "xoá nợ"; hết khoá thì mở cửa sổ đếm mới.
 * Hạ hạn mức xuống 3 lần/giờ cho nhanh (sản phẩm dùng 10 lần/giờ, khoá 30 phút).
 */
describe('QA-20 — chặn dò mã tra cứu', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  let validCode: string;
  const previous = process.env.LOOKUP_IP_LIMIT_PER_HOUR;

  const lookup = (code: string) => request(server).post('/api/public/lookup').send({ code });

  beforeAll(async () => {
    process.env.LOOKUP_IP_LIMIT_PER_HOUR = '3';
    app = await createTestApp();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    await ds.query(`DELETE FROM rate_limits WHERE scope = 'lookup_ip'`);
    [{ code: validCode }] = await ds.query('SELECT code FROM appointments ORDER BY created_at LIMIT 1');
  }, 60000);

  afterAll(async () => {
    await ds?.query(`DELETE FROM rate_limits WHERE scope = 'lookup_ip'`);
    process.env.LOOKUP_IP_LIMIT_PER_HOUR = previous;
    await app?.close();
  });

  it('xen mã đúng giữa các lần đoán sai KHÔNG đặt lại hạn mức (lỗ hổng cũ)', async () => {
    expect((await lookup('ZZZZZZZ1')).status).toBe(404);
    expect((await lookup('ZZZZZZZ2')).status).toBe(404);
    expect((await lookup(validCode)).status).toBe(200); // tra đúng không bị đếm…
    expect((await lookup('ZZZZZZZ3')).status).toBe(404); // …và cũng không xoá 2 lần sai trước đó
    const blocked = await lookup('ZZZZZZZ4');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('LOOKUP_LOCKED');
    expect(blocked.headers['retry-after']).toBeDefined();
    // Đang khoá: cả mã đúng cũng bị chặn
    expect((await lookup(validCode)).status).toBe(429);
  });

  it('hết thời gian khoá thì mở cửa sổ đếm mới, không bị khoá lại ngay', async () => {
    await ds.query(`UPDATE rate_limits SET blocked_until = now() - interval '1 second' WHERE scope = 'lookup_ip'`);
    expect((await lookup('ZZZZZZZ5')).status).toBe(404);
    expect((await lookup(validCode)).status).toBe(200);
  });
});
