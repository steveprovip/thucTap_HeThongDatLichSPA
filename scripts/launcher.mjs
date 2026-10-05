#!/usr/bin/env node
/**
 * Trợ lý khởi động dùng chung cho run_project.bat (Windows) và run_project.sh (macOS/Linux).
 * Viết bằng Node thuần (không cần gói ngoài) để hành vi GIỐNG HỆT nhau trên mọi máy.
 *
 *   node scripts/launcher.mjs start        TOÀN BỘ quy trình 1-click: .env -> Docker/PostgreSQL -> gói npm ->
 *                                          nạp CSDL -> chạy API + giao diện -> mở trình duyệt (dùng cho
 *                                          run_project.bat / run_project.sh)
 *   node scripts/launcher.mjs check-node   Kiểm tra Node.js >= 20
 *   node scripts/launcher.mjs prepare      Tạo .env, cài/cập nhật node_modules, kiểm tra cổng 3000/5173
 *   node scripts/launcher.mjs run          Chạy API + giao diện dưới một TIẾN TRÌNH GIÁM SÁT duy nhất:
 *                                          chờ /health = 200 rồi mở trình duyệt, tự khởi động lại
 *                                          tiến trình bị sập, Ctrl+C dừng sạch cả cây tiến trình.
 *   node scripts/launcher.mjs open         (tương thích cũ) chờ sẵn sàng, mở trình duyệt rồi thoát
 *   node scripts/launcher.mjs serve        CHẾ ĐỘ MÁY CHỦ (start_server.bat): migration -> bootstrap -> build -> chạy bản
 *                                          production, NestJS phục vụ cả web lẫn API ở một cổng. KHÔNG nạp dữ liệu mẫu.
 *   node scripts/launcher.mjs update       CẬP NHẬT 1 CHẠM (update_project.bat): git pull -> gói npm -> build -> dừng ->
 *                                          sao lưu + migration -> chạy lại. Lỗi ở bước nào thì quay về bản cũ.
 *   node scripts/launcher.mjs tunnel       Mở Quick Tunnel của Cloudflare (HTTPS công khai, miễn phí, không cần tên miền) tới máy chủ này
 *   node scripts/launcher.mjs resume       Chạy lại bản máy chủ ĐÃ build sẵn (không migration, không build) - dùng nội bộ khi cập nhật
 *   node scripts/launcher.mjs stop         Dừng hệ thống đang chạy (do launcher quản lý)
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
import { appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 24+ cảnh báo bằng tiếng Anh khi gọi npm qua shell trên Windows; ẩn để người dùng mới không hoang mang
process.noDeprecation = true;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(readEnvValue(join(ROOT, 'backend', '.env'), 'PORT') ?? 3000);
const WEB_PORT = 5173;
const APP_URL = `http://localhost:${WEB_PORT}`;
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`;
/** Chế độ MÁY CHỦ: NestJS đã build phục vụ cả giao diện lẫn API trên MỘT cổng (cho đường hầm Cloudflare / mạng LAN). */
const SERVER_URL = `http://localhost:${API_PORT}`;
const STATE_FILE = join(ROOT, '.salon-run.json');
const BUILD_STAMP = join(ROOT, '.salon-build.json');
const SELF = fileURLToPath(import.meta.url);
const MIN_NODE_MAJOR = 20;
const IS_WIN = process.platform === 'win32';

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
let envReady = false; // start() rồi prepare() cùng gọi -> chỉ làm (và báo) một lần
function ensureEnvFiles() {
  if (envReady) return;
  envReady = true;
  for (const dir of ['.', 'backend', 'frontend']) {
    const target = join(ROOT, dir, '.env');
    const example = join(ROOT, dir, '.env.example');
    if (!existsSync(target) && existsSync(example)) {
      copyFileSync(example, target);
      log(`      Tạo ${join(dir, '.env')} từ .env.example`);
    }
  }
  rotatePlaceholderSecrets(join(ROOT, 'backend', '.env'));
  ensureRealApiMode(join(ROOT, 'frontend', '.env'));
}

/**
 * Chế độ Demo (dữ liệu giả lưu trong trình duyệt) chỉ dành cho `npm run dev:demo`. frontend/.env cũ thiếu biến này
 * từng khiến `npm run dev` rơi vào Demo mà người dùng không hay biết -> luôn ghi rõ VITE_DEMO_MODE=false.
 */
function ensureRealApiMode(file) {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8');
  const m = /^\s*VITE_DEMO_MODE\s*=\s*(\S*)/m.exec(raw);
  if (!m) {
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(file, `${raw}${raw === '' || raw.endsWith('\n') ? '' : eol}VITE_DEMO_MODE=false${eol}`);
    log('      Thêm VITE_DEMO_MODE=false vào frontend/.env (chạy với API thật)');
  } else if (m[1].toLowerCase() === 'true') {
    log('      [CẢNH BÁO] frontend/.env đang đặt VITE_DEMO_MODE=true. Launcher vẫn chạy API thật (chế độ Demo: npm run dev:demo).');
  }
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

const tcpOpen = (host, port) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.setTimeout(800);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });

/** true nếu đã có tiến trình lắng nghe cổng này (thử cả IPv4 lẫn IPv6). */
async function portInUse(port) {
  return (await tcpOpen('127.0.0.1', port)) || (await tcpOpen('::1', port));
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
    err(`      Tìm chương trình đang chiếm cổng: ${process.platform === 'win32' ? 'netstat -ano | findstr :' : 'lsof -i :'}${apiBusy ? API_PORT : WEB_PORT}`);
    return 1;
  }
  return 0;
}

/* ------------------------------------------------------------------------ open */
/** Chờ API /health = 200 VÀ Vite phản hồi. true = sẵn sàng, false = hết thời gian. */
async function waitUntilReady({ isStopping = () => false, mode = 'dev' } = {}) {
  const timeoutSec = Number(process.env.SALON_OPEN_TIMEOUT ?? 300);
  const appUrl = mode === 'serve' ? SERVER_URL : APP_URL;
  const deadline = Date.now() + timeoutSec * 1000;
  let lastNote = 0;
  const started = Date.now();
  while (Date.now() < deadline && !isStopping()) {
    // Chế độ máy chủ chỉ có MỘT tiến trình (NestJS phục vụ luôn giao diện), không có Vite để chờ
    const [api, web] = await Promise.all([httpStatus(HEALTH_URL), mode === 'serve' ? Promise.resolve(200) : httpStatus(APP_URL)]);
    if (api === 200 && web > 0 && web < 500) {
      const secs = Math.round((Date.now() - started) / 1000);
      log('');
      log('============================================================');
      log(`  HỆ THỐNG ĐÃ SẴN SÀNG sau ${secs} giây -> ${appUrl}`);
      log(`  Đăng nhập nhân viên: ${appUrl}/dang-nhap`);
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

/* ------------------------------------------------------------ start (1-click) */
const DB_CONTAINER = 'salon_postgres';
const DOCKER_DOWNLOAD = 'https://www.docker.com/products/docker-desktop/';

/** Địa chỉ PostgreSQL mà backend sẽ kết nối (biến môi trường thắng backend/.env, giống dotenv). */
function dbTarget() {
  const env = join(ROOT, 'backend', '.env');
  return {
    host: process.env.DB_HOST ?? readEnvValue(env, 'DB_HOST') ?? 'localhost',
    port: Number(process.env.DB_PORT ?? readEnvValue(env, 'DB_PORT') ?? 5432),
  };
}
const dbReachable = ({ host, port }) => (host === 'localhost' ? portInUse(port) : tcpOpen(host, port));

const dockerInstalled = () => !spawnSync('docker', ['--version'], { stdio: 'ignore' }).error;
const dockerReady = () => spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 30000 }).status === 0;
/** 'healthy' | 'running' | 'starting' | ... ; chuỗi rỗng nếu không đọc được container. */
const containerState = (name) => {
  const fmt = '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}';
  const r = spawnSync('docker', ['inspect', '--format', fmt, name], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
};

/** Windows / macOS: thử bật Docker Desktop giúp người dùng; Linux phải tự bật dịch vụ docker. */
function startDockerDesktop() {
  const [cmd, args] = IS_WIN
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'), []]
    : process.platform === 'darwin' ? ['open', ['-ga', 'Docker']] : [null, []];
  if (!cmd || (IS_WIN && !existsSync(cmd))) return;
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch { /* người dùng tự bật Docker */ }
}

async function waitForDocker() {
  const deadline = Date.now() + 120_000;
  let opened = false;
  while (!dockerReady()) {
    if (!opened) {
      opened = true;
      log('      Docker chưa sẵn sàng - đang thử mở và chờ tối đa 2 phút ...');
      startDockerDesktop();
    }
    if (Date.now() > deadline) return false;
    await sleep(2000);
  }
  return true;
}

/** Chờ PostgreSQL nhận kết nối (và, khi dùng Docker, container báo healthy). */
async function waitForDatabase(viaDocker) {
  const target = dbTarget();
  const timeoutSec = Number(process.env.SALON_DB_TIMEOUT ?? 120);
  const deadline = Date.now() + timeoutSec * 1000;
  let lastNote = 0;
  for (;;) {
    const state = viaDocker ? containerState(DB_CONTAINER) : 'healthy';
    // Không đọc được trạng thái container (đổi tên...) thì chỉ dựa vào kết nối TCP
    if ((state === '' || state === 'healthy' || state === 'running') && (await dbReachable(target))) return true;
    if (Date.now() > deadline) break;
    if (Date.now() - lastNote > 10_000) {
      lastNote = Date.now();
      log(`      Đang chờ PostgreSQL sẵn sàng tại ${target.host}:${target.port} ...`);
    }
    await sleep(2000);
  }
  err(`[LỖI] PostgreSQL chưa sẵn sàng sau ${timeoutSec} giây tại ${target.host}:${target.port}.`);
  if (viaDocker) {
    err(`      - Xem nhật ký: docker logs ${DB_CONTAINER}`);
    err(`      - DB_PORT trong backend/.env (đang là ${target.port}) phải trùng POSTGRES_PORT trong .env.`);
    err('      - Muốn dựng lại CSDL từ đầu: npm run db:reset');
  } else {
    err('      - Hãy bật PostgreSQL và kiểm tra DB_HOST, DB_PORT trong backend/.env.');
  }
  return false;
}

/** Bước 3: bảo đảm có PostgreSQL chạy được (Docker, hoặc PostgreSQL tự cài khi SALON_SKIP_DOCKER=1). */
async function ensureDatabase(step = '[3/6]') {
  const target = dbTarget();
  const where = `${target.host}:${target.port}`;
  if (process.env.SALON_SKIP_DOCKER?.trim() === '1') {
    log(`${step} Bỏ qua Docker (SALON_SKIP_DOCKER=1). Dùng PostgreSQL tại ${where} theo backend/.env`);
    return waitForDatabase(false);
  }
  if (!dockerInstalled()) {
    if (await dbReachable(target)) {
      log(`${step} [CẢNH BÁO] Không tìm thấy Docker nhưng đã có PostgreSQL tại ${where} - dùng luôn.`);
      log('      Hộp thư ảo Maildev sẽ không có (email xác nhận không đọc được ở http://localhost:1080).');
      return true;
    }
    err(`[LỖI] Máy chưa cài Docker và cũng không kết nối được PostgreSQL tại ${where}.`);
    err(`      Cách 1 (khuyên dùng): cài Docker Desktop tại ${DOCKER_DOWNLOAD} , bật lên rồi chạy lại.`);
    err('      Cách 2: tự cài PostgreSQL 16, tạo CSDL và tài khoản khớp backend/.env, rồi chạy lại với SALON_SKIP_DOCKER=1');
    err('              (Windows cmd: set SALON_SKIP_DOCKER=1&& run_project.bat   |   macOS/Linux: SALON_SKIP_DOCKER=1 ./run_project.sh)');
    return false;
  }
  log(`${step} Kiểm tra Docker ...`);
  if (!(await waitForDocker())) {
    err('[LỖI] Docker không phản hồi sau 2 phút.');
    err('      Windows/macOS: mở Docker Desktop, đợi biểu tượng cá voi chuyển sang "Engine running" rồi chạy lại.');
    err('      Linux: sudo systemctl start docker (và thêm tài khoản vào nhóm docker).');
    return false;
  }
  log('      Dựng PostgreSQL, PgAdmin và Maildev (lần đầu phải tải image, có thể mất vài phút) ...');
  if (spawnSync('docker', ['compose', 'up', '-d'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) {
    err('[LỖI] docker compose up thất bại. Nguyên nhân thường gặp:');
    err('      - Cổng 5432 / 5050 / 1080 đang bị chương trình khác chiếm (vd. PostgreSQL cài sẵn trên máy).');
    err('        Cách sửa: đặt POSTGRES_PORT=5433 trong .env và DB_PORT=5433 trong backend/.env rồi chạy lại.');
    err('      - Trùng tên container của một bản sao dự án khác: docker rm -f salon_postgres salon_pgadmin salon_maildev');
    err('      - Docker Desktop quá cũ, không có lệnh "docker compose": cập nhật Docker Desktop.');
    return false;
  }
  log('      Container đã chạy. Chờ PostgreSQL sẵn sàng ...');
  return waitForDatabase(true);
}

/** Bước 5: schema.sql + seed.sql đều viết để chạy lại nhiều lần vẫn an toàn. */
function seedDatabase() {
  log('[5/6] Nạp lược đồ và dữ liệu mẫu (chạy lại nhiều lần vẫn an toàn) ...');
  const r = spawnSync('npm', ['run', 'seed', '--prefix', 'backend'], { cwd: ROOT, stdio: 'inherit', shell: IS_WIN });
  if (r.status !== 0) {
    err('[LỖI] Nạp dữ liệu mẫu thất bại. Xem phần "Gợi ý" ở trên và kiểm tra kết nối CSDL trong backend/.env');
    return false;
  }
  return true;
}

const printBanner = () => log(`
[6/6] Khởi động API và giao diện (chế độ API thật, dữ liệu lưu trong PostgreSQL) ...

  API        : http://localhost:${API_PORT}/api
  Tài liệu   : http://localhost:${API_PORT}/api/docs
  Giao diện  : ${APP_URL}
  Hộp thư ảo : http://localhost:1080   (Maildev)
  PgAdmin    : http://localhost:5050

  Tài khoản mẫu:
    admin@salon.vn      / Admin@123       (Quản trị hệ thống)
    owner@salon.vn      / Owner@123       (Chủ tiệm)
    reception@salon.vn  / Reception@123   (Lễ tân)
    stylist1@salon.vn   / Stylist@123     (Thợ, còn stylist2..5)

  Trình duyệt CHỈ mở khi http://localhost:${API_PORT}/health trả về 200
  (API đã biên dịch xong và kết nối được CSDL) - thường mất 15-40 giây.
  Nhấn Ctrl+C để dừng toàn bộ.
============================================================
`);

/** Windows: cửa sổ mở bằng nhấp đúp sẽ đóng ngay nên chờ người dùng đọc xong thông báo. */
const waitForEnter = () =>
  IS_WIN && process.stdin.isTTY
    ? new Promise((resolve) => { log('Nhấn Enter để đóng cửa sổ này.'); process.stdin.once('data', resolve); })
    : Promise.resolve();

/** Toàn bộ quy trình 1-click cho người dùng tải dự án lần đầu. */
async function start() {
  if (checkNode() !== 0) return 1;
  log('============================================================');
  log('  HỆ THỐNG ĐẶT LỊCH SALON - SPA');
  log('  Khởi động bằng MỘT lệnh: docker + backend + frontend');
  log('============================================================');
  log('');
  log(`[1/6] Node.js ${process.version}`);
  log('[2/6] Chuẩn bị tệp .env (luôn chạy với API thật, không dùng chế độ Demo) ...');
  ensureEnvFiles();
  if (!(await ensureDatabase())) return 1;
  log('[4/6] Kiểm tra gói npm và cổng mạng ...');
  const rc = await prepare();
  if (rc === 10) {
    log('Cửa sổ này có thể đóng.');
    await waitForEnter();
    return 0;
  }
  if (rc !== 0) return 1;
  log(`      Cổng ${API_PORT} và ${WEB_PORT} đang trống.`);
  if (!seedDatabase()) return 1;
  printBanner();
  return run();
}

/* ------------------------------------------------------------------------- run */
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

function makeServices(mode = 'dev') {
  if (mode === 'serve') {
    return [
      {
        name: 'API',
        color: 36,
        cwd: join(ROOT, 'backend'),
        bin: join(ROOT, 'backend', 'dist', 'main.js'),
        args: [],
        npmScript: 'start:prod',
        // Bản production: NestJS phục vụ cả frontend/dist. Biến của tiến trình thắng backend/.env nên không cần sửa .env.
        env: {
          NODE_ENV: 'production',
          SERVE_FRONTEND: 'true',
          FRONTEND_DIST: join(ROOT, 'frontend', 'dist'),
          PORT: String(API_PORT),
        },
      },
    ].map((s) => ({ ...s, child: null, restarts: [], buf: { out: '', err: '' } }));
  }
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
      env: { VITE_DEMO_MODE: 'false' }, // biến của tiến trình thắng .env: launcher luôn chạy API thật
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

/**
 * Máy chủ chạy trong cửa sổ riêng (Windows) sẽ bị đóng khi tự quay về bản cũ -> ghi song song ra logs/server.log
 * để còn đọc được lỗi của bản mới. (POSIX: startDetached đã chuyển hướng toàn bộ đầu ra vào chính tệp đó.)
 */
function openServerLog() {
  if (process.env.SALON_LOG_REDIRECTED === '1') return () => {};
  const dir = join(ROOT, 'logs');
  const file = join(dir, 'server.log');
  try {
    mkdirSync(dir, { recursive: true });
    if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) renameSync(file, join(dir, 'server.log.1'));
    appendFileSync(file, `\n===== ${new Date().toISOString()} khởi động máy chủ (${short(currentCommit())}) =====\n`);
  } catch { return () => {}; }
  // eslint-disable-next-line no-control-regex
  return (text) => { try { appendFileSync(file, text.replace(/\x1b\[[0-9;]*m/g, '')); } catch { /* đĩa đầy: bỏ qua, không làm sập máy chủ */ } };
}

async function run(mode = 'dev') {
  const services = makeServices(mode);
  const toLog = mode === 'serve' ? openServerLog() : () => {};
  const useColor = process.stdout.isTTY;
  let stopping = false;
  let exitCode = 0;

  const prefix = (svc) => (useColor ? `\x1b[${svc.color}m[${svc.name}]\x1b[0m ` : `[${svc.name}] `);
  const pump = (svc, key, stream, chunk) => {
    const text = svc.buf[key] + chunk.toString('utf8').replace(CLEAR_SCREEN, '');
    const lines = text.split(/\r?\n/);
    svc.buf[key] = lines.pop();
    for (const line of lines) stream.write(`${prefix(svc)}${line}\n`);
    toLog(lines.map((l) => `[${svc.name}] ${l}\n`).join(''));
  };
  const flush = (svc) => {
    for (const [key, stream] of [['out', process.stdout], ['err', process.stderr]]) {
      if (svc.buf[key]) {
        stream.write(`${prefix(svc)}${svc.buf[key]}\n`);
        toLog(`[${svc.name}] ${svc.buf[key]}\n`);
      }
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
      env: { ...process.env, ...svc.env, ...(useColor ? { FORCE_COLOR: '1' } : {}) },
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
    log(mode === 'serve' ? 'Đang dừng máy chủ ...' : 'Đang dừng API và giao diện ...');
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
  process.on('exit', () => {
    for (const svc of services) killTree(svc.child);
    clearState();
  });

  for (const svc of services) start(svc);
  writeState(mode);

  // Mở trình duyệt đúng MỘT lần, ngay trong tiến trình giám sát -> không còn tiến trình phụ nào "exited"
  if (await waitUntilReady({ isStopping: () => stopping, mode })) openBrowser(mode === 'serve' ? SERVER_URL : APP_URL);

  // Giữ tiến trình sống bằng một handle thật (Promise treo KHÔNG giữ được event loop của Node)
  return new Promise(() => { setInterval(() => {}, 1 << 30); });
}

/* ================================================================ MÁY CHỦ + CẬP NHẬT 1 CHẠM */
/*
 * Hai chế độ chạy:
 *   dev   (run_project.bat)    : Vite + NestJS watch, nạp dữ liệu MẪU. Dành cho máy lập trình / kiểm thử.
 *   serve (start_server.bat)   : bản production, NestJS phục vụ cả web lẫn API ở một cổng, KHÔNG nạp dữ liệu mẫu.
 *                                Dành cho máy tiệm (máy bàn làm máy chủ), đi cùng đường hầm Cloudflare.
 * update_project.bat nhận ra chế độ nào đang chạy qua tệp trạng thái .salon-run.json để dừng và bật lại đúng kiểu.
 */
const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

function writeState(mode) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ mode, pid: process.pid, ppid: process.ppid, port: API_PORT, startedAt: new Date().toISOString() }));
  } catch { /* không ghi được thì chỉ mất khả năng tự dừng khi cập nhật */ }
}

/** Trạng thái của launcher ĐANG SỐNG, hoặc null (không có / tệp cũ của tiến trình đã chết). */
function readState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return s && Number.isInteger(s.pid) && pidAlive(s.pid) ? s : null;
  } catch { return null; }
}

function clearState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (s.pid === process.pid) rmSync(STATE_FILE, { force: true });
  } catch { /* chưa có tệp */ }
}

const npm = (args, opts = {}) => spawnSync('npm', args, { cwd: ROOT, shell: IS_WIN, ...opts });
const git = (args, opts = {}) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
const gitOut = (args) => {
  const r = git(args);
  return r.status === 0 ? r.stdout.trim() : '';
};
const gitAvailable = () => !spawnSync('git', ['--version'], { stdio: 'ignore' }).error;
const currentCommit = () => gitOut(['rev-parse', 'HEAD']);
/** Tệp mã nguồn (đã theo dõi) đang bị sửa. KHÔNG dùng gitOut: nó trim() làm mất ký tự đầu của dòng đầu tiên. */
const dirtyFiles = () =>
  (git(['status', '--porcelain', '--untracked-files=no']).stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ line, file: line.slice(3).trim() }));
/** package-lock.json do `npm install` tự sửa trên máy tiệm thì bỏ qua (không phải thay đổi của con người). */
const LOCKFILE = /(^|\/)package-lock\.json$/;
const isDirty = () => dirtyFiles().some((d) => !LOCKFILE.test(d.file));
const short = (rev) => (rev ? rev.slice(0, 7) : '?');

async function waitPortFree(port, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!(await portInUse(port))) return true;
    await sleep(500);
  }
  return false;
}

/** Windows: cửa sổ cmd.exe đang chứa launcher (để đóng luôn, không để lại cửa sổ trống). */
function isCmdWindow(pid) {
  if (!IS_WIN || !pid) return false;
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  return /"cmd\.exe"/i.test(r.stdout || '');
}

async function stopRunning(state) {
  if (!state) return true;
  log(`      Dừng hệ thống đang chạy (PID ${state.pid}, chế độ ${state.mode === 'serve' ? 'máy chủ' : 'phát triển'}) ...`);
  if (IS_WIN) {
    spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    if (isCmdWindow(state.ppid)) spawnSync('taskkill', ['/PID', String(state.ppid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(state.pid, 'SIGTERM'); } catch { /* đã dừng */ }
  }
  const deadline = Date.now() + 20_000;
  while (pidAlive(state.pid) && Date.now() < deadline) await sleep(300);
  if (pidAlive(state.pid) && !IS_WIN) { try { process.kill(state.pid, 'SIGKILL'); } catch { /* đã dừng */ } }
  return waitPortFree(API_PORT, 20_000);
}

/* --------------------------------------------------------------- build vào thư mục tạm */
/**
 * Build vào backend/dist-next và frontend/dist-next TRƯỚC, trong lúc bản cũ vẫn đang phục vụ khách.
 * Lỗi biên dịch thì dừng ngay, hệ thống đang chạy không bị đụng tới. Chỉ khi build xong mới dừng - đổi thư mục - chạy lại.
 */
function buildNext() {
  const be = join(ROOT, 'backend');
  const fe = join(ROOT, 'frontend');
  rmSync(join(be, 'dist-next'), { recursive: true, force: true });
  rmSync(join(fe, 'dist-next'), { recursive: true, force: true });
  log('      Biên dịch backend vào backend/dist-next (bản đang chạy chưa bị đụng tới) ...');
  const b = npm(['run', 'build:next', '--prefix', 'backend'], { stdio: 'inherit' });
  if (b.status !== 0 || !existsSync(join(be, 'dist-next', 'main.js'))) {
    err('[LỖI] Biên dịch backend thất bại (xem lỗi TypeScript phía trên).');
    rmSync(join(be, 'dist-next'), { recursive: true, force: true });
    return false;
  }
  log('      Build giao diện vào frontend/dist-next ...');
  const f = npm(['run', 'build', '--prefix', 'frontend', '--', '--outDir', 'dist-next'], { stdio: 'inherit' });
  if (f.status !== 0 || !existsSync(join(fe, 'dist-next', 'index.html'))) {
    err('[LỖI] Build giao diện thất bại (xem lỗi phía trên).');
    rmSync(join(be, 'dist-next'), { recursive: true, force: true });
    rmSync(join(fe, 'dist-next'), { recursive: true, force: true });
    return false;
  }
  return true;
}

async function renameRetry(from, to) {
  for (let i = 0; ; i += 1) {
    try { renameSync(from, to); return; } catch (e) {
      // Windows: antivirus / Explorer đôi khi giữ thư mục vài giây
      if (i >= 9) throw e;
      await sleep(500);
    }
  }
}

/** dist -> dist-prev (giữ bản cũ để quay lại), dist-next -> dist. Gọi khi hệ thống ĐÃ dừng. */
async function swapNext() {
  for (const dir of ['backend', 'frontend']) {
    const cur = join(ROOT, dir, 'dist');
    const next = join(ROOT, dir, 'dist-next');
    const prev = join(ROOT, dir, 'dist-prev');
    rmSync(prev, { recursive: true, force: true });
    if (existsSync(cur)) await renameRetry(cur, prev);
    await renameRetry(next, cur);
  }
  writeFileSync(BUILD_STAMP, JSON.stringify({ commit: currentCommit(), builtAt: new Date().toISOString() }));
}

/** Quay lại dist cũ. builtCommit = commit mà dist cũ được build (rỗng nếu không chắc -> lần chạy sau sẽ build lại cho an toàn). */
async function restorePrev(builtCommit = '') {
  for (const dir of ['backend', 'frontend']) {
    const cur = join(ROOT, dir, 'dist');
    const prev = join(ROOT, dir, 'dist-prev');
    if (!existsSync(prev)) continue;
    rmSync(cur, { recursive: true, force: true });
    await renameRetry(prev, cur);
  }
  if (builtCommit) writeFileSync(BUILD_STAMP, JSON.stringify({ commit: builtCommit, builtAt: new Date().toISOString() }));
  else rmSync(BUILD_STAMP, { force: true });
}

/** Thư mục có package.json / package-lock.json khác lần cài trước (hoặc chưa cài). */
function staleDeps() {
  return ['.', 'backend', 'frontend'].filter((dir) => {
    const abs = join(ROOT, dir);
    const stampFile = join(abs, 'node_modules', STAMP);
    const have = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : '';
    return !(existsSync(join(abs, 'node_modules')) && have === depsHash(abs));
  });
}

function readStampCommit() {
  try { return JSON.parse(readFileSync(BUILD_STAMP, 'utf8')).commit ?? ''; } catch { return ''; }
}

function needsBuild() {
  if (!existsSync(join(ROOT, 'backend', 'dist', 'main.js')) || !existsSync(join(ROOT, 'frontend', 'dist', 'index.html'))) return true;
  if (!existsSync(join(ROOT, '.git')) || !gitAvailable()) return false;
  if (isDirty()) return true;
  return readStampCommit() !== currentCommit();
}

/* ------------------------------------------------------------ các bước CSDL (không nạp dữ liệu mẫu) */
/** Chạy npm script của backend: in ra màn hình ĐÚNG THỨ TỰ (stdout + stderr) và trả về nội dung stdout để phân tích. */
function backendScript(script, extra = []) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script, '--prefix', 'backend', ...(extra.length ? ['--', ...extra] : [])], {
      cwd: ROOT,
      shell: IS_WIN,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); process.stdout.write(c); });
    child.stderr.on('data', (c) => process.stderr.write(c));
    child.on('error', () => resolve({ ok: false, out }));
    child.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

async function migrateAndBootstrap(backup) {
  log('      Cập nhật cấu trúc CSDL (migration; KHÔNG nạp dữ liệu mẫu, KHÔNG xoá dữ liệu khách) ...');
  const m = await backendScript('migration:run', [`--backup=${backup}`]);
  if (!m.ok) return { ok: false, applied: [], backupFile: null };
  const applied = [...m.out.matchAll(/✓ (\S+)/g)].map((x) => x[1]);
  const backupFile = /Đã sao lưu \([^)]*\): (.+)/.exec(m.out)?.[1]?.trim() ?? null;
  const b = await backendScript('bootstrap');
  if (!b.ok) return { ok: false, applied, backupFile };
  const noAdmin = /CSDL chưa có tài khoản nào/.test(b.out); // bootstrap chỉ cảnh báo khi thiếu BOOTSTRAP_ADMIN_*
  // Cảnh báo (không chặn): tài khoản mẫu còn mật khẩu mặc định thì không được mở hệ thống ra Internet
  await backendScript('security:check');
  return { ok: true, applied, backupFile, noAdmin };
}

/** Địa chỉ trong mạng LAN để laptop / điện thoại cùng Wi-Fi truy cập trực tiếp (không cần Internet). */
function lanUrls() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${API_PORT}`);
    }
  }
  return out;
}

const printServerBanner = () => {
  const lan = lanUrls();
  log(`
[6/6] Khởi động máy chủ (bản production, một cổng cho cả web lẫn API) ...

  Trên máy này   : ${SERVER_URL}
${lan.map((u) => `  Cùng Wi-Fi/LAN : ${u}   (laptop, điện thoại; Windows có thể hỏi cho phép Node.js qua tường lửa)`).join('\n') || '  (không thấy mạng LAN)'}
  Từ xa          : chạy đường hầm Cloudflare trỏ về ${SERVER_URL} (xem docs/TRIEN-KHAI.md, Phương án 2)

  KHÔNG có dữ liệu mẫu: đăng nhập bằng tài khoản thật. Cập nhật phiên bản mới: update_project.bat
  Nhấn Ctrl+C để dừng máy chủ.
============================================================
`);
};

/** Chế độ MÁY CHỦ cho máy tiệm. Chạy lại bao nhiêu lần cũng không đụng tới dữ liệu khách. */
async function serve() {
  if (checkNode() !== 0) return 1;
  log('============================================================');
  log('  HỆ THỐNG ĐẶT LỊCH SALON - SPA  |  CHẾ ĐỘ MÁY CHỦ');
  log('  Bản production, giữ nguyên dữ liệu khách, không nạp dữ liệu mẫu');
  log('============================================================');
  log('');
  log(`[1/6] Node.js ${process.version}`);
  log('[2/6] Chuẩn bị tệp .env ...');
  ensureEnvFiles();

  if (await portInUse(API_PORT)) {
    if ((await httpStatus(HEALTH_URL)) === 200) {
      log(`[!] Máy chủ ĐANG chạy ở một cửa sổ khác. Mở ${SERVER_URL} ...`);
      openBrowser(SERVER_URL);
      return 0;
    }
    err(`[LỖI] Cổng ${API_PORT} đang bị chương trình khác chiếm. Đóng chương trình đó rồi chạy lại.`);
    return 1;
  }
  if (!(await ensureDatabase())) return 1;
  log('[4/6] Kiểm tra gói npm ...');
  if (!ensureDeps()) return 1;
  log('[5/6] Cấu trúc CSDL ...');
  const mig = await migrateAndBootstrap(process.env.MIGRATION_BACKUP ?? 'auto');
  if (!mig.ok) {
    err('[LỖI] Không cập nhật được cấu trúc CSDL. Máy chủ KHÔNG khởi động để tránh chạy sai dữ liệu. Xem lỗi phía trên.');
    return 1;
  }
  if (mig.noAdmin) {
    err('[LỖI] CSDL chưa có tài khoản nào nên không ai đăng nhập được. Máy chủ chưa khởi động.');
    err('      Mở backend\\.env, điền BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD (>= 8 ký tự, có chữ và số, không dấu;');
    err('      tránh ký tự #), lưu lại rồi chạy lại start_server.bat. Tài khoản quản trị đầu tiên sẽ được tạo tự động.');
    return 1;
  }
  if (needsBuild()) {
    log('      Bản build chưa có hoặc đã cũ so với mã nguồn - build lại (vài chục giây) ...');
    if (!buildNext()) return 1;
    await swapNext();
  } else {
    log('      Bản build đã khớp mã nguồn.');
  }
  printServerBanner();
  return run('serve');
}

function stopCommand() {
  const state = readState();
  if (!state) {
    log('Không có hệ thống nào do launcher quản lý đang chạy.');
    return 0;
  }
  return stopRunning(state).then((freed) => {
    log(freed ? 'Đã dừng.' : `[CẢNH BÁO] Đã gửi lệnh dừng nhưng cổng ${API_PORT} vẫn còn bận.`);
    return freed ? 0 : 1;
  });
}

/* ------------------------------------------------------------------- cập nhật 1 chạm */
/** Chạy lại bản máy chủ ĐÃ build sẵn: không migration, không build, không đụng CSDL. Dùng khi cập nhật và khi quay về bản cũ. */
async function resume() {
  if (checkNode() !== 0) return 1;
  if (!existsSync(join(ROOT, 'backend', 'dist', 'main.js')) || !existsSync(join(ROOT, 'frontend', 'dist', 'index.html'))) {
    err('[LỖI] Chưa có bản build. Chạy start_server.bat (sẽ build rồi chạy).');
    return 1;
  }
  ensureEnvFiles();
  if (await portInUse(API_PORT)) {
    err(`[LỖI] Cổng ${API_PORT} đang bị chương trình khác chiếm.`);
    return 1;
  }
  printServerBanner();
  return run('serve');
}

/** Mở lại hệ thống trong cửa sổ MỚI (cửa sổ cập nhật được đóng lại sau khi xong). Trả về false nếu không mở được. */
function startDetached(mode) {
  // serve -> `resume`: chạy bản ĐÃ build + ĐÃ migration, không làm lại (nếu làm lại, bản hỏng sẽ chặn luôn việc bật bản cũ).
  // dev   -> `run`   : KHÔNG phải `start` vì start nạp lại dữ liệu mẫu, việc cập nhật tuyệt đối không được làm.
  const command = mode === 'serve' ? 'resume' : 'run';
  const env = { ...process.env, SALON_NO_BROWSER: '1' };
  try {
    if (IS_WIN) {
      // start "tiêu đề" /D "thư mục" cmd /k ... : cửa sổ riêng, giữ lại để đọc log
      const line = `/d /c start "Salon ${command}" /D "${ROOT}" cmd /k node scripts\\launcher.mjs ${command}`;
      const child = spawn('cmd.exe', [line], { detached: true, stdio: 'ignore', env, windowsVerbatimArguments: true });
      child.on('error', () => {});
      child.unref();
    } else {
      mkdirSync(join(ROOT, 'logs'), { recursive: true });
      const out = openSync(join(ROOT, 'logs', 'server.log'), 'a');
      const child = spawn(process.execPath, [SELF, command], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env: { ...env, SALON_LOG_REDIRECTED: '1' } });
      child.on('error', () => {});
      child.unref();
    }
    return true;
  } catch {
    return false;
  }
}

async function waitHealthy(seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if ((await httpStatus(HEALTH_URL)) === 200) return true;
    await sleep(1500);
  }
  return false;
}

const BAR = '============================================================';

/* ------------------------------------------------------------------- đường hầm Cloudflare */
/** Tìm cloudflared: biến CLOUDFLARED_PATH, tools/, C:\Cloudflared\bin (đúng thư mục trong hướng dẫn của Cloudflare), rồi PATH. */
function findCloudflared() {
  const exe = IS_WIN ? 'cloudflared.exe' : 'cloudflared';
  const candidates = [process.env.CLOUDFLARED_PATH, join(ROOT, 'tools', exe), IS_WIN ? 'C:\\Cloudflared\\bin\\cloudflared.exe' : null].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const r = spawnSync(IS_WIN ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout.split(/\r?\n/)[0] || '').trim() || null : null;
}

/**
 * Quick Tunnel của Cloudflare: HTTPS công khai tới máy chủ này, KHÔNG cần tài khoản hay tên miền, miễn phí.
 * Giới hạn do Cloudflare ghi rõ: địa chỉ ngẫu nhiên và ĐỔI mỗi lần chạy, không cam kết hoạt động liên tục, tối đa 200 yêu cầu
 * đồng thời, KHÔNG hỗ trợ Server-Sent Events (giao diện tự chuyển sang hỏi định kỳ mỗi 15 giây, vẫn cập nhật được).
 */
async function tunnel() {
  if (checkNode() !== 0) return 1;
  const bin = findCloudflared();
  if (!bin) {
    err('[LỖI] Chưa có cloudflared (chương trình tạo đường hầm của Cloudflare, miễn phí).');
    err('      Windows: tải https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe');
    err('               đổi tên thành cloudflared.exe và đặt vào C:\\Cloudflared\\bin (hoặc thư mục tools\\ của dự án).');
    err('      macOS/Linux: xem https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/');
    return 1;
  }
  if ((await httpStatus(HEALTH_URL)) !== 200) {
    err(`[CẢNH BÁO] Máy chủ chưa chạy ở cổng ${API_PORT}. Hãy chạy start_server.bat trước; đường hầm vẫn mở nhưng người dùng sẽ gặp lỗi cho tới khi máy chủ lên.`);
  }
  const args = ['tunnel', '--url', SERVER_URL];
  const allowed = process.env.CLOUDFLARED_ALLOWED_MAIL?.trim();
  if (allowed) args.push('--allowed-mail', allowed);

  log(`Mở đường hầm tới ${SERVER_URL} bằng ${bin} ...`);
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let shown = false;
  const onData = (chunk) => {
    const text = chunk.toString('utf8');
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (m && !shown) {
      shown = true;
      log(`
${BAR}
  ĐƯỜNG HẦM ĐÃ MỞ - dùng địa chỉ này trên laptop / điện thoại (HTTPS):

      ${m[0]}

  - Địa chỉ ĐỔI mỗi lần chạy lại lệnh này. Đừng đặt nó vào FRONTEND_URL (link trong email gửi khách).
  - Không có cam kết hoạt động liên tục; Cloudflare coi Quick Tunnel là để thử nghiệm.
  - Quick Tunnel không hỗ trợ SSE: giao diện tự chuyển sang hỏi mỗi 15 giây (dữ liệu vẫn đồng bộ, chậm hơn vài giây).
  - Địa chỉ này ai biết cũng mở được: hãy chắc chắn đã chạy "npm run security:check" (không còn tài khoản mẫu).
  Nhấn Ctrl+C để đóng đường hầm.
${BAR}`);
    }
    // cloudflared ghi nhật ký ra stderr; chỉ in các dòng cảnh báo / lỗi để màn hình gọn
    for (const line of text.split(/\r?\n/)) if (/\b(ERR|WRN)\b/.test(line)) process.stderr.write(`[cloudflared] ${line}\n`);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (e) => err(`[LỖI] Không chạy được cloudflared: ${e.message}`));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try { process.on(sig, () => { try { child.kill(); } catch { /* đã thoát */ } }); } catch { /* HĐH không hỗ trợ */ }
  }
  return new Promise((resolve) => {
    child.on('exit', (code) => {
      if (code && !shown) err('[LỖI] cloudflared dừng trước khi mở được đường hầm (kiểm tra kết nối Internet / tường lửa chặn cổng 7844).');
      resolve(code ?? 0);
    });
  });
}


/** Bước 1 (chạy bằng mã CŨ): kiểm tra Git, lấy mã mới. Sau đó chạy lại chính launcher bằng mã MỚI (update-apply). */
async function update() {
  if (checkNode() !== 0) return 1;
  const force = process.argv.includes('--force');
  log(BAR);
  log('  CẬP NHẬT PHIÊN BẢN MỚI  |  giữ nguyên dữ liệu khách và phiên đăng nhập');
  log(BAR);
  log('');

  log('[1/7] Kiểm tra Git ...');
  if (!gitAvailable()) {
    err('[LỖI] Máy chưa cài Git. Tải tại https://git-scm.com/download/win , cài xong chạy lại update_project.bat.');
    return 1;
  }
  if (!existsSync(join(ROOT, '.git'))) {
    err('[LỖI] Thư mục này không phải bản sao Git (có thể tải về dạng .zip) nên không tự cập nhật được.');
    err('      Hãy lấy dự án bằng: git clone <địa-chỉ-kho-mã> rồi dùng bản đó.');
    return 1;
  }
  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    err(`[LỖI] Máy đang ở nhánh "${branch}", cập nhật chỉ chạy trên nhánh main.`);
    err('      Chạy: git checkout main   rồi thử lại update_project.bat');
    return 1;
  }
  const real = dirtyFiles().filter((d) => !LOCKFILE.test(d.file));
  if (real.length) {
    err('[LỖI] Có tệp mã nguồn bị sửa tại máy này, cập nhật có thể ghi đè hoặc xung đột:');
    err(real.slice(0, 10).map((d) => `        ${d.line}`).join('\n'));
    err('      Hãy gửi các thay đổi đó cho người lập trình (hoặc hoàn lại: git checkout -- <tệp>) rồi chạy lại.');
    return 1;
  }
  const state = readState();
  if (!state && (await portInUse(API_PORT))) {
    err(`[LỖI] Cổng ${API_PORT} đang có chương trình chạy mà launcher không quản lý (một cửa sổ cũ, hoặc chương trình khác).`);
    err('      Đóng cửa sổ đang chạy hệ thống (Ctrl+C) rồi chạy lại update_project.bat. CHƯA có gì bị thay đổi.');
    return 1;
  }

  const oldRev = currentCommit();
  log('[2/7] Lấy phiên bản mới: git pull origin main ...');
  if (git(['fetch', '--quiet', 'origin', 'main'], { stdio: 'inherit' }).status !== 0) {
    err('[LỖI] Không kết nối được kho mã (kiểm tra Internet / quyền truy cập GitHub). CHƯA có gì bị thay đổi.');
    return 1;
  }
  const remoteRev = gitOut(['rev-parse', 'origin/main']);
  const builtRev = readStampCommit();
  if (remoteRev === oldRev && builtRev === oldRev && !force && state) {
    log(`      Đã là phiên bản mới nhất (${short(oldRev)}). Không có gì để cập nhật.`);
    return 0;
  }
  if (force) rmSync(BUILD_STAMP, { force: true }); // buộc build lại
  if (remoteRev !== oldRev) {
    // package-lock.json bị npm sửa tại máy + bản mới cũng đổi chính tệp đó -> hoàn lại bản của máy để kéo về không xung đột
    const incoming = gitOut(['diff', '--name-only', `${oldRev}..origin/main`]).split('\n');
    const clash = dirtyFiles().filter((d) => LOCKFILE.test(d.file) && incoming.includes(d.file)).map((d) => d.file);
    if (clash.length) {
      git(['checkout', '--', ...clash]);
      log(`      Hoàn lại ${clash.join(', ')} (do npm tự sửa trên máy này) để kéo bản mới không xung đột.`);
    }
    // --ff-only: chỉ tiến tới, không bao giờ tự tạo commit hợp nhất hay ghi đè
    const pull = git(['pull', '--ff-only', 'origin', 'main'], { stdio: 'inherit' });
    if (pull.status !== 0) {
      err('[LỖI] git pull thất bại (lịch sử máy này khác kho mã). CHƯA có gì bị thay đổi; hãy liên hệ người lập trình.');
      return 1;
    }
  }
  const newRev = currentCommit();
  // Từ đây chạy bằng mã MỚI vừa kéo về: logic cập nhật mới (nếu có) áp dụng ngay trong lần này
  const r = spawnSync(process.execPath, [SELF, 'update-apply', oldRev, newRev], { cwd: ROOT, stdio: 'inherit' });
  return r.status ?? 1;
}

/** Bước 2 (chạy bằng mã MỚI): gói npm, build, dừng, sao lưu + migration, chạy lại, kiểm tra, tự quay về nếu lỗi. */
async function updateApply() {
  const oldRev = process.argv[3] ?? '';
  const newRev = process.argv[4] ?? currentCommit();
  const t0 = Date.now();
  const state = readState();
  const mode = state?.mode ?? 'serve';
  const wasRunning = !!state;
  const backupPolicy = process.env.UPDATE_BACKUP ?? 'required';
  const oldBuilt = !!oldRev && readStampCommit() === oldRev; // thư mục dist hiện tại được build đúng từ bản cũ
  let stopped = false; // đã dừng hệ thống cũ chưa
  let swapped = false; // đã đổi dist-next -> dist chưa

  /**
   * Cập nhật hỏng -> đưa MÃ NGUỒN về bản cũ (cây mã đã được kiểm tra là sạch nên không mất gì của máy này).
   * Nếu không, lần khởi động sau (mất điện, bật máy) sẽ build lại đúng bản hỏng và tiệm không có hệ thống để dùng.
   */
  const revertCode = () => {
    if (!oldRev || currentCommit() === oldRev) return;
    const r = git(['reset', '--hard', oldRev], { stdio: 'ignore' });
    log(r.status === 0 ? `      Đã đưa mã nguồn về phiên bản cũ ${short(oldRev)}.` : `      [CẢNH BÁO] Không tự đưa mã nguồn về ${short(oldRev)} được: chạy git reset --hard ${short(oldRev)}`);
  };

  /** Lỗi sau khi đã dừng hệ thống cũ -> bật lại bản cũ ĐÃ BUILD SẴN (không migration, không build), để tiệm vẫn làm việc. */
  const restartOld = async () => {
    if (!wasRunning || !stopped) return;
    if (mode === 'serve' && !existsSync(join(ROOT, 'backend', 'dist', 'main.js'))) {
      err('      Không còn bản cũ để bật lại. Chạy start_server.bat để xem lỗi chi tiết.');
      return;
    }
    log('      Bật lại BẢN CŨ để tiệm tiếp tục làm việc ...');
    startDetached(mode);
    const back = await waitHealthy(90);
    err(back ? '      Đã bật lại bản cũ, tiệm làm việc bình thường.' : '      Bản cũ cũng chưa lên. Chạy start_server.bat để xem lỗi chi tiết.');
  };
  const fail = async (...lines) => {
    for (const l of lines) err(l);
    revertCode();
    await restartOld();
    return 1;
  };

  log(`      ${short(oldRev)} -> ${short(newRev)}`);
  const changes = oldRev && newRev && oldRev !== newRev ? gitOut(['log', '--oneline', '--no-decorate', '-n', '12', `${oldRev}..${newRev}`]) : '';
  if (changes) log(changes.split('\n').map((l) => `        ${l}`).join('\n'));

  log('[3/7] Kiểm tra gói npm (chỉ cài khi package.json / package-lock.json đổi) ...');
  ensureEnvFiles();
  if (staleDeps().length && wasRunning) {
    // Cài gói lúc hệ thống còn chạy có thể lỗi khoá tệp .node (bcrypt...) trên Windows -> dừng trước, chỉ khi có gói mới
    log('      Có gói npm mới: dừng hệ thống trước khi cài (tránh khoá tệp trên Windows) ...');
    if (!(await stopRunning(state))) return fail(`[LỖI] Không dừng được hệ thống cũ (cổng ${API_PORT} vẫn bận). Chưa thay đổi gì.`);
    stopped = true;
  }
  if (!ensureDeps()) return fail('[LỖI] Cài gói thất bại.');

  const needBuild = mode === 'serve' && needsBuild();
  if (mode !== 'serve') {
    log('[4/7] Chế độ phát triển: không cần build.');
  } else if (needBuild) {
    log(stopped ? '[4/7] Build bản mới ...' : '[4/7] Build bản mới ở thư mục tạm (bản cũ vẫn phục vụ trong lúc này) ...');
    if (!buildNext()) {
      return fail(stopped ? '[LỖI] Build thất bại.' : '[LỖI] Build thất bại. Hệ thống đang chạy KHÔNG bị đụng tới, vẫn là bản cũ.');
    }
  } else {
    log('[4/7] Bản build đã khớp mã nguồn, bỏ qua build.');
  }

  log('[5/7] Dừng hệ thống, sao lưu CSDL và cập nhật cấu trúc ...');
  if (!stopped) {
    if (!(await stopRunning(state))) return fail(`[LỖI] Không dừng được hệ thống cũ (cổng ${API_PORT} vẫn bận). Chưa thay đổi gì.`);
    stopped = true;
  }
  if (!(await ensureDatabase('     -'))) return fail('[LỖI] Không kết nối được PostgreSQL.');
  const mig = await migrateAndBootstrap(backupPolicy);
  if (!mig.ok) {
    return fail(
      '[LỖI] Cập nhật cấu trúc CSDL thất bại. Dữ liệu cũ được giữ nguyên (mỗi migration chạy trong một giao dịch, lỗi thì tự huỷ).',
      ...(mig.backupFile ? [`      Bản sao lưu trước khi cập nhật: ${mig.backupFile}`] : []),
    );
  }

  log('[6/7] Chuyển sang bản mới ...');
  if (needBuild) {
    await swapNext();
    swapped = true;
  }

  log('[7/7] Khởi động lại và kiểm tra ...');
  if (!startDetached(mode)) {
    err('[CẢNH BÁO] Không tự mở được cửa sổ mới. Hãy chạy start_server.bat (hoặc run_project.bat) để bật hệ thống.');
    return 1;
  }
  const healthy = await waitHealthy(Number(process.env.UPDATE_HEALTH_TIMEOUT ?? 150));
  let versionOk = true;
  if (healthy && mode === 'serve') {
    try {
      const want = JSON.parse(readFileSync(join(ROOT, 'frontend', 'dist', 'version.json'), 'utf8')).id;
      const got = await new Promise((resolve) => {
        http.get(`${SERVER_URL}/version.json`, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => { try { resolve(JSON.parse(body).id); } catch { resolve(''); } });
        }).on('error', () => resolve(''));
      });
      versionOk = got === want;
    } catch { versionOk = false; }
  }

  if (!healthy || !versionOk) {
    err(`[LỖI] Bản mới không chạy đúng (${healthy ? 'giao diện không khớp bản build' : 'API không phản hồi'}). Quay lại bản cũ ...`);
    await stopRunning(readState());
    if (swapped) await restorePrev(oldBuilt ? oldRev : '');
    return fail(
      `      CSDL đã được nâng cấp (chỉ thêm cấu trúc, bản cũ vẫn dùng được). ${mig.backupFile ? `Bản sao lưu trước đó: ${mig.backupFile}` : ''}`,
      `      Nhật ký lỗi của bản mới: ${join('logs', 'server.log')} (nếu không có, chạy start_server.bat để xem trực tiếp). Gửi cho người lập trình.`,
    );
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  log('');
  log(BAR);
  log(`  CẬP NHẬT XONG sau ${secs} giây`);
  log(`  Phiên bản        : ${short(oldRev)} -> ${short(newRev)}`);
  log(`  Cấu trúc CSDL    : ${mig.applied.length ? `đã áp dụng ${mig.applied.join(', ')}` : 'không có thay đổi'}`);
  log(`  Sao lưu trước đó : ${mig.backupFile ?? 'không cần (CSDL chưa có thay đổi cấu trúc)'}`);
  log('  Dữ liệu khách    : giữ nguyên, không nạp dữ liệu mẫu');
  log('  Phiên đăng nhập  : giữ nguyên (khoá JWT trong backend/.env không đổi, phiên lưu trong CSDL)');
  log(`  Địa chỉ          : ${mode === 'serve' ? SERVER_URL : APP_URL}`);
  log('  Thiết bị đang mở trang sẽ thấy nút "Tải lại" để lấy giao diện mới.');
  if (!wasRunning) log('  (Trước đó hệ thống chưa chạy - đã bật ở chế độ máy chủ.)');
  log(BAR);
  return 0;
}

/* ------------------------------------------------------------------------ main */
const cmd = process.argv[2];
const handlers = {
  start, 'check-node': checkNode, prepare, open: openWhenReady, run,
  serve, resume, tunnel, stop: stopCommand, update, 'update-apply': updateApply,
};
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
