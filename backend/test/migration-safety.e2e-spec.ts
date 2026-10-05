import { readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { DbConnection } from '../src/config/db-connection';
import { clientOptions, createDataSource } from '../src/database/db-tools';
import { runMigrations } from '../src/database/migrate';
import { bootstrapProduction } from '../src/database/run-bootstrap';
import { findDefaultPasswordAccounts, lockDefaultPasswordAccounts } from '../src/database/security-check';
import { findSqlDir, readSchemaSql, readSeedSql } from '../src/database/sql-files';
import { openMaintenance } from './support/global-setup';
import { resolveTestDb } from './support/test-db';

/**
 * Nâng cấp CSDL KHÔNG ĐƯỢC mất dữ liệu khách và KHÔNG ĐƯỢC chạy seed.sql.
 * Mỗi nhóm dùng một CSDL tạm riêng (tên *_test) và xoá ngay sau đó.
 */
const base = resolveTestDb();
const connFor = (name: string): DbConnection => ({ ...base, database: name });

async function recreate(name: string): Promise<DbConnection> {
  const admin = await openMaintenance(base);
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8'`);
  } finally {
    await admin.end();
  }
  return connFor(name);
}

async function drop(name: string): Promise<void> {
  const admin = await openMaintenance(base);
  try { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); } finally { await admin.end(); }
}

async function withClient<T>(conn: DbConnection, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(clientOptions(conn));
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Dấu vân tay (số dòng + md5) của mọi bảng nghiệp vụ, trừ bảng migrations. */
async function snapshot(conn: DbConnection): Promise<Record<string, string>> {
  return withClient(conn, async (c) => {
    const tables = (await c.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'migrations' ORDER BY 1`,
    )).rows;
    const out: Record<string, string> = {};
    for (const { tablename } of tables) {
      const r = await c.query(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text,'|' ORDER BY x::text)),'') AS h FROM "${tablename}" x`,
      );
      out[tablename] = `${r.rows[0].n}:${r.rows[0].h}`;
    }
    return out;
  });
}

const executed = (conn: DbConnection) =>
  withClient(conn, async (c) => (await c.query('SELECT name FROM migrations ORDER BY id')).rows.map((r) => r.name));

describe('Migration an toàn cho dữ liệu đang có', () => {
  const NAME = 'salon_mig_test';
  let conn: DbConnection;

  beforeAll(async () => {
    conn = await recreate(NAME);
    // CSDL "đời cũ": lược đồ + dữ liệu nạp trực tiếp bằng SQL, CHƯA có bảng migrations
    await withClient(conn, async (c) => {
      await c.query(readSchemaSql());
      await c.query(readSeedSql());
      await c.query(`INSERT INTO customers (full_name, phone) VALUES ('Khách Thật Sentinel', '0999888777')`);
      await c.query(`UPDATE users SET password_hash = 'MAT_KHAU_THAT_KHONG_DUOC_DAT_LAI' WHERE email = 'admin@salon.vn'`);
    });
  }, 120_000);
  afterAll(async () => { await drop(NAME); });

  it('CSDL cũ đang có dữ liệu: chạy migration không đổi một dòng nào, không chạy seed.sql', async () => {
    const before = await snapshot(conn);
    const report = await runMigrations(conn, { backup: 'off', log: () => undefined });

    expect(report.pending).toEqual(['BaselineSchema1791158400000']);
    expect(report.applied).toEqual(['BaselineSchema1791158400000']);
    expect(await snapshot(conn)).toEqual(before);

    await withClient(conn, async (c) => {
      // seed.sql mà chạy thì mật khẩu admin bị đặt lại về Admin@123
      const admin = await c.query(`SELECT password_hash FROM users WHERE email = 'admin@salon.vn'`);
      expect(admin.rows[0].password_hash).toBe('MAT_KHAU_THAT_KHONG_DUOC_DAT_LAI');
      const sentinel = await c.query(`SELECT 1 FROM customers WHERE phone = '0999888777'`);
      expect(sentinel.rowCount).toBe(1);
    });
  });

  it('chạy lại lần hai: không còn migration nào, dữ liệu vẫn nguyên', async () => {
    const before = await snapshot(conn);
    const report = await runMigrations(conn, { backup: 'off', log: () => undefined });
    expect(report.pending).toEqual([]);
    expect(report.applied).toEqual([]);
    expect(await snapshot(conn)).toEqual(before);
  });

  it('migration thêm cột giữ nguyên dữ liệu; migration hỏng được hoàn tác, migration trước đó vẫn giữ', async () => {
    class AddNoteColumn1791158400001 implements MigrationInterface {
      name = 'AddNoteColumn1791158400001';
      async up(q: QueryRunner): Promise<void> { await q.query('ALTER TABLE customers ADD COLUMN zz_note varchar(50)'); }
      async down(): Promise<void> { /* không dùng */ }
    }
    class BrokenMigration1791158400002 implements MigrationInterface {
      name = 'BrokenMigration1791158400002';
      async up(q: QueryRunner): Promise<void> {
        await q.query('CREATE TABLE zz_should_rollback (id int)');
        await q.query('SELECT khong_ton_tai FROM bang_khong_ton_tai');
      }
      async down(): Promise<void> { /* không dùng */ }
    }
    const baseline = createDataSource(conn).options;
    const ds = new DataSource({
      ...baseline,
      migrations: [AddNoteColumn1791158400001, BrokenMigration1791158400002],
    } as never);
    await ds.initialize();
    const before = await snapshot(conn);
    try {
      await expect(ds.runMigrations({ transaction: 'each' })).rejects.toThrow();
    } finally {
      await ds.destroy();
    }
    await withClient(conn, async (c) => {
      const col = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='zz_note'`);
      expect(col.rowCount).toBe(1); // migration thêm cột đã áp dụng
      const rolledBack = await c.query(`SELECT to_regclass('public.zz_should_rollback') AS t`);
      expect(rolledBack.rows[0].t).toBeNull(); // migration hỏng bị hoàn tác sạch
      const sentinel = await c.query(`SELECT 1 FROM customers WHERE phone = '0999888777'`);
      expect(sentinel.rowCount).toBe(1);
    });
    const after = await snapshot(conn);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(await executed(conn)).toContain('AddNoteColumn1791158400001');
    expect(await executed(conn)).not.toContain('BrokenMigration1791158400002');
  });
});

describe('Tài khoản mẫu còn mật khẩu mặc định (trước khi mở ra Internet)', () => {
  const NAME = 'salon_sec_test';
  let conn: DbConnection;
  beforeAll(async () => {
    conn = await recreate(NAME);
    await runMigrations(conn, { backup: 'off', log: () => undefined });
    await withClient(conn, async (c) => { await c.query(readSeedSql()); });
  }, 120_000);
  afterAll(async () => { await drop(NAME); });

  it('phát hiện đủ 8 tài khoản mẫu; khoá xong thì không đăng nhập được nữa; tài khoản đã đổi mật khẩu thì KHÔNG bị đụng tới', async () => {
    await withClient(conn, async (c) => {
      expect(await findDefaultPasswordAccounts(c)).toHaveLength(8);
      // Chủ tiệm đã đổi mật khẩu thật cho admin
      await c.query(`UPDATE users SET password_hash = $1 WHERE email = 'admin@salon.vn'`, [await bcrypt.hash('MatKhauThat2026', 10)]);

      const found = await findDefaultPasswordAccounts(c);
      expect(found).toHaveLength(7);
      expect(found).not.toContain('admin@salon.vn');

      const locked = await lockDefaultPasswordAccounts(c);
      expect(locked).toHaveLength(7);
      const state = await c.query(`SELECT email, is_active FROM users ORDER BY email`);
      const active = state.rows.filter((r) => r.is_active).map((r) => r.email);
      expect(active).toEqual(['admin@salon.vn']);
      expect(await findDefaultPasswordAccounts(c)).toEqual([]);
    });
  });
});

describe('Bootstrap cho máy thật (không seed)', () => {
  const NAME = 'salon_boot_test';
  let conn: DbConnection;
  beforeAll(async () => { conn = await recreate(NAME); }, 60_000);
  afterAll(async () => { await drop(NAME); });

  it('CSDL trống: migration tạo lược đồ, bootstrap tạo đúng 1 admin + giờ mở cửa, không có dữ liệu mẫu', async () => {
    await runMigrations(conn, { backup: 'off', log: () => undefined });
    const env = { BOOTSTRAP_ADMIN_EMAIL: 'chu@tiem.vn', BOOTSTRAP_ADMIN_PASSWORD: 'MatKhau2026' };
    await withClient(conn, async (c) => {
      const r = await bootstrapProduction(c, env, () => undefined);
      expect(r).toEqual({ adminCreated: true, hoursCreated: true });

      const users = await c.query('SELECT email, role, must_change_password, password_hash FROM users');
      expect(users.rows).toHaveLength(1);
      expect(users.rows[0]).toMatchObject({ email: 'chu@tiem.vn', role: 'admin', must_change_password: true });
      expect(await bcrypt.compare('MatKhau2026', users.rows[0].password_hash)).toBe(true);

      expect((await c.query('SELECT count(*)::int AS n FROM salon_working_hours')).rows[0].n).toBe(7);
      for (const t of ['stylists', 'services', 'customers', 'appointments', 'invoices']) {
        expect((await c.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n).toBe(0);
      }
    });
  });

  it('chạy lại không tạo thêm gì và không ghi đè mật khẩu đã đổi', async () => {
    await withClient(conn, async (c) => {
      await c.query(`UPDATE users SET password_hash = 'DA_DOI_MAT_KHAU' WHERE email = 'chu@tiem.vn'`);
      const env = { BOOTSTRAP_ADMIN_EMAIL: 'khac@tiem.vn', BOOTSTRAP_ADMIN_PASSWORD: 'MatKhau2026' };
      const r = await bootstrapProduction(c, env, () => undefined);
      expect(r).toEqual({ adminCreated: false, hoursCreated: false });
      const users = await c.query('SELECT email, password_hash FROM users');
      expect(users.rows).toEqual([{ email: 'chu@tiem.vn', password_hash: 'DA_DOI_MAT_KHAU' }]);
    });
  });

  it('mật khẩu admin yếu bị từ chối, CSDL không đổi', async () => {
    const empty = await recreate(NAME);
    await runMigrations(empty, { backup: 'off', log: () => undefined });
    await withClient(empty, async (c) => {
      await expect(
        bootstrapProduction(c, { BOOTSTRAP_ADMIN_EMAIL: 'chu@tiem.vn', BOOTSTRAP_ADMIN_PASSWORD: '123' }, () => undefined),
      ).rejects.toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
      expect((await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0);
    });
  });
});

describe('Hợp đồng của thư mục migration', () => {
  it('migration KHÔNG chạy seed.sql và schema.sql không chứa dữ liệu mẫu', () => {
    const dir = join(__dirname, '..', 'src', 'database', 'migrations');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const files: string[] = require('fs').readdirSync(dir).filter((f: string) => f.endsWith('.ts'));
    for (const f of files) {
      // Chỉ cấm GỌI seed (đọc/nhập seed.sql); lời giải thích trong chú thích thì được phép
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/readSeedSql|['"`][^'"`]*seed\.sql['"`]|from '[^']*seed/);
    }
    expect(readFileSync(join(findSqlDir(), 'schema.sql'), 'utf8')).not.toMatch(/INSERT INTO users/i);
  });
});
