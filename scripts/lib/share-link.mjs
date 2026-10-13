// Ghi chú test 13/10 — "đưa sản phẩm lên mạng, có đường link riêng, mở bằng mọi thiết bị" — 1 chạm trong HoYoSalon:
//  - Cloudflare Quick Tunnel: link HTTPS công khai (https://<ngẫu nhiên>.trycloudflare.com) tới hệ thống đang chạy trên máy này,
//    KHÔNG cần tài khoản / tên miền, miễn phí; mở được trên điện thoại, laptop, máy tính bảng ở bất kỳ đâu.
//  - Tự tải cloudflared (bản chính chủ của Cloudflare trên GitHub) vào tools\ nếu máy chưa có.
//  - Chạy tách khỏi Launcher (đóng Launcher vẫn giữ link); trạng thái lưu ở .salon-share.json, nhật ký logs\share-tunnel.log.
// Giới hạn (Cloudflare ghi rõ): địa chỉ ĐỔI mỗi lần mở lại, không cam kết hoạt động liên tục — để thử nghiệm / trình diễn.
// Link CỐ ĐỊNH chạy 24/7: docs/TRIEN-KHAI.md (Cloudflare Tunnel có tên miền riêng, hoặc Render + Neon + Cloudflare Pages).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IS_WIN = process.platform === 'win32';
const STATE = (root) => join(root, '.salon-share.json');
const LOG = (root) => join(root, 'logs', 'share-tunnel.log');
export const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** Bản cloudflared cho máy này (chỉ tải tự động trên Windows / Linux x64; macOS: brew install cloudflared). */
export function cloudflaredAsset(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return arch === 'arm64' ? null : 'cloudflared-windows-amd64.exe';
  if (platform === 'linux') return arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
  return null;
}

export function findCloudflared(root, env = process.env) {
  const exe = IS_WIN ? 'cloudflared.exe' : 'cloudflared';
  const candidates = [env.CLOUDFLARED_PATH, join(root, 'tools', exe), IS_WIN ? 'C:\\Cloudflared\\bin\\cloudflared.exe' : null].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const r = spawnSync(IS_WIN ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout.split(/\r?\n/)[0] || '').trim() || null : null;
}

/** Có sẵn thì dùng; chưa có thì tải bản mới nhất từ GitHub chính chủ của Cloudflare rồi chạy thử `--version`. */
export async function ensureCloudflared(root, log = () => {}) {
  const found = findCloudflared(root);
  if (found) return found;
  const asset = cloudflaredAsset();
  if (!asset) throw new Error('Máy này cần tự cài cloudflared (macOS: brew install cloudflared) rồi bấm lại.');
  const dir = join(root, 'tools');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, IS_WIN ? 'cloudflared.exe' : 'cloudflared');
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  log(`Tải cloudflared (chương trình tạo đường hầm của Cloudflare, ~60 MB) từ ${url} ...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Không tải được cloudflared (HTTP ${res.status}). Kiểm tra mạng rồi bấm lại.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000_000) throw new Error('Tệp cloudflared tải về không hợp lệ (quá nhỏ). Bấm lại để tải lại.');
  writeFileSync(`${dest}.part`, buf, { mode: 0o755 });
  renameSync(`${dest}.part`, dest);
  const v = spawnSync(dest, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (v.status !== 0) { rmSync(dest, { force: true }); throw new Error('cloudflared tải về không chạy được trên máy này.'); }
  log(`Đã cài ${v.stdout.trim().split('\n')[0]}`);
  return dest;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Trạng thái link đang chia sẻ (null = chưa mở / đã đóng). */
export function shareStatus(root) {
  try {
    const s = JSON.parse(readFileSync(STATE(root), 'utf8'));
    if (s?.pid && alive(s.pid)) return s;
  } catch { /* chưa có */ }
  return null;
}

/** Đọc địa chỉ trycloudflare trong nhật ký cloudflared (cloudflared in ra stderr khi đường hầm sẵn sàng). */
export function tunnelUrlFrom(text, since = 0) {
  return TUNNEL_URL_RE.exec(text.slice(since))?.[0] ?? null;
}

/**
 * Mở link công khai tới `target` (vd. http://localhost:3000 khi chạy chế độ máy chủ, http://localhost:5173 khi trình diễn).
 * Đợi tối đa ~45 giây để Cloudflare cấp địa chỉ.
 */
export async function startShare(root, target, log = () => {}) {
  const cur = shareStatus(root);
  if (cur) return cur;
  const bin = await ensureCloudflared(root, log);
  mkdirSync(join(root, 'logs'), { recursive: true });
  const logFile = LOG(root);
  const offset = existsSync(logFile) ? statSync(logFile).size : 0;
  const fd = openSync(logFile, 'a');
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', target], { detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
  child.unref();
  log(`Đang mở đường hầm tới ${target} ...`);
  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (!alive(child.pid)) throw new Error('cloudflared dừng trước khi mở được link (mạng / tường lửa chặn cổng 7844?). Xem logs\\share-tunnel.log');
    let text = '';
    try { text = readFileSync(logFile, 'utf8'); } catch { /* chưa ghi */ }
    const url = tunnelUrlFrom(text, offset);
    if (url) {
      const state = { pid: child.pid, url, target, startedAt: new Date().toISOString() };
      writeFileSync(STATE(root), JSON.stringify(state, null, 2));
      return state;
    }
  }
  try { process.kill(child.pid); } catch { /* đã thoát */ }
  throw new Error('Cloudflare chưa cấp được địa chỉ sau 45 giây. Thử lại sau ít phút.');
}

export function stopShare(root) {
  const s = shareStatus(root);
  if (s) {
    if (IS_WIN) spawnSync('taskkill', ['/PID', String(s.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(s.pid); } catch { /* đã thoát */ } }
  }
  rmSync(STATE(root), { force: true });
  return { stopped: !!s };
}

/** Mã QR (SVG, data URI) để quét bằng điện thoại — dùng thư viện qrcode đã có trong frontend. */
export async function qrDataUri(root, text) {
  try {
    const QR = createRequire(join(root, 'frontend', 'package.json'))('qrcode');
    const svg = await QR.toString(text, { type: 'svg', margin: 1, width: 220 });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Tài khoản MẪU còn mật khẩu mặc định (công khai trong README) — mở ra Internet là ai cũng đăng nhập được.
 * Gọi lệnh có sẵn `npm run security:check` của backend (mã thoát 3 = còn tài khoản mẫu).
 */
export function demoAccountsExposed(root) {
  return new Promise((resolve) => {
    const child = spawn(IS_WIN ? 'npm.cmd' : 'npm', ['run', 'security:check', '--silent'], { cwd: join(root, 'backend'), windowsHide: true, shell: IS_WIN });
    let out = '';
    child.stdout?.on('data', (c) => { out += c; });
    child.on('exit', (code) => resolve({ exposed: code === 3, emails: (out.match(/[\w.+-]+@salon\.vn/g) ?? []).filter((e, i, a) => a.indexOf(e) === i) }));
    child.on('error', () => resolve({ exposed: false, emails: [] }));
  });
}
