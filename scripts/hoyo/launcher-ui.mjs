#!/usr/bin/env node
/**
 * HoYoSalon Launcher — máy chủ cục bộ cho giao diện Launcher phong cách "game launcher" (HoYoSalon.bat).
 *
 *   node scripts/hoyo/launcher-ui.mjs            mở Launcher (cửa sổ ứng dụng Edge/Chrome, không thanh địa chỉ)
 *   node scripts/hoyo/launcher-ui.mjs --no-open  chỉ chạy máy chủ Launcher (kiểm thử / máy không có giao diện)
 *
 * Kiến trúc: giao diện (ui/index.html) chỉ là lớp vỏ; MỌI việc thật vẫn do scripts/launcher.mjs làm (Docker -> CSDL
 * -> gói npm -> chạy & giám sát, cập nhật 1 chạm có sao lưu + tự quay về bản cũ). Máy chủ này chạy các lệnh đó thành
 * tiến trình con ẩn, ghi nhật ký vào logs/, đọc tiến độ "[k/n]" để vẽ thanh phần trăm.
 *
 * An toàn: chỉ lắng nghe 127.0.0.1; mọi /api (trừ /api/ping) bắt buộc header X-Launcher-Token (chuỗi ngẫu nhiên sinh
 * mỗi lần chạy, chỉ nhúng vào trang do chính máy chủ này phục vụ) và Host phải là 127.0.0.1/localhost -> trang web lạ
 * không gọi được (chống CSRF / DNS rebinding). Tự thoát sau 2 phút không còn cửa sổ Launcher nào mở (trừ khi đang cập nhật).
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync, copyFileSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkForUpdate, localVersion, readChangelog } from '../lib/version.mjs';
import { buildLogBundle, deviceInfo, deviceInfoText, tailFile } from '../lib/diagnostics.mjs';
import { BANKS, buildShopUpdates, readShopConfig, upsertEnv } from '../lib/shop-config.mjs';
import { readinessChecks } from '../lib/env-check.mjs';
import { ensureToolPath, macAppBrowsers } from '../lib/platform.mjs';
import { aiUp, localAiStatus } from '../lib/local-ai.mjs';

ensureToolPath(); // macOS mở từ Finder không có PATH của Terminal

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LAUNCHER = join(ROOT, 'scripts', 'launcher.mjs');
const UI_FILE = join(HERE, 'ui', 'index.html');
const LOGS = join(ROOT, 'logs');
const SETTINGS_FILE = join(ROOT, '.salon-launcher.json');
const RUN_STATE = join(ROOT, '.salon-run.json');
const BACKEND_ENV = join(ROOT, 'backend', '.env');
/** Máy tiệm cài từ nhánh main -> mặc định chế độ "Máy chủ cửa hàng" (bản production, KHÔNG nạp dữ liệu mẫu). */
const defaultMode = () => (localVersion(ROOT).branch === 'main' ? 'serve' : 'dev');
const PORT = Number(process.env.SALON_LAUNCHER_PORT ?? 47321);
const TOKEN = randomBytes(24).toString('hex');
const IS_WIN = process.platform === 'win32';
const API_PORT = 3000;
const WEB_PORT = 5173;
const IDLE_EXIT_MS = Number(process.env.SALON_LAUNCHER_IDLE_MS ?? 120_000);
/** Tự kiểm tra bản mới định kỳ khi Launcher đang mở (mặc định 30 phút). */
const AUTO_CHECK_MS = Number(process.env.SALON_LAUNCHER_CHECK_MS ?? 30 * 60_000);
const SIGNATURE = 'salon-hoyo-launcher';
/** Chạy từ thư mục Khởi động của Windows: tự BẮT ĐẦU, không mở cửa sổ Launcher. */
const AUTOSTART = process.argv.includes('--autostart');
const STARTUP_FILE = IS_WIN && process.env.APPDATA
  ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Huong Sen Salon.vbs')
  : null;

mkdirSync(LOGS, { recursive: true });

// ------------------------------------------------------------------ cài đặt & trạng thái
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const settings = () => {
  const s = readJson(SETTINGS_FILE, {});
  const runMode = readJson(RUN_STATE, null)?.mode;
  const mode = s.mode === 'serve' || s.mode === 'dev' ? s.mode : runMode === 'serve' || runMode === 'dev' ? runMode : defaultMode();
  return {
    mode, autoCheck: s.autoCheck !== false, openOnReady: s.openOnReady !== false, closeOnReady: s.closeOnReady !== false,
    autoStartWindows: !!STARTUP_FILE && existsSync(STARTUP_FILE), canAutoStart: !!STARTUP_FILE,
  };
};
const saveSettings = (patch) => {
  // autoStartWindows / canAutoStart suy ra từ hệ thống, không lưu vào tệp cài đặt
  const { autoStartWindows: _a, canAutoStart: _c, ...persist } = { ...settings(), ...patch };
  writeFileSync(SETTINGS_FILE, JSON.stringify(persist, null, 2));
};

/** Bật / tắt "tự chạy hệ thống khi mở máy": một tệp .vbs nhỏ trong thư mục Startup gọi HoYoSalon.vbs --autostart. */
function setAutoStartWindows(on) {
  if (!STARTUP_FILE) throw Object.assign(new Error('Chỉ hỗ trợ trên Windows'), { status: 400 });
  if (!on) { rmSync(STARTUP_FILE, { force: true }); return; }
  const vbs = join(ROOT, 'scripts', 'windows', 'HoYoSalon.vbs');
  const text = `' Huong Sen Salon - tu khoi dong he thong khi dang nhap Windows (tat trong Launcher > Cai dat)\r\n`
    + `CreateObject("WScript.Shell").Run "wscript.exe //nologo ""${vbs}"" --autostart --no-shortcut", 0, False\r\n`;
  // UTF-16 LE có BOM: đường dẫn thư mục có dấu tiếng Việt vẫn đúng
  writeFileSync(STARTUP_FILE, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
}

const httpStatus = (url, timeoutMs = 2000) => new Promise((resolve) => {
  const req = http.get(url, { timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
  req.on('timeout', () => { req.destroy(); resolve(0); });
  req.on('error', () => resolve(0));
});

async function appStatus() {
  const run = readJson(RUN_STATE, null);
  const ai = { ...localAiStatus(ROOT), up: await aiUp() };
  const mode = run?.mode ?? settings().mode;
  const [api, web] = await Promise.all([
    httpStatus(`http://127.0.0.1:${API_PORT}/health`),
    mode === 'serve' ? Promise.resolve(200) : httpStatus(`http://127.0.0.1:${WEB_PORT}`),
  ]);
  const running = api === 200 && web > 0 && web < 500;
  return {
    running,
    starting: !running && (task?.kind === 'start' && task.running),
    managed: !!run,
    mode,
    apiStatus: api,
    url: mode === 'serve' ? `http://localhost:${API_PORT}` : `http://localhost:${WEB_PORT}`,
    ai,
  };
}

// ------------------------------------------------------------------ tác vụ nền (bắt đầu / cập nhật / dừng)
/** @type {null | { kind: string, running: boolean, percent: number, step: string, lines: string[], exitCode: number | null, startedAt: number, error: string | null, done: boolean }} */
let task = null;
let latestCheck = null;

const STEP_RE = /^\[(\d)\/(\d)\]\s*(.*)$/;
const rotate = (file) => { try { if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) renameSync(file, `${file}.1`); } catch { /* bỏ qua */ } };

function runTask(kind, args, { percentOf, readyCheck, onSuccess } = {}) {
  if (task?.running) throw Object.assign(new Error('Launcher đang bận một tác vụ khác'), { status: 409 });
  const logFile = join(LOGS, kind === 'start' ? 'app.log' : `${kind}.log`);
  rotate(logFile);
  const header = `\n===== ${new Date().toISOString()} ${kind}: node scripts/launcher.mjs ${args.join(' ')} =====\n`;
  const t = { kind, running: true, percent: 1, step: 'Đang chuẩn bị…', lines: [], exitCode: null, startedAt: Date.now(), error: null, done: false };
  task = t;
  const onText = (text) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (!line) continue;
      t.lines.push(line);
      if (t.lines.length > 400) t.lines.shift();
      const m = STEP_RE.exec(line.trim());
      if (m && percentOf) { t.percent = Math.max(t.percent, percentOf(Number(m[1]), Number(m[2]))); t.step = m[3] || t.step; }
      if (/^\[LỖI\]/.test(line.trim())) t.error = line.trim().replace(/^\[LỖI\]\s*/, '');
      if (/HỆ THỐNG ĐÃ SẴN SÀNG|CẬP NHẬT XONG|SAO LƯU XONG|Đã là phiên bản mới nhất|MÁY CHỦ ĐÃ SẴN SÀNG/i.test(line)) {
        t.percent = 100; t.step = line.trim(); t.done = true;
      }
    }
  };
  const env = { ...process.env, SALON_LAUNCHER_UI: '1', SALON_NO_PAUSE: '1', FORCE_COLOR: '0', NO_COLOR: '1' };
  // eslint-disable-next-line no-control-regex
  const clean = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
  let child;
  let out = null;
  if (kind === 'start') {
    // Tiến trình giám sát chạy LÂU DÀI và tách khỏi Launcher: ghi thẳng vào tệp (không qua pipe), để đóng Launcher
    // không làm tiến trình đó gặp lỗi EPIPE. Launcher đọc đuôi tệp để vẽ tiến độ.
    writeFileSync(logFile, header, { flag: 'a' });
    let offset = statSync(logFile).size;
    const fd = openSync(logFile, 'a');
    // Launcher tự mở trình duyệt khi sẵn sàng (theo cài đặt) -> tắt việc mở trình duyệt của launcher.mjs để không mở 2 lần
    child = spawn(process.execPath, [LAUNCHER, ...args], {
      cwd: ROOT, env: { ...env, SALON_NO_BROWSER: '1' }, stdio: ['ignore', fd, fd], windowsHide: true, detached: true,
    });
    closeSync(fd);
    const follow = setInterval(() => {
      try {
        const size = statSync(logFile).size;
        if (size > offset) {
          const rfd = openSync(logFile, 'r');
          const buf = Buffer.alloc(Math.min(size - offset, 1024 * 1024));
          readSync(rfd, buf, 0, buf.length, offset);
          closeSync(rfd);
          offset += buf.length;
          onText(clean(buf.toString('utf8')));
        }
      } catch { /* tệp đang xoay vòng */ }
      if (!t.running && t !== task) clearInterval(follow);
    }, 700);
    setTimeout(() => clearInterval(follow), 30 * 60_000).unref();
  } else {
    out = createWriteStream(logFile, { flags: 'a' });
    out.write(header);
    child = spawn(process.execPath, [LAUNCHER, ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const onData = (buf) => { const text = clean(buf.toString('utf8')); out.write(text); onText(text); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  }
  child.on('error', (e) => { t.error = e.message; t.running = false; t.exitCode = -1; out?.end(); });
  child.on('exit', (code) => {
    t.running = false;
    t.exitCode = code ?? 0;
    if (code === 0 && kind !== 'start') { t.percent = 100; t.done = true; onSuccess?.(); }
    if (code !== 0 && !t.error) t.error = `Tác vụ dừng với mã ${code}. Xem nhật ký để biết chi tiết.`;
    out?.end();
  });
  if (kind === 'start') {
    child.unref();
    // Chờ API (và Vite ở chế độ phát triển) phản hồi thật sự rồi mới báo xong
    const poll = setInterval(async () => {
      if (t !== task) return clearInterval(poll);
      const st = await appStatus();
      if (st.running) {
        t.percent = 100; t.done = true; t.running = false; t.step = `Đã sẵn sàng tại ${st.url}`;
        clearInterval(poll);
        if (readyCheck) readyCheck(st);
      } else if (t.exitCode !== null) {
        clearInterval(poll);
      }
    }, 1500);
  }
  return t;
}

function startApp() {
  const mode = settings().mode;
  // dev: launcher "start" (Docker + dữ liệu mẫu + Vite/NestJS watch); serve: bản production, không nạp dữ liệu mẫu
  runTask('start', [mode === 'serve' ? 'serve' : 'start'], {
    percentOf: (k, n) => Math.round((k / n) * (mode === 'serve' ? 60 : 85)),
    readyCheck: (ready) => { if (settings().openOnReady) openUrl(ready.url); },
  });
  return { started: true, mode };
}

// ------------------------------------------------------------------ mở cửa sổ
const EDGE_PATHS = [
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

function openUrl(url, { appWindow = false } = {}) {
  try {
    if (IS_WIN && appWindow) {
      const browser = EDGE_PATHS.find((p) => p && existsSync(p));
      if (browser) {
        spawn(browser, [`--app=${url}`, '--window-size=1280,760', '--no-first-run'], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
        return;
      }
    }
    if (process.platform === 'darwin' && appWindow) {
      const browser = macAppBrowsers().find((p) => existsSync(p));
      if (browser) {
        spawn(browser, [`--app=${url}`, '--window-size=1280,760', '--no-first-run'], { detached: true, stdio: 'ignore' }).unref();
        return;
      }
    }
    const [cmd, args] = IS_WIN ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch { /* người dùng tự mở */ }
}

// ------------------------------------------------------------------ nhật ký theo nguồn
function logOf(source, lines) {
  switch (source) {
    case 'client': // giao diện Vite ([WEB]) — chế độ máy chủ không có Vite, giao diện do NestJS phục vụ
    {
      const web = tailFile(join(LOGS, 'app.log'), 20_000).split('\n').filter((l) => l.startsWith('[WEB]') || /^===== .* start/.test(l)).slice(-lines);
      return web.some((l) => l.startsWith('[WEB]')) ? web.join('\n')
        : 'Chưa có nhật ký giao diện. Ở chế độ "Máy chủ cửa hàng" giao diện do API phục vụ — xem tab Server (API).';
    }
    case 'server': {
      const app = tailFile(join(LOGS, 'app.log'), 20_000).split('\n').filter((l) => !l.startsWith('[WEB]')).slice(-lines).join('\n');
      const srv = tailFile(join(LOGS, 'server.log'), lines);
      return [app, srv && `\n----- logs/server.log -----\n${srv}`].filter(Boolean).join('\n');
    }
    case 'database': {
      const r = spawnSync('docker', ['logs', '--tail', String(lines), 'salon_postgres'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      if (r.status === 0) return `${r.stdout}${r.stderr}`.trim() || '(Container salon_postgres chưa ghi nhật ký)';
      return 'Không đọc được nhật ký PostgreSQL: Docker chưa chạy hoặc không có container salon_postgres.\n'
        + '(Nếu dùng PostgreSQL tự cài với SALON_SKIP_DOCKER=1, xem nhật ký trong thư mục data của PostgreSQL.)';
    }
    case 'update': return tailFile(join(LOGS, 'update.log'), lines);
    case 'launcher': return tailFile(join(LOGS, 'launcher-ui.log'), lines);
    default: return '';
  }
}

// ------------------------------------------------------------------ HTTP
let lastSeen = Date.now();
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});
const okHost = (host = '') => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host);

/** Sau khi nối kho mã / đăng nhập GitHub: bỏ kết quả kiểm tra cũ và kiểm tra lại ngay. */
function afterGitFix() {
  latestCheck = null;
  localVersion(ROOT, { fresh: true });
  versionInfo(true).catch(() => undefined);
}

let checking = null; // gộp các lần kiểm tra trùng nhau (tự động + người dùng bấm) -> chỉ một lệnh git fetch chạy
async function versionInfo(fetchRemote) {
  if (fetchRemote) {
    checking ??= checkForUpdate(ROOT, { fetchRemote: true }).finally(() => { checking = null; });
    latestCheck = await checking;
  }
  const local = localVersion(ROOT);
  return { ...local, ...(latestCheck ?? {}), current: local.current, commit: local.commit, branch: local.branch, problem: local.problem ?? latestCheck?.problem ?? null };
}

const routes = {
  'GET /api/state': async () => ({
    launcher: { version: localVersion(ROOT).current, pid: process.pid, platform: process.platform },
    version: await versionInfo(false),
    app: await appStatus(),
    settings: settings(),
    task: task && { ...task, lines: task.lines.slice(-12) },
  }),
  'POST /api/check-update': async () => versionInfo(true),
  'GET /api/changelog': async () => readChangelog(ROOT),
  'POST /api/settings': async (body) => {
    const patch = {};
    if (body.mode === 'dev' || body.mode === 'serve') patch.mode = body.mode;
    if (typeof body.autoCheck === 'boolean') patch.autoCheck = body.autoCheck;
    if (typeof body.openOnReady === 'boolean') patch.openOnReady = body.openOnReady;
    if (typeof body.closeOnReady === 'boolean') patch.closeOnReady = body.closeOnReady;
    if (typeof body.autoStartWindows === 'boolean') setAutoStartWindows(body.autoStartWindows);
    saveSettings(patch);
    return settings();
  },
  'POST /api/start': async () => {
    const st = await appStatus();
    if (st.running) { openUrl(st.url); return { alreadyRunning: true, url: st.url }; }
    return startApp();
  },
  /** Áp dụng Thiết lập cửa hàng: máy chủ chỉ đọc backend/.env lúc khởi động -> dừng rồi bật lại. */
  'POST /api/restart': async () => {
    if (task?.running) throw Object.assign(new Error('Launcher đang bận một tác vụ khác'), { status: 409 });
    spawnSync(process.execPath, [LAUNCHER, 'stop'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
    task = null;
    return startApp();
  },
  'POST /api/repair-git': async () => {
    runTask('repair', ['repair-git'], { percentOf: (k, n) => Math.round((k / n) * 95), onSuccess: afterGitFix });
    return { started: true };
  },
  'POST /api/git-login': async () => {
    runTask('gitlogin', ['git-login'], { onSuccess: afterGitFix });
    return { started: true };
  },
  'POST /api/backup': async () => {
    runTask('backup', ['backup'], { percentOf: (k, n) => Math.round((k / n) * 90) });
    return { started: true };
  },
  'GET /api/shop-config': async () => {
    const text = existsSync(BACKEND_ENV) ? readFileSync(BACKEND_ENV, 'utf8') : '';
    const cfg = readShopConfig(text);
    return {
      ...cfg, banks: BANKS, configured: !!(cfg.values.BANK_BIN && cfg.values.BANK_ACCOUNT_NO), mode: settings().mode,
      // Part 2: việc cần làm trước khi mở bán (không gửi giá trị bí mật nào, chỉ đạt / chưa đạt)
      checks: readinessChecks(text).map(({ id, ok, level, label, fix }) => ({ id, ok, level, label, fix })),
    };
  },
  'POST /api/shop-config': async (body) => {
    const example = join(ROOT, 'backend', '.env.example');
    if (!existsSync(BACKEND_ENV) && existsSync(example)) copyFileSync(example, BACKEND_ENV);
    const text = existsSync(BACKEND_ENV) ? readFileSync(BACKEND_ENV, 'utf8') : '';
    const { errors, updates } = buildShopUpdates(body.values ?? {}, text);
    if (Object.keys(errors).length) return { ok: false, errors };
    if (Object.keys(updates).length) {
      writeFileSync(`${BACKEND_ENV}.bak`, text); // bản trước khi sửa, phòng khi cần khôi phục tay
      writeFileSync(BACKEND_ENV, upsertEnv(text, updates));
    }
    if (body.mode === 'serve' || body.mode === 'dev') saveSettings({ mode: body.mode });
    note(`Thiết lập cửa hàng: cập nhật ${Object.keys(updates).filter((k) => !/PASSWORD/.test(k)).join(', ') || 'không đổi'}`);
    const st = await appStatus();
    return { ok: true, changed: Object.keys(updates).length, restartNeeded: st.running && Object.keys(updates).length > 0 };
  },
  'POST /api/stop': async () => {
    const r = spawnSync(process.execPath, [LAUNCHER, 'stop'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
    if (task?.kind === 'start') task = null;
    return { stopped: r.status === 0, output: `${r.stdout}${r.stderr}`.trim() };
  },
  'POST /api/update': async (body) => {
    runTask('update', ['update', ...(body.force ? ['--force'] : [])], {
      percentOf: (k, n) => Math.round((k / n) * 95),
      // Cập nhật xong hệ thống đã tự chạy lại -> mở thẳng ứng dụng (như bấm BẮT ĐẦU)
      onSuccess: async () => {
        latestCheck = null;
        const st = await appStatus();
        if (st.running && settings().openOnReady) openUrl(st.url);
      },
    });
    return { started: true };
  },
  'GET /api/task': async () => task,
  /** Cửa sổ Launcher tự đóng sau khi hệ thống sẵn sàng -> thoát máy chủ Launcher luôn, không chờ 2 phút. */
  'POST /api/bye': async () => {
    setTimeout(() => {
      if (task?.running && task.kind !== 'start') return; // đang cập nhật: để vòng kiểm tra rảnh tự thoát sau
      note('Cửa sổ Launcher đã thu gọn sau khi hệ thống sẵn sàng — thoát. Hệ thống Salon vẫn chạy nền.');
      process.exit(0);
    }, 4000).unref();
    return { ok: true };
  },
  'POST /api/open': async (body) => {
    const st = await appStatus();
    if (body.target === 'backups') { mkdirSync(join(ROOT, 'backups'), { recursive: true }); openUrl(join(ROOT, 'backups')); return { ok: true }; }
    const target = { app: st.url, mail: 'http://localhost:1080', pgadmin: 'http://localhost:5050', docs: `http://localhost:${API_PORT}/api/docs` }[body.target];
    if (body.target === 'logs') openUrl(LOGS);
    else if (body.target === 'folder') openUrl(ROOT);
    else if (target) openUrl(target);
    return { ok: true };
  },
  'GET /api/device-info': async () => {
    const v = localVersion(ROOT);
    const st = await appStatus();
    const info = await deviceInfo(ROOT, {
      version: v.current, commit: v.commit, branch: v.branch,
      appStatus: st.running ? `đang chạy (${st.mode}) tại ${st.url}` : 'chưa chạy',
    });
    return { info, text: deviceInfoText(info) };
  },
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (!okHost(req.headers.host)) return json(res, 403, { message: 'Host không hợp lệ' });
    lastSeen = Date.now();

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = readFileSync(UI_FILE, 'utf8').replace('__LAUNCHER_TOKEN__', TOKEN);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
        'X-Frame-Options': 'DENY',
      });
      return res.end(html);
    }
    if (url.pathname === '/api/ping') return json(res, 200, { app: SIGNATURE, pid: process.pid });
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { message: 'Không tìm thấy' });
    if (req.headers['x-launcher-token'] !== TOKEN) return json(res, 401, { message: 'Thiếu mã phiên Launcher' });

    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const lines = Math.min(2000, Math.max(50, Number(url.searchParams.get('lines') ?? 400)));
      return json(res, 200, { source: url.searchParams.get('source'), text: logOf(url.searchParams.get('source'), lines) });
    }
    if (req.method === 'GET' && url.pathname === '/api/logs/export') {
      const v = localVersion(ROOT);
      const info = await deviceInfo(ROOT, { version: v.current, commit: v.commit, branch: v.branch });
      const zip = await buildLogBundle(ROOT, info, { 'postgres.log': logOf('database', 1000) });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="system_logs_${stamp}.zip"`,
        'Content-Length': zip.length,
      });
      return res.end(zip);
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json(res, 404, { message: 'Không tìm thấy' });
    const body = req.method === 'POST' ? await readBody(req) : {};
    return json(res, 200, await handler(body));
  } catch (e) {
    return json(res, e.status ?? 500, { message: e.message ?? String(e) });
  }
});

// ------------------------------------------------------------------ khởi động (một phiên duy nhất)
const launcherLog = createWriteStream(join(LOGS, 'launcher-ui.log'), { flags: 'a' });
const note = (msg) => { const line = `[${new Date().toISOString()}] ${msg}`; launcherLog.write(`${line}\n`); process.stdout.write(`${msg}\n`); };
const uiUrl = `http://127.0.0.1:${PORT}/`;
const wantOpen = !process.argv.includes('--no-open') && !AUTOSTART;

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    const other = await new Promise((resolve) => {
      http.get(`${uiUrl}api/ping`, { timeout: 1500 }, (r) => {
        let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { resolve(JSON.parse(b).app === SIGNATURE); } catch { resolve(false); } });
      }).on('error', () => resolve(false));
    });
    if (other) {
      note('Launcher đã mở sẵn — đưa cửa sổ lên.');
      if (wantOpen) openUrl(uiUrl, { appWindow: true });
      process.exit(0);
    }
    note(`[LỖI] Cổng ${PORT} đang bị chương trình khác chiếm. Đặt SALON_LAUNCHER_PORT=<cổng khác> rồi chạy lại.`);
    process.exit(1);
  }
  note(`[LỖI] ${e.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  note(`HoYoSalon Launcher đang chạy tại ${uiUrl} (đóng cửa sổ này hoặc để tự thoát khi không còn ai dùng).`);
  if (wantOpen) openUrl(uiUrl, { appWindow: true });
  // Kiểm tra bản mới ngay khi mở (chạy nền, không chặn giao diện) và lặp lại định kỳ
  const autoCheck = () => {
    if (!settings().autoCheck || task?.running) return;
    versionInfo(true).then((v) => { if (v.updateAvailable) note(`Có phiên bản mới ${v.latest ?? ''} (${v.behind} thay đổi).`); }).catch(() => undefined);
  };
  autoCheck();
  setInterval(autoCheck, AUTO_CHECK_MS).unref();
  if (AUTOSTART) {
    appStatus().then((st) => {
      if (st.running) { note('Tự khởi động: hệ thống đã chạy sẵn.'); return; }
      note('Tự khởi động cùng Windows: BẮT ĐẦU hệ thống.');
      startApp();
    }).catch((e) => note(`[LỖI] Tự khởi động: ${e.message}`));
  }
});

// Tự thoát khi không còn cửa sổ Launcher (giao diện gọi /api/state mỗi 1,5 giây). Hệ thống Salon vẫn chạy tiếp.
setInterval(() => {
  if (task?.running && (task.kind !== 'start' || AUTOSTART)) return;
  if (Date.now() - lastSeen > IDLE_EXIT_MS) {
    note('Không còn cửa sổ Launcher nào mở — thoát. Hệ thống Salon (nếu đang chạy) vẫn hoạt động.');
    process.exit(0);
  }
}, 10_000).unref();
