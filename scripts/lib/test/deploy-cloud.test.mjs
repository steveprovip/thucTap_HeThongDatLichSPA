import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesUrl, parseEnv, renderEnv, validate } from '../../deploy-cloud.mjs';

const ok = {
  DATABASE_URL: 'postgresql://postgres.abc:mat-khau@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
  API_URL: 'https://salon-spa-api.onrender.com', PAGES_PROJECT: 'huongsen-salon',
  BREVO_API_KEY: 'xkeysib-123', MAIL_FROM_ADDRESS: 'tiem@huongsen.vn', BOOTSTRAP_ADMIN_PASSWORD: 'MatKhau2026',
};

test('Triển khai đám mây: đọc tệp cấu hình (bỏ chú thích, bỏ ngoặc kép)', () => {
  assert.deepEqual(parseEnv('# ghi chú\nA=1\n B = "x y" \n#C=3\nD='), { A: '1', B: 'x y', D: '' });
});

test('Triển khai đám mây: cấu hình đủ → không lỗi; link cố định là <tên>.pages.dev', () => {
  assert.deepEqual(validate(ok), []);
  assert.equal(pagesUrl('huongsen-salon'), 'https://huongsen-salon.pages.dev');
});

test('Triển khai đám mây: báo lỗi tiếng Việt cho từng ô sai', () => {
  const e = validate({ ...ok, DATABASE_URL: 'abc', API_URL: 'https://x.onrender.com/api', PAGES_PROJECT: 'Huong Sen',
    BREVO_API_KEY: 'sai', RENDER_API_KEY: 'rnd_x', BOOTSTRAP_ADMIN_PASSWORD: '123' });
  for (const k of ['DATABASE_URL', 'API_URL', 'PAGES_PROJECT', 'BREVO_API_KEY', 'RENDER_API_KEY', 'BOOTSTRAP_ADMIN_PASSWORD']) {
    assert.ok(e.some((x) => x.startsWith(k)), `thiếu lỗi ${k}`);
  }
  assert.ok(validate({ ...ok, DATABASE_URL: 'postgresql://u:p@db.x.supabase.co:6543/postgres' }).some((x) => /6543/.test(x)));
});

test('Triển khai đám mây: biến cho Render — CORS / FRONTEND_URL trỏ đúng Pages, bỏ ô trống', () => {
  const v = renderEnv({ ...ok, SALON_HOTLINE: '' });
  assert.equal(v.FRONTEND_URL, 'https://huongsen-salon.pages.dev');
  assert.equal(v.CORS_ORIGINS, 'https://huongsen-salon.pages.dev');
  assert.equal(v.BREVO_API_KEY, 'xkeysib-123');
  assert.equal('SALON_HOTLINE' in v, false);
});
