import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './setup-app';
import { assertSafeTestDbName, resolveTestDb } from './support/test-db';

/**
 * Chứng minh bộ test KHÔNG THỂ chạy trên CSDL thật:
 * (1) ứng dụng trong test đang nối vào CSDL *_test; (2) các chốt chặn từ chối cấu hình nguy hiểm.
 */
describe('Cô lập CSDL kiểm thử', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('ứng dụng trong test nối vào CSDL kết thúc bằng _test', async () => {
    const rows = await app.get(DataSource).query('SELECT current_database() AS name');
    expect(rows[0].name).toMatch(/_test$/);
    expect(rows[0].name).not.toBe('salon_booking');
  });

  it('tên CSDL không kết thúc bằng _test bị từ chối', () => {
    expect(() => assertSafeTestDbName('salon_booking')).toThrow(/_test/);
    expect(() => assertSafeTestDbName('salon_booking_test; DROP DATABASE x')).toThrow();
    expect(() => assertSafeTestDbName('salon_booking_test')).not.toThrow();
  });

  it('TEST_DB_NAME trỏ vào CSDL thật bị từ chối', () => {
    expect(() => resolveTestDb({ TEST_DB_NAME: 'salon_booking' })).toThrow(/_test/);
  });

  it('máy chủ CSDL không phải localhost bị từ chối nếu không cho phép rõ ràng', () => {
    expect(() => resolveTestDb({ TEST_DB_HOST: 'db.example.supabase.co' })).toThrow(/không phải máy cục bộ/);
    expect(resolveTestDb({ TEST_DB_HOST: 'db.example.supabase.co', TEST_DB_ALLOW_REMOTE: '1' }).host).toBe('db.example.supabase.co');
  });

  it('DATABASE_URL (CSDL trên mây) không bao giờ lọt vào cấu hình test', () => {
    const conn = resolveTestDb({ DATABASE_URL: 'postgresql://u:p@real.neon.tech/prod?sslmode=require' });
    expect(conn.host).not.toContain('neon');
    expect(conn.database).toMatch(/_test$/);
  });

  it('createTestApp từ chối khi DB_NAME không phải CSDL kiểm thử', async () => {
    const saved = process.env.DB_NAME;
    process.env.DB_NAME = 'salon_booking';
    try {
      await expect(createTestApp()).rejects.toThrow(/không phải CSDL kiểm thử/);
    } finally {
      process.env.DB_NAME = saved;
    }
  });
});
