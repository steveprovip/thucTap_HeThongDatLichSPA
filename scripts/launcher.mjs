#!/usr/bin/env node
/**
 * Trợ lý khởi động dùng chung cho run_project.bat (Windows) và run_project.sh (macOS/Linux).
 * Viết bằng Node thuần (không cần gói ngoài) để hành vi GIỐNG HỆT nhau trên mọi máy.
 *
 *   node scripts/launcher.mjs check-node   Kiểm tra Node.js >= 20
 *   node scripts/launcher.mjs prepare      Tạo .env, cài/cập nhật node_modules, kiểm tra cổng 3000/5173
 *   node scripts/launcher.mjs run          Chạy API + giao diện dưới một TIẾN TRÌNH GIÁM SÁT duy nhất:
 *                                          chờ /health = 200 rồi mở trình duyệt, tự khởi động lại
 *                                          tiến trình bị sập, Ctrl+C dừng sạch cả cây tiến trình.
 *   node scripts/launcher.mjs open         (tương thích cũ) chờ sẵn sàng, mở trình duyệt rồi thoát
 *
 * Mã thoát của "prepare": 0 = sẵn sàng, 1 = lỗi, 10 = hệ thống ĐANG chạy ở cửa sổ khác (đã mở trình duyệt).
 *
 * Vì sao không dùng concurrently cho launcher (lỗi "exited with code 3221226505"):
 *   3221226505 = 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN / __fastfail) — Node.js trên Windows bị
 *   abort ở tầng native (assertion libuv, xem nodejs/node#56645), KHÔNG phải lỗi JavaScript nên
 *   không bắt được bằng try/catch. Chuỗi concurrently -> cmd -> npm -> npm -> cmd -> node vite chỉ
 *   báo mã thoát rồi bỏ mặc, trang web chết cho tới khi chạy lại launcher. Tiến trình giám sát ở đây
 *   chạy thẳng `node vite.js` / `node nest.js` (không qua cmd/npm), giải mã mã thoát thành thông điệp
 *   dễ hiểu và TỰ KHỞI ĐỘNG LẠI dịch vụ bị sập (tối đa 5 lần / 10 phút).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
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
  rotatePlaceholderSecrets(join(ROOT, 'backend', '.env'));
}

/**
 * backend/.env.example (đã commit lên git) chứa khoá JWT mẫu công khai. Nếu backend/.env còn giữ
 * nguyên giá trị đó thì bất kỳ ai đọc repo cũng ký được token hợp lệ -> thay bằng khoá ngẫu nhiên.
 * Chỉ đụng tới đúng dòng còn là giá trị mẫu; khoá do người dùng tự đặt được giữ nguyên.
 */
const PLACEHOLDER_SECRET = /^(JWT_(?:ACCESS|REFRESH)_SECRET)=(doi_chuoi_nay_trong_moi_truong_that_\w*|dev_\w*_secret|)\s*$/;
function rotatePlaceholderSecrets(file) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let changed = 0;
  const out = raw.split(/\r?\n/).map((line) => {
    const m = PLACEHOLDER_SECRET.exec(line);
    if (!m) return line;
    changed += 1;
    return `${m[1]}=${randomBytes(48).toString('base64url')}`;
  });
  if (changed) {
    writeFileSync(file, out.join(eol));
    log(`      Sinh ${changed} khoá JWT ngẫu nhiên thay cho giá trị mẫu trong backend/.env`);
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
  // Windows: rundll32 url.dll -> trình duyệt mặc định; không qua cmd/PowerShell nên không nháy
  // cửa sổ console và không phụ thuộc cách trích dẫn tham số của shell.
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
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
/** Chờ API /health = 200 VÀ Vite phản hồi. true = sẵn sàng, false = hết thời gian. */
async function waitUntilReady({ isStopping = () => false } = {}) {
  const timeoutSec = Number(process.env.SALON_OPEN_TIMEOUT ?? 300);
  const deadline = Date.now() + timeoutSec * 1000;
  let lastNote = 0;
  const started = Date.now();
  while (Date.now() < deadline && !isStopping()) {
    const [api, web] = await Promise.all([httpStatus(HEALTH_URL), httpStatus(APP_URL)]);
    if (api === 200 && web > 0 && web < 500) {
      const secs = Math.round((Date.now() - started) / 1000);
      log('');
      log('============================================================');
      log(`  HỆ THỐNG ĐÃ SẴN SÀNG sau ${secs} giây -> ${APP_URL}`);
      log(`  Đăng nhập nhân viên: ${APP_URL}/dang-nhap`);
      log('  Nhấn Ctrl+C trong cửa sổ này để dừng toàn bộ.');
      log('============================================================');
      return true;
    }
    if (Date.now() - lastNote > 15000) {
      lastNote = Date.now();
      const why = api === 503 ? 'API chạy nhưng CSDL chưa sẵn sàng' : api === 0 ? 'API đang biên dịch/khởi động' : `API trả ${api}`;
      log(`Đang chờ hệ thống sẵn sàng (${why}) ...`);
    }
    await sleep(1500);
  }
  if (!isStopping()) err(`[CẢNH BÁO] Sau ${timeoutSec} giây API vẫn chưa sẵn sàng. Xem log [API] phía trên để biết lỗi.`);
  return false;
}

/** Dùng cho `npm run start:all` kiểu cũ: chờ, mở trình duyệt rồi thoát (mã 0). */
async function openWhenReady() {
  if (await waitUntilReady()) openBrowser(APP_URL);
  return 0;
}

/* ------------------------------------------------------------------------- run */
const IS_WIN = process.platform === 'win32';
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10 * 60 * 1000;

/** Mã thoát NTSTATUS hay gặp của Node.js trên Windows (số thập phân không dấu). */
const WIN_EXIT_CODES = {
  3221226505: '0xC0000409 STATUS_STACK_BUFFER_OVERRUN — Node.js abort ở tầng native (assertion libuv/V8), không phải lỗi mã nguồn',
  3221225786: '0xC000013A STATUS_CONTROL_C_EXIT — dừng bằng Ctrl+C / đóng cửa sổ',
  3221225477: '0xC0000005 ACCESS_VIOLATION — lỗi truy cập bộ nhớ ở mô-đun native',
  3221225725: '0xC00000FD STACK_OVERFLOW — tràn ngăn xếp',
  3221225495: '0xC0000017 NO_MEMORY — hết bộ nhớ',
  3221225794: '0xC0000142 DLL_INIT_FAILED — thiếu tài nguyên hệ thống (thử đóng bớt ứng dụng)',
  134: 'SIGABRT — Node.js abort (thường do hết bộ nhớ heap)',
};

function describeExit(code, signal) {
  if (signal) return `bị tín hiệu ${signal}`;
  if (code == null) return 'không rõ mã thoát';
  const known = WIN_EXIT_CODES[code];
  if (known) return `mã ${code} = ${known}`;
  if (code > 0x7fffffff) return `mã ${code} (0x${code.toString(16).toUpperCase()}) — lỗi native của Windows`;
  return `mã ${code}`;
}

/** Ctrl+C trên Windows đến MỌI tiến trình cùng console: tiến trình con có thể chết trước khi ta kịp nhận SIGINT. */
const isInterruptExit = (code, signal) => signal === 'SIGINT' || signal === 'SIGTERM' || code === 3221225786 || code === 130;

// Xoá chuỗi xoá-màn-hình của tsc watch để log của WEB không bị cuốn mất
const CLEAR_SCREEN = /\x1b\[[0-3]?J|\x1b\[H|\x1bc/g;

function makeServices() {
  return [
    {
      name: 'API',
      color: 36,
      cwd: join(ROOT, 'backend'),
      bin: join(ROOT, 'backend', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js'),
      args: ['start', '--watch', '--preserveWatchOutput'],
      npmScript: 'start:dev',
    },
    {
      name: 'WEB',
      color: 35,
      cwd: join(ROOT, 'frontend'),
      bin: join(ROOT, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      args: [],
      npmScript: 'dev',
    },
  ].map((s) => ({ ...s, child: null, restarts: [], buf: { out: '', err: '' } }));
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (IS_WIN) {
      // /T: cả cây (nest -> node dist/main, vite -> esbuild); /F: không hỏi
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGTERM'); // cả nhóm tiến trình (spawn detached)
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* đã chết */ }
  }
}

async function run() {
  const services = makeServices();
  const useColor = process.stdout.isTTY;
  let stopping = false;
  let exitCode = 0;

  const prefix = (svc) => (useColor ? `\x1b[${svc.color}m[${svc.name}]\x1b[0m ` : `[${svc.name}] `);
  const pump = (svc, key, stream, chunk) => {
    const text = svc.buf[key] + chunk.toString('utf8').replace(CLEAR_SCREEN, '');
    const lines = text.split(/\r?\n/);
    svc.buf[key] = lines.pop();
    for (const line of lines) stream.write(`${prefix(svc)}${line}\n`);
  };
  const flush = (svc) => {
    for (const [key, stream] of [['out', process.stdout], ['err', process.stderr]]) {
      if (svc.buf[key]) stream.write(`${prefix(svc)}${svc.buf[key]}\n`);
      svc.buf[key] = '';
    }
  };

  const start = (svc) => {
    const direct = existsSync(svc.bin);
    const [cmd, args] = direct
      ? [process.execPath, [svc.bin, ...svc.args]]
      : ['npm', ['run', svc.npmScript]];
    const child = spawn(cmd, args, {
      cwd: svc.cwd,
      // stdin là pipe GIỮ MỞ suốt đời tiến trình con: Vite thoát khi stdin phát 'end'.
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(useColor ? { FORCE_COLOR: '1' } : {}) },
      windowsHide: true,
      // POSIX: nhóm tiến trình riêng để dừng cả cây; Windows: KHÔNG detached (tránh bật cửa sổ console mới)
      detached: !IS_WIN,
      shell: !direct && IS_WIN,
    });
    svc.child = child;
    child.stdout.on('data', (c) => pump(svc, 'out', process.stdout, c));
    child.stderr.on('data', (c) => pump(svc, 'err', process.stderr, c));
    child.on('error', (e) => err(`${prefix(svc)}không chạy được: ${e.message}`));
    child.on('exit', (code, signal) => {
      flush(svc);
      svc.child = null;
      // Đợi một nhịp: nếu đây là Ctrl+C, SIGINT của chính launcher sẽ đến ngay sau
      setTimeout(() => onExit(svc, code, signal), 400);
    });
  };

  const stopAll = (code) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    log('');
    log('Đang dừng API và giao diện ...');
    for (const svc of services) killTree(svc.child);
    const done = () => services.every((s) => !s.child);
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (done() || Date.now() - t0 > 8000) {
        clearInterval(timer);
        for (const svc of services) if (svc.child) try { svc.child.kill('SIGKILL'); } catch { /* bỏ qua */ }
        process.exit(exitCode);
      }
    }, 200);
  };

  const onExit = (svc, code, signal) => {
    if (stopping) return;
    if (isInterruptExit(code, signal)) { stopAll(0); return; }
    err(`${prefix(svc)}dừng bất thường: ${describeExit(code, signal)}`);
    const now = Date.now();
    svc.restarts = svc.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (svc.restarts.length >= MAX_RESTARTS) {
      err(`[LỖI] ${svc.name} sập ${MAX_RESTARTS} lần trong 10 phút — dừng toàn bộ. Xem log [${svc.name}] phía trên.`);
      stopAll(1);
      return;
    }
    svc.restarts.push(now);
    const delay = 2000 * svc.restarts.length;
    log(`${prefix(svc)}tự khởi động lại sau ${delay / 1000} giây (lần ${svc.restarts.length}/${MAX_RESTARTS}) ...`);
    setTimeout(() => { if (!stopping) start(svc); }, delay);
  };

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try { process.on(sig, () => stopAll(0)); } catch { /* tín hiệu không hỗ trợ trên HĐH này */ }
  }
  // Launcher chết bất ngờ -> không để API/WEB mồ côi giữ cổng 3000/5173
  process.on('exit', () => { for (const svc of services) killTree(svc.child); });

  for (const svc of services) start(svc);

  // Mở trình duyệt đúng MỘT lần, ngay trong tiến trình giám sát -> không còn tiến trình phụ nào "exited"
  if (await waitUntilReady({ isStopping: () => stopping })) openBrowser(APP_URL);

  // Giữ tiến trình sống bằng một handle thật (Promise treo KHÔNG giữ được event loop của Node)
  return new Promise(() => { setInterval(() => {}, 1 << 30); });
}

/* ------------------------------------------------------------------------ main */
const cmd = process.argv[2];
const handlers = { 'check-node': checkNode, prepare, open: openWhenReady, run };
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
