/**
 * Sửa kết nối cập nhật cho máy có thư mục dự án KHÔNG phải git clone (chép thư mục / giải nén .zip), và đăng nhập
 * GitHub một lần cho kho riêng tư. Node thuần; dùng chung gitRun / classifyGitError của lib/version.mjs.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyGitError, gitRun, problemOf } from './version.mjs';

/** Kho mã chính thức; ghi đè bằng package.json "repository" hoặc tham số origin. */
export const DEFAULT_ORIGIN = 'https://github.com/steveprovip/thucTap_HeThongDatLichSPA.git';

export function originFromPackage(root) {
  try {
    const repo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).repository;
    const url = typeof repo === 'string' ? repo : repo?.url;
    return url ? String(url).replace(/^git\+/, '') : null;
  } catch { return null; }
}

/**
 * Biến thư mục thường thành bản git clone: git init -> remote -> fetch -> đưa mã về đúng origin/main.
 * Giữ nguyên tệp không theo dõi bởi git (backend/.env, backups/, logs/, node_modules). Sửa tay vào tệp mã nguồn (nếu có)
 * được lưu thành logs/adopt-*.patch trước khi ghi đè (khôi phục: git apply -R <tệp>).
 * @returns {{ ok: boolean, problem?: object, error?: string, commit?: string, patch?: string }}
 */
export function adoptRepo(root, { origin, log = () => {}, timeoutMs = 300_000 } = {}) {
  if (existsSync(join(root, '.git'))) return { ok: false, error: 'Thư mục này đã là kho git, không cần sửa.' };
  const url = origin ?? originFromPackage(root) ?? DEFAULT_ORIGIN;
  const run = (args, t = 30_000) => gitRun(root, args, t);
  const undo = () => rmSync(join(root, '.git'), { recursive: true, force: true });

  log('[1/4] Khởi tạo kho git tại thư mục này ...');
  if (!run(['init', '--quiet']).ok) return { ok: false, problem: problemOf('no-git') };
  run(['symbolic-ref', 'HEAD', 'refs/heads/main']); // git < 2.28 chưa có "init -b"
  run(['remote', 'add', 'origin', url]);

  log(`[2/4] Tải mã từ ${url} (có thể mất 1–3 phút) ...`);
  const fetched = run(['fetch', '--quiet', '--tags', '--force', 'origin', 'main'], timeoutMs);
  if (!fetched.ok) {
    undo(); // chưa đụng tới tệp nào của dự án: gỡ kho vừa tạo để máy trở lại như cũ
    return { ok: false, problem: problemOf(classifyGitError(fetched.err, { missing: fetched.missing }), fetched.err) };
  }

  log('[3/4] Đối chiếu với bản trên kho mã ...');
  run(['reset', '--quiet', '--mixed', 'origin/main']);
  const diff = run(['diff'], 60_000);
  let patch;
  if (diff.out) {
    mkdirSync(join(root, 'logs'), { recursive: true });
    patch = join(root, 'logs', `adopt-${new Date().toISOString().replace(/[:.]/g, '-')}.patch`);
    writeFileSync(patch, `${diff.out}\n`);
  }

  log('[4/4] Đưa mã nguồn về đúng bản main (dữ liệu, .env và sao lưu giữ nguyên) ...');
  const reset = run(['reset', '--quiet', '--hard', 'origin/main'], 120_000);
  if (!reset.ok) return { ok: false, error: `Không áp dụng được mã mới: ${reset.err}`, patch };
  run(['branch', '--set-upstream-to=origin/main', 'main']);
  return { ok: true, commit: run(['rev-parse', '--short', 'HEAD']).out, patch };
}

/** Đăng nhập GitHub một lần (Git Credential Manager mở cửa sổ đăng nhập); các lần sau tự dùng thông tin đã lưu. */
export function gitLogin(root, { timeoutMs = 240_000 } = {}) {
  const r = gitRun(root, ['ls-remote', '--heads', 'origin', 'main'], timeoutMs, { GIT_TERMINAL_PROMPT: '1', GCM_INTERACTIVE: 'always' });
  return r.ok ? { ok: true } : { ok: false, problem: problemOf(classifyGitError(r.err, { missing: r.missing }), r.err) };
}
