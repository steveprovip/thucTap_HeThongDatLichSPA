#!/usr/bin/env node
/**
 * Trợ lý khởi động dùng chung cho run_project.bat (Windows) và run_project.sh (macOS/Linux).
 * Viết bằng Node thuần (không cần gói ngoài) để hành vi GIỐNG HỆT nhau trên mọi máy.
 *
 *   node scripts/launcher.mjs check-node   Kiểm tra Node.js >= 20
 *   node scripts/launcher.mjs prepare      Tạo .env, cài/cập nhật node_modules, kiểm tra cổng 3000/5173
 *   node scripts/launcher.mjs open         Chờ API /health = 200 VÀ giao diện 5173 phản hồi, rồi mở trình duyệt
 *
 * Mã thoát của "prepare": 0 = sẵn sàng, 1 = lỗi, 10 = hệ thống ĐANG chạy ở cửa sổ khác (đã mở trình duyệt).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(readEnvValue(join(ROOT, 'backend', '.env'), 'PORT') ?? 3000);
const WEB_PORT = 5173;
const APP_URL = `http://localhost:${WEB_PORT}`;
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`;
const MIN_NODE_MAJOR = 20;

const log = (msg = '') => process.stdout.write(`${msg}\n`);
const err = (msg) => process.stderr.write(`${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnvValue(file, key) {
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  const v = line?.slice(line.indexOf('=') + 1).trim();
  return v ? v : undefined;
}

/* ------------------------------------------------------------------ check-node */
function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    err(`[LỖI] Cần Node.js ${MIN_NODE_MAJOR} trở lên, máy đang dùng ${process.version}. Tải tại https://nodejs.org`);
    return 1;
  }
  return 0;
}

/* --------------------------------------------------------------------- prepare */
function ensureEnvFiles() {
  for (const dir of ['.', 'backend', 'frontend']) {
    const target = join(ROOT, dir, '.env');
    const example = join(ROOT, dir, '.env.example');
    if (!existsSync(target) && existsSync(example)) {
      copyFileSync(example, target);
      log(`      Tạo ${join(dir, '.env')} từ .env.example`);
    }
  }
}

const STAMP = '.salon-deps.sha1';

function depsHash(dir) {
  const h = createHash('sha1');
  h.update(process.versions.node.split('.')[0]); // đổi major Node -> cài lại gói native
  h.update(process.platform + process.arch); // node_modules copy từ HĐH khác -> cài lại
  for (const f of ['package.json', 'package-lock.json']) {
    const p = join(dir, f);
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest('hex');
}

/**
 * Cài gói khi: chưa có node_modules, HOẶC package.json / package-lock.json đã đổi
 * (vd. sau git pull) so với lần cài trước. Lần sau không đổi gì thì bỏ qua -> khởi động nhanh.
 */
function ensureDeps() {
  for (const [dir, label] of [['.', 'workspace gốc'], ['backend', 'backend'], ['frontend', 'frontend']]) {
    const abs = join(ROOT, dir);
    const stampFile = join(abs, 'node_modules', STAMP);
    const want = depsHash(abs);
    const have = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : '';
    if (existsSync(join(abs, 'node_modules')) && have === want) {
      log(`      ${label}: gói đã đầy đủ.`);
      continue;
    }
    log(`      ${label}: cài đặt / cập nhật gói (lần đầu có thể mất vài phút) ...`);
    const r = spawnSync('npm', ['install', '--no-fund', '--no-audit'], {
      cwd: abs,
      stdio: 'inherit',
      shell: process.platform === 'win32', // npm là npm.cmd trên Windows
    });
    if (r.status !== 0) {
      err(`[LỖI] npm install thất bại trong ${label}. Kiểm tra kết nối mạng rồi chạy lại.`);
      return false;
    }
    // npm install có thể tự cập nhật package-lock.json -> tính lại hash sau khi cài
    writeFileSync(stampFile, depsHash(abs));
  }
  return true;
}

/** true nếu đã có tiến trình lắng nghe cổng này (thử cả IPv4 lẫn IPv6). */
async function portInUse(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const s = net.connect({ host, port });
      s.setTimeout(800);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('timeout', () => { s.destroy(); resolve(false); });
      s.once('error', () => resolve(false));
    });
  return (await probe('127.0.0.1')) || (await probe('::1'));
}

function httpStatus(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

function openBrowser(url) {
  if (process.env.SALON_NO_BROWSER === '1' || process.env.CI) return;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]] // windowsVerbatimArguments: giữ nguyên "" làm tiêu đề cửa sổ
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    child.on('error', () => log(`      Hãy tự mở trình duyệt tại ${url}`));
    child.unref();
  } catch {
    log(`      Hãy tự mở trình duyệt tại ${url}`);
  }
}

async function prepare() {
  ensureEnvFiles();
  if (!ensureDeps()) return 1;

  const apiBusy = await portInUse(API_PORT);
  const webBusy = await portInUse(WEB_PORT);
  if (apiBusy || webBusy) {
    const ours = apiBusy && webBusy && (await httpStatus(HEALTH_URL)) === 200;
    if (ours) {
      log('');
      log(`[!] Hệ thống ĐANG chạy ở một cửa sổ khác. Mở ${APP_URL} ...`);
      openBrowser(APP_URL);
      return 10;
    }
    const busy = [apiBusy && `${API_PORT} (API)`, webBusy && `${WEB_PORT} (giao diện)`].filter(Boolean).join(', ');
    err(`[LỖI] Cổng ${busy} đang bị chương trình khác chiếm.`);
    err('      Đóng cửa sổ launcher cũ / chương trình đang dùng cổng đó rồi chạy lại.');
    return 1;
  }
  return 0;
}

/* ------------------------------------------------------------------------ open */
async function openWhenReady() {
  const timeoutSec = Number(process.env.SALON_OPEN_TIMEOUT ?? 300);
  const deadline = Date.now() + timeoutSec * 1000;
  let lastNote = 0;
  const started = Date.now();
  while (Date.now() < deadline) {
    const [api, web] = await Promise.all([httpStatus(HEALTH_URL), httpStatus(APP_URL)]);
    if (api === 200 && web > 0 && web < 500) {
      const secs = Math.round((Date.now() - started) / 1000);
      log('');
      log('============================================================');
      log(`  HỆ THỐNG ĐÃ SẴN SÀNG sau ${secs} giây -> ${APP_URL}`);
      log(`  Đăng nhập nhân viên: ${APP_URL}/dang-nhap`);
      log('============================================================');
      openBrowser(APP_URL);
      return 0;
    }
    if (Date.now() - lastNote > 15000) {
      lastNote = Date.now();
      const why = api === 503 ? 'API chạy nhưng CSDL chưa sẵn sàng' : api === 0 ? 'API đang biên dịch/khởi động' : `API trả ${api}`;
      log(`Đang chờ hệ thống sẵn sàng (${why}) ...`);
    }
    await sleep(1500);
  }
  err(`[CẢNH BÁO] Sau ${timeoutSec} giây API vẫn chưa sẵn sàng. Xem log [API] phía trên để biết lỗi.`);
  return 0; // không làm dừng API/WEB
}

/* ------------------------------------------------------------------------ main */
const cmd = process.argv[2];
const handlers = { 'check-node': checkNode, prepare, open: openWhenReady };
if (!handlers[cmd]) {
  err(`Cách dùng: node scripts/launcher.mjs <${Object.keys(handlers).join('|')}>`);
  process.exit(1);
}
Promise.resolve(handlers[cmd]())
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    err(`[LỖI] ${e?.stack ?? e}`);
    process.exit(1);
  });
