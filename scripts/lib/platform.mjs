/**
 * Khác biệt theo hệ điều hành mà Launcher cần xử lý. Node thuần, không cần gói npm.
 *
 * macOS: ứng dụng mở từ Finder / Dock / Launchpad KHÔNG đọc ~/.zshrc nên PATH chỉ có /usr/bin:/bin:/usr/sbin:/sbin.
 * Hậu quả: không thấy `docker` (Docker Desktop, Homebrew), `npm`, `git`, hoặc `docker compose up` báo
 * "error getting credentials - docker-credential-desktop: executable file not found in $PATH".
 * Bổ sung các thư mục công cụ quen thuộc vào CUỐI PATH (PATH của người dùng vẫn được ưu tiên).
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, posix } from 'node:path';

/** Thư mục công cụ thường gặp trên macOS (Homebrew Apple Silicon / Intel, Docker Desktop, trình cài Node.js chính thức). */
export const macToolDirs = (home = homedir()) => [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/Applications/Docker.app/Contents/Resources/bin',
  posix.join(home.replace(/\\/g, '/'), '.docker', 'bin'),
  '/Applications/Docker.app/Contents/Resources/cli-plugins',
];

/**
 * PATH đã bổ sung: thư mục chứa chính `node` đang chạy được đặt ĐẦU (để `npm` luôn khớp với `node`), các thư mục công
 * cụ macOS còn thiếu (và có thật trên đĩa) đặt CUỐI. Windows: giữ nguyên.
 */
export function withToolPath(currentPath = '', {
  platform = process.platform, execPath = process.execPath, home = homedir(), exists = existsSync,
} = {}) {
  if (platform === 'win32') return currentPath;
  const delim = platform === 'win32' ? ';' : ':';
  const parts = currentPath.split(delim).filter(Boolean);
  const have = new Set(parts);
  const nodeDir = (platform === 'win32' ? dirname(execPath) : posix.dirname(execPath.replace(/\\/g, '/')));
  const head = have.has(nodeDir) ? [] : [nodeDir];
  const tail = platform === 'darwin'
    ? macToolDirs(home).filter((d) => !have.has(d) && exists(d))
    : [];
  return [...head, ...parts, ...tail].join(delim);
}

/** Gọi một lần ở đầu mỗi tiến trình Launcher: mọi tiến trình con (docker, npm, git) thừa hưởng PATH đầy đủ. */
export function ensureToolPath() {
  if (process.platform === 'win32') return;
  process.env.PATH = withToolPath(process.env.PATH ?? '');
}

/** Trình duyệt Chromium trên macOS có chế độ cửa sổ ứng dụng (--app, không thanh địa chỉ) cho cửa sổ Launcher. */
export const macAppBrowsers = (home = homedir()) => {
  const normHome = home.replace(/\\/g, '/');
  return [
    ['Google Chrome', 'Google Chrome'],
    ['Microsoft Edge', 'Microsoft Edge'],
    ['Brave Browser', 'Brave Browser'],
    ['Chromium', 'Chromium'],
  ].flatMap(([app, bin]) => [
    `/Applications/${app}.app/Contents/MacOS/${bin}`,
    posix.join(normHome, 'Applications', `${app}.app`, 'Contents', 'MacOS', bin),
  ]);
};

/**
 * Dịch vụ Docker cần dựng. PostgreSQL luôn cần; Maildev (hộp thư ảo) chỉ khi thư gửi đi vào máy này (SMTP_HOST rỗng / localhost).
 * PgAdmin (image ~0,5 GB, chỉ để xem CSDL bằng tay) KHÔNG tự dựng: tải nó từng chiếm phần lớn thời gian chạy lần đầu.
 * `forced` (SALON_DOCKER_SERVICES=postgres,maildev,pgadmin) ghi đè.
 */
export function composeServices({ smtpHost = '', forced = '' } = {}) {
  const list = String(forced).split(',').map((x) => x.trim()).filter(Boolean);
  if (list.length) return list;
  return ['postgres', ...(['', 'localhost', '127.0.0.1', 'maildev'].includes(String(smtpHost).trim().toLowerCase()) ? ['maildev'] : [])];
}
