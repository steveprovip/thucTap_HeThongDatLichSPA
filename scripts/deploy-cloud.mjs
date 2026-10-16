#!/usr/bin/env node
// Triển khai lên ĐÁM MÂY MIỄN PHÍ, link cố định chạy 24/7 (xem docs/TRIEN-KHAI.md mục 3):
//   giao diện  : Cloudflare Pages  → https://<tên>.pages.dev   (CDN toàn cầu, HTTPS, không ngủ)
//   API        : Render Free       → https://<tên>.onrender.com (giữ thức bằng Cloudflare Worker gọi /health/live mỗi 10 phút)
//   CSDL       : Supabase Free (khuyên dùng: không giới hạn giờ máy) hoặc Neon Free
//   email      : Brevo Free (API HTTPS, 300 thư/ngày — Render Free chặn cổng SMTP)
// Việc DUY NHẤT phải làm tay: tạo tài khoản / đăng nhập (đăng nhập bằng GitHub là nhanh nhất) và điền deploy/cloud.env.
//
//   npm run deploy:cloud                 chạy tất cả: check → render → pages → keepalive → verify
//   npm run deploy:cloud -- check        chỉ kiểm tra cấu hình + kết nối CSDL
//   npm run deploy:cloud -- pages        chỉ build & đẩy giao diện   (render | keepalive | verify tương tự)
//   npm run deploy:cloud -- --dry-run    in các bước sẽ làm, không đổi gì
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, 'deploy', 'cloud.env');
const WRANGLER = 'wrangler@4.142.0';
const IS_WIN = process.platform === 'win32';

// ------------------------------------------------------------------------------------------- hàm thuần (có test)
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export const pagesUrl = (project) => `https://${project}.pages.dev`;

/** Lỗi cấu hình (tiếng Việt, kèm chỗ lấy giá trị). Mảng rỗng = đủ để triển khai. */
export function validate(cfg) {
  const errors = [];
  if (!/^postgres(ql)?:\/\/[^\s]+@[^\s]+\/[^\s]+$/.test(cfg.DATABASE_URL ?? '')) {
    errors.push('DATABASE_URL: dán chuỗi kết nối của Supabase (Connect → Session pooler) hoặc Neon (Connection string, không có "-pooler").');
  }
  if (/:6543\//.test(cfg.DATABASE_URL ?? '')) errors.push('DATABASE_URL: cổng 6543 (Transaction pooler) không hợp — dùng Session pooler cổng 5432.');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(cfg.API_URL ?? '')) {
    errors.push('API_URL: địa chỉ dịch vụ Render (vd. https://salon-spa-api.onrender.com), KHÔNG có /api ở cuối.');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/.test(cfg.PAGES_PROJECT ?? '')) {
    errors.push('PAGES_PROJECT: tên dự án Cloudflare Pages, chữ thường / số / gạch ngang (vd. huongsen-salon).');
  }
  if (cfg.BREVO_API_KEY && !/^xkeysib-/.test(cfg.BREVO_API_KEY)) errors.push('BREVO_API_KEY: key của Brevo bắt đầu bằng "xkeysib-".');
  if (cfg.BREVO_API_KEY && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.MAIL_FROM_ADDRESS ?? '')) {
    errors.push('MAIL_FROM_ADDRESS: email người gửi đã xác minh trong Brevo (Senders).');
  }
  if ((cfg.RENDER_API_KEY && !cfg.RENDER_SERVICE_ID) || (!cfg.RENDER_API_KEY && cfg.RENDER_SERVICE_ID)) {
    errors.push('RENDER_API_KEY và RENDER_SERVICE_ID phải điền cùng nhau (hoặc bỏ trống cả hai để tự điền trên Render).');
  }
  if (cfg.BOOTSTRAP_ADMIN_PASSWORD && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(cfg.BOOTSTRAP_ADMIN_PASSWORD)) {
    errors.push('BOOTSTRAP_ADMIN_PASSWORD: tối thiểu 8 ký tự, có chữ và số.');
  }
  return errors;
}

/** Biến môi trường cần có trên Render (giá trị trống thì bỏ qua). */
export function renderEnv(cfg) {
  const front = pagesUrl(cfg.PAGES_PROJECT);
  const vars = {
    DATABASE_URL: cfg.DATABASE_URL, FRONTEND_URL: front, CORS_ORIGINS: front,
    BREVO_API_KEY: cfg.BREVO_API_KEY, MAIL_FROM_ADDRESS: cfg.MAIL_FROM_ADDRESS, MAIL_FROM_NAME: cfg.MAIL_FROM_NAME,
    BOOTSTRAP_ADMIN_EMAIL: cfg.BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: cfg.BOOTSTRAP_ADMIN_PASSWORD,
    SALON_NAME: cfg.SALON_NAME, SALON_HOTLINE: cfg.SALON_HOTLINE, SALON_ADDRESS: cfg.SALON_ADDRESS,
  };
  return Object.fromEntries(Object.entries(vars).filter(([, v]) => v));
}

// ------------------------------------------------------------------------------------------- chạy lệnh
const log = (m) => console.log(m);
const run = (cmd, args, opts = {}) => {
  log(`  $ ${cmd} ${args.map((a) => (/^(postgres|xkeysib|rnd_)/.test(a) ? '***' : a)).join(' ')}`);
  if (DRY) return { status: 0, stdout: '' };
  return spawnSync(cmd, args, { cwd: ROOT, stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', shell: IS_WIN, env: { ...process.env, ...opts.env } });
};
const npx = (args, opts) => run(IS_WIN ? 'npx.cmd' : 'npx', ['--yes', WRANGLER, ...args], opts);
const DRY = process.argv.includes('--dry-run');

async function stepCheck(cfg) {
  log('\n[1] Kiểm tra cấu hình + kết nối CSDL');
  const errors = validate(cfg);
  if (errors.length) { errors.forEach((e) => log(`  ✗ ${e}`)); throw new Error(`Sửa ${errors.length} mục trong deploy/cloud.env rồi chạy lại.`); }
  if (DRY) { log('  (dry-run) bỏ qua thử kết nối'); return; }
  const { Client } = createRequire(join(ROOT, 'backend', 'package.json'))('pg');
  const client = new Client({ connectionString: cfg.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 });
  await client.connect();
  const v = (await client.query('SHOW server_version')).rows[0].server_version;
  const tables = Number((await client.query(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].n);
  await client.end();
  log(`  ✓ PostgreSQL ${v} — ${tables ? `đã có ${tables} bảng` : 'CSDL trống: Render sẽ tạo cấu trúc + tài khoản quản trị ở lần chạy đầu'}`);
}

async function stepRender(cfg) {
  log('\n[2] Biến môi trường trên Render');
  const vars = renderEnv(cfg);
  if (!cfg.RENDER_API_KEY) {
    log('  Chưa có RENDER_API_KEY → điền tay trên Render (dịch vụ salon-spa-api → Environment), rồi bấm Manual Deploy:');
    for (const k of Object.keys(vars)) log(`    ${k} = ${/PASSWORD|KEY|DATABASE_URL/.test(k) ? '(giá trị trong deploy/cloud.env)' : vars[k]}`);
    return;
  }
  for (const [key, value] of Object.entries(vars)) {
    log(`  • ${key}`);
    if (DRY) continue;
    const res = await fetch(`https://api.render.com/v1/services/${cfg.RENDER_SERVICE_ID}/env-vars/${key}`, {
      method: 'PUT', headers: { authorization: `Bearer ${cfg.RENDER_API_KEY}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(`Render từ chối đặt ${key} (HTTP ${res.status}): ${(await res.text()).slice(0, 160)}`);
  }
  if (!DRY) {
    const dep = await fetch(`https://api.render.com/v1/services/${cfg.RENDER_SERVICE_ID}/deploys`, {
      method: 'POST', headers: { authorization: `Bearer ${cfg.RENDER_API_KEY}`, 'content-type': 'application/json' }, body: '{}' });
    log(dep.ok ? '  ✓ Đã đặt biến và yêu cầu Render triển khai lại (3–6 phút).' : `  ! Đặt biến xong nhưng chưa kích hoạt được deploy (HTTP ${dep.status}) — bấm Manual Deploy trên Render.`);
  }
}

function ensureWranglerLogin(cfg = {}) {
  if (cfg.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN) {
    if (cfg.CLOUDFLARE_API_TOKEN) process.env.CLOUDFLARE_API_TOKEN = cfg.CLOUDFLARE_API_TOKEN;
    if (cfg.CLOUDFLARE_ACCOUNT_ID) process.env.CLOUDFLARE_ACCOUNT_ID = cfg.CLOUDFLARE_ACCOUNT_ID;
    return;
  }
  const who = npx(['whoami'], { capture: true });
  if (DRY || /You are logged in|associated with the email/i.test(`${who.stdout}${who.stderr}`)) return;
  log('  Chưa đăng nhập Cloudflare → mở trình duyệt để BẠN đăng nhập (chỉ lần đầu trên máy này) ...');
  const r = npx(['login']);
  if (r.status !== 0) throw new Error('Đăng nhập Cloudflare chưa xong.');
}

async function stepPages(cfg) {
  log(`\n[3] Giao diện → Cloudflare Pages (${pagesUrl(cfg.PAGES_PROJECT)})`);
  const build = run(IS_WIN ? 'npm.cmd' : 'npm', ['run', 'build', '--prefix', 'frontend'],
    { env: { VITE_API_BASE_URL: `${cfg.API_URL}/api`, VITE_DEMO_MODE: 'false' } });
  if (build.status !== 0) throw new Error('Build giao diện lỗi.');
  ensureWranglerLogin(cfg);
  npx(['pages', 'project', 'create', cfg.PAGES_PROJECT, '--production-branch', 'main'], { capture: true }); // đã có thì bỏ qua
  const dep = npx(['pages', 'deploy', join('frontend', 'dist'), '--project-name', cfg.PAGES_PROJECT, '--branch', 'main', '--commit-dirty=true']);
  if (dep.status !== 0) throw new Error('Đẩy giao diện lên Cloudflare Pages lỗi.');
}

async function stepKeepalive(cfg) {
  log('\n[4] Worker giữ API thức (gọi /health/live mỗi 10 phút)');
  ensureWranglerLogin(cfg);
  const r = npx(['deploy', '--config', join('deploy', 'cloudflare', 'keepalive', 'wrangler.toml'), '--var', `API_HEALTH_URL:${cfg.API_URL}/health/live`]);
  if (r.status !== 0) throw new Error('Triển khai Worker giữ thức lỗi.');
}

async function stepVerify(cfg) {
  log('\n[5] Kiểm tra từ Internet');
  if (DRY) return;
  const probe = async (url, ms = 120_000) => {
    const t = Date.now();
    try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return `${r.status} (${Date.now() - t} ms)`; } catch (e) { return `lỗi: ${e.message}`; }
  };
  log(`  API sống      ${cfg.API_URL}/health/live → ${await probe(`${cfg.API_URL}/health/live`)}`);
  log(`  API + CSDL    ${cfg.API_URL}/health      → ${await probe(`${cfg.API_URL}/health`)}`);
  log(`  Giao diện     ${pagesUrl(cfg.PAGES_PROJECT)}  → ${await probe(pagesUrl(cfg.PAGES_PROJECT), 30_000)}`);
  log(`\n  Link cố định cho khách & nhân viên: ${pagesUrl(cfg.PAGES_PROJECT)}`);
  log('  Có tên miền riêng? Cloudflare Pages → Custom domains (miễn phí, HTTPS tự động) — xem docs/TRIEN-KHAI.md mục 3.6a.');
}

const STEPS = { check: stepCheck, render: stepRender, pages: stepPages, keepalive: stepKeepalive, verify: stepVerify };

async function main() {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(join(ROOT, 'deploy', 'cloud.env.example'), ENV_FILE);
    log(`Đã tạo ${ENV_FILE} — điền theo hướng dẫn trong tệp (tạo tài khoản miễn phí, đăng nhập bằng GitHub) rồi chạy lại.`);
    process.exit(2);
  }
  const cfg = parseEnv(readFileSync(ENV_FILE, 'utf8'));
  const wanted = process.argv.slice(2).filter((a) => STEPS[a]);
  const order = wanted.length ? ['check', ...wanted.filter((s) => s !== 'check')] : Object.keys(STEPS);
  for (const s of order) await STEPS[s](cfg);
  log('\nXong.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`\n[LỖI] ${e.message}`); process.exit(1); });
}
