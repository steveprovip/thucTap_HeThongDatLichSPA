/**
 * macOS: tạo ứng dụng "Hương Sen Salon.app" (AppleScript applet) trong ~/Applications — bấm là mở Launcher,
 * KHÔNG có cửa sổ Terminal (tương đương lối tắt .vbs trên Windows). Kéo ứng dụng vào Dock để dùng hằng ngày.
 *
 *   node scripts/lib/macos-app.mjs        tạo / tạo lại ứng dụng (HoYoSalon.command gọi tự động ở lần chạy đầu)
 *
 * Đường dẫn node được ghi cứng vào ứng dụng vì ứng dụng mở từ Finder không có PATH của Terminal.
 * Chỉ dùng `osacompile` có sẵn của macOS — không cần cài thêm gì.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APP_NAME = 'Hương Sen Salon.app';

/** Chuỗi AppleScript an toàn: thoát \ và ". */
export const asString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Mã AppleScript: chạy Launcher nền, ghi nhật ký logs/launcher-ui.log; `quoted form of` lo mọi khoảng trắng / dấu trong đường dẫn. */
export function appleScriptSource(root, nodePath) {
  return [
    `set rootDir to ${asString(root)}`,
    `set nodeBin to ${asString(nodePath)}`,
    'do shell script "mkdir -p " & quoted form of (rootDir & "/logs") & " && cd " & quoted form of rootDir'
      + ' & " && " & quoted form of nodeBin & " scripts/hoyo/launcher-ui.mjs >> logs/launcher-ui.log 2>&1 &"',
    '',
  ].join('\n');
}

/**
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
export function createMacApp({
  root, nodePath = process.execPath, home = homedir(), platform = process.platform, run = spawnSync,
} = {}) {
  if (platform !== 'darwin') return { ok: false, error: 'Chỉ dành cho macOS' };
  const dir = join(home, 'Applications');
  const app = join(dir, APP_NAME);
  const tmp = mkdtempSync(join(tmpdir(), 'salon-app-'));
  try {
    mkdirSync(dir, { recursive: true });
    const src = join(tmp, 'launcher.applescript');
    writeFileSync(src, appleScriptSource(root, nodePath), 'utf8');
    if (existsSync(app)) rmSync(app, { recursive: true, force: true });
    const r = run('osacompile', ['-o', app, src], { encoding: 'utf8', timeout: 30_000 });
    if (r.error || r.status !== 0) return { ok: false, error: (r.error?.message ?? r.stderr ?? 'osacompile thất bại').toString().trim() };
    return { ok: true, path: app };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = createMacApp({ root });
  if (r.ok) console.log(`Đã tạo ${r.path} — kéo vào Dock để mở nhanh.`);
  else { console.error(`Không tạo được ứng dụng macOS: ${r.error}`); process.exitCode = 1; }
}
