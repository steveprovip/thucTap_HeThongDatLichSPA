/** Kiểm thử Part 2: kiểm tra môi trường + giữ cấu hình tiệm khi cập nhật (node --test scripts/lib/test/). */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mergeNewEnvKeys, readinessChecks, snapshotEnvFile } from '../env-check.mjs';
import { parseEnv } from '../shop-config.mjs';

const EXAMPLE = [
  '# ===== Ứng dụng =====',
  'SALON_NAME=Salon & Spa Hương Sen',
  '# true = khách đặt online BẮT BUỘC nhập email',
  'BOOKING_REQUIRE_EMAIL=false',
  '# ===== Trợ lý AI =====',
  '#   Ollama cục bộ',
  'AI_PROVIDER=',
  'AI_MODEL=qwen2.5:3b',
  '#SMTP_PASSWORD=',
].join('\n');

test('bản mới thêm biến → chép vào .env dạng GHI CHÚ, không đổi giá trị tiệm đang dùng', () => {
  const shop = 'SALON_NAME=Tiệm Hoa Mai\r\nSMTP_PASSWORD=bimat\r\n#AI_MODEL=llama3\r\n';
  const { text, added } = mergeNewEnvKeys(shop, EXAMPLE);
  assert.deepEqual(added, ['BOOKING_REQUIRE_EMAIL', 'AI_PROVIDER']);
  assert.ok(text.startsWith(shop), 'giữ nguyên toàn bộ nội dung cũ');
  assert.match(text, /#BOOKING_REQUIRE_EMAIL=false/);
  assert.match(text, /# true = khách đặt online BẮT BUỘC nhập email/);
  assert.ok(!/#AI_MODEL=qwen/.test(text), 'khoá đã có (kể cả dạng ghi chú) không chép lại');
  assert.ok(text.includes('\r\n#AI_PROVIDER='), 'giữ kiểu xuống dòng CRLF của tệp Windows');
  const env = parseEnv(text);
  assert.equal(env.SALON_NAME, 'Tiệm Hoa Mai');
  assert.equal(env.BOOKING_REQUIRE_EMAIL, undefined, 'dòng ghi chú không có hiệu lực');
  assert.equal(mergeNewEnvKeys(text, EXAMPLE).added.length, 0, 'chạy lại không thêm lần nữa');
});

test('danh sách kiểm tra trước khi mở bán: chỉ ra đúng mục còn thiếu', () => {
  const fresh = readinessChecks('SALON_NAME=Salon & Spa Hương Sen\nJWT_ACCESS_SECRET=dev_access_secret\nSMTP_HOST=localhost\n', { nodeMajor: 22 });
  const failed = fresh.filter((c) => !c.ok).map((c) => c.id);
  assert.deepEqual(failed, ['jwt', 'name', 'hotline', 'vietqr', 'mail']);
  const ready = readinessChecks([
    'NODE_ENV=production', 'SALON_NAME=Tiệm Hoa Mai', 'SALON_HOTLINE=0909 123 456', 'JWT_ACCESS_SECRET=abcXYZ123', 'JWT_REFRESH_SECRET=defUVW456',
    'BANK_BIN=970436', 'BANK_ACCOUNT_NO=0123456789', 'SMTP_HOST=smtp.gmail.com', 'SMTP_USER=a@gmail.com', 'SMTP_PASSWORD=x',
    'BOOTSTRAP_ADMIN_EMAIL=chu@gmail.com',
  ].join('\n'), { nodeMajor: 20 });
  assert.ok(ready.every((c) => c.ok), JSON.stringify(ready.filter((c) => !c.ok)));
  assert.equal(readinessChecks('', { nodeMajor: 18 }).find((c) => c.id === 'node').ok, false);
});

test('chụp backend/.env trước khi cập nhật, giữ 10 bản mới nhất', () => {
  const root = mkdtempSync(join(tmpdir(), 'envsnap-'));
  try {
    assert.equal(snapshotEnvFile(root), null, 'chưa có .env thì bỏ qua');
    mkdirSync(join(root, 'backend'));
    writeFileSync(join(root, 'backend', '.env'), 'SALON_NAME=Tiệm Hoa Mai\n');
    for (let i = 0; i < 12; i += 1) snapshotEnvFile(root, new Date(2026, 9, 11, 10, 0, i));
    const files = readdirSync(join(root, 'backups', 'env')).sort();
    assert.equal(files.length, 10);
    assert.equal(files[0], 'backend.env.20261011-100002');
    assert.equal(readFileSync(join(root, 'backups', 'env', files[9]), 'utf8'), 'SALON_NAME=Tiệm Hoa Mai\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
