/**
 * Chạy MỘT lần trước toàn bộ test: dựng CSDL kiểm thử mới tinh = migration + seed.sql.
 * (Cùng đường đi migration với máy thật, nên test cũng kiểm chứng luôn migration.)
 */
import { Client } from 'pg';
import { clientOptions, connectWithRetry, hintFor, PgError } from '../../src/database/db-tools';
import { runMigrations } from '../../src/database/migrate';
import { readSeedSql } from '../../src/database/sql-files';
import { applyTestEnv, resolveTestDb } from './test-db';

/** Kết nối vào CSDL bảo trì (postgres, hoặc template1) để tạo/xoá CSDL test. */
export async function openMaintenance(conn: ReturnType<typeof resolveTestDb>): Promise<Client> {
  try {
    return await connectWithRetry(conn, 'postgres');
  } catch (e) {
    if ((e as PgError).code !== '3D000') throw e;
    return connectWithRetry(conn, 'template1');
  }
}

export default async function globalSetup(): Promise<void> {
  process.env.DB_WAIT_SECONDS = process.env.DB_WAIT_SECONDS ?? '20';
  const conn = resolveTestDb();
  applyTestEnv(conn);
  try {
    const admin = await openMaintenance(conn);
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${conn.database}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${conn.database}" ENCODING 'UTF8'`);
    } finally {
      await admin.end();
    }

    await runMigrations(conn, { backup: 'off', log: () => undefined });

    const client = new Client(clientOptions(conn));
    await client.connect();
    try {
      await client.query(readSeedSql());
    } finally {
      await client.end();
    }
  } catch (e) {
    const err = e as PgError;
    const hint = hintFor(conn, err);
    throw new Error(
      `Không dựng được CSDL kiểm thử "${conn.database}" tại ${conn.host}:${conn.port}: ${err.message}` +
        (hint ? `\nGợi ý: ${hint}` : '') +
        '\n(Kiểm thử cần PostgreSQL chạy sẵn: docker compose up -d postgres)',
    );
  }
  console.log(`\n[e2e] CSDL kiểm thử "${conn.database}" tại ${conn.host}:${conn.port} đã tạo mới — CSDL thật không bị chạm tới.`);
}
