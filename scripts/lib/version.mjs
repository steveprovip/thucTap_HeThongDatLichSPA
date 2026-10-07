/**
 * Phiên bản của hệ thống và kiểm tra bản mới — dùng chung cho Launcher giao diện (scripts/hoyo) và scripts/update.mjs.
 *
 * Nguồn sự thật:
 *   - Phiên bản đang chạy  : thẻ Git gần nhất trên HEAD (vX.Y.Z), không có thì "version" trong package.json gốc.
 *   - Phiên bản mới nhất   : thẻ vX.Y.Z lớn nhất trên kho mã (git ls-remote), dự phòng GitHub Releases API.
 *   - Có bản mới khi       : thẻ mới lớn hơn bản đang chạy, HOẶC nhánh main ở kho mã đã có commit mới.
 * Chỉ dùng Node thuần + lệnh git có sẵn (không cần gói npm) để launcher chạy được cả khi node_modules hỏng.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

export const parseSemver = (v) => {
  const m = SEMVER.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** So sánh hai phiên bản: >0 nếu a mới hơn b. Chuỗi không hợp lệ coi như nhỏ nhất. */
export const compareSemver = (a, b) => {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/** Thẻ vX.Y.Z lớn nhất trong danh sách (bỏ thẻ không đúng dạng). */
export const latestTag = (tags) => tags.filter((t) => parseSemver(t)).sort(compareSemver).pop() ?? null;

/**
 * Chạy git. `-c safe.directory=<thư mục>`: thư mục dự án chép từ máy / ổ đĩa / tài khoản khác sang có chủ sở hữu khác,
 * git ≥ 2.35.2 từ chối ("detected dubious ownership") và MỌI lệnh git đều thất bại -> Launcher hiện commit "—".
 * Đây là thư mục của chính dự án nên cho phép tường minh (chỉ tác dụng với lần chạy này).
 */
export const gitRun = (root, args, timeout = 20_000, env = {}) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], {
    cwd: root, encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
  });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: `${r.stderr ?? ''} ${r.error?.message ?? ''}`.trim(), missing: r.error?.code === 'ENOENT' };
};
const git = (root, args, timeout = 20_000) => { const r = gitRun(root, args, timeout); return r.ok ? r.out : null; };

/** Phân loại lỗi git để báo ĐÚNG nguyên nhân (trước đây mọi lỗi đều bị báo là "kiểm tra Internet"). */
export function classifyGitError(text = '', { missing = false } = {}) {
  const t = String(text);
  if (missing || /git(\.exe)?'? is not recognized|command not found|ENOENT/i.test(t)) return 'no-git';
  if (/dubious ownership/i.test(t)) return 'dubious';
  if (/not a git repository/i.test(t)) return 'no-repo';
  if (/authentication failed|could not read username|terminal prompts disabled|invalid username or password|repository not found|returned error: (401|403|404)|permission denied \(publickey\)|access denied|http 40[134]/i.test(t)) return 'auth';
  if (/could not resolve host|failed to connect|timed out|timeout|connection (refused|reset)|network is unreachable|ssl|proxy|early eof|unexpected disconnect|unable to access/i.test(t)) return 'network';
  return 'unknown';
}

/** Nguyên nhân + cách xử lý bằng tiếng Việt cho từng loại lỗi. `action` = nút sửa nhanh trong Launcher (nếu có). */
export const PROBLEMS = {
  'no-repo': {
    message: 'Thư mục này không phải bản git clone (thường do chép thư mục hoặc giải nén .zip) nên chưa nối được với kho mã.',
    fix: 'Bấm "Sửa kết nối cập nhật": Launcher nối thư mục với kho mã, giữ nguyên dữ liệu và cấu hình (.env, backups).',
    action: 'repair-git',
  },
  'no-git': {
    message: 'Máy chưa cài Git (hoặc Launcher không tìm thấy lệnh git).',
    fix: 'Cài Git từ git-scm.com (chọn mặc định), đóng và mở lại Launcher.',
  },
  auth: {
    message: 'Kho mã ở chế độ riêng tư (private) và máy này chưa đăng nhập GitHub (có mạng nhưng GitHub từ chối).',
    fix: 'Bấm "Đăng nhập GitHub" và đăng nhập một lần bằng tài khoản được cấp quyền đọc kho mã. Hoặc nhờ chủ kho chuyển kho sang public.',
    action: 'git-login',
  },
  network: {
    message: 'Không kết nối được máy chủ GitHub (mạng, VPN, proxy hoặc tường lửa chặn).',
    fix: 'Thử mở https://github.com bằng trình duyệt trên máy này. Công ty / trường học có thể chặn cổng 443 tới GitHub.',
  },
  dubious: {
    message: 'Git từ chối thư mục vì khác chủ sở hữu (dubious ownership).',
    fix: 'Chạy một lần: git config --global --add safe.directory "*"',
  },
  unknown: {
    message: 'Git báo lỗi chưa xác định khi kết nối kho mã.',
    fix: 'Xem chi tiết lỗi bên dưới (Chẩn đoán thiết bị) và gửi cho kỹ thuật viên.',
  },
};
export const problemOf = (code, detail = '') => ({ code, ...PROBLEMS[code] ?? PROBLEMS.unknown, detail: String(detail).split('\n').slice(-3).join(' ').slice(0, 400) });

export function packageVersion(root) {
  try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
}

const localCache = new Map();
/** Thông tin bản đang chạy (không cần mạng). Nhớ kết quả 5 giây: giao diện hỏi mỗi 1,5 giây, mỗi lần hỏi trước đây tốn 8+ tiến trình git. */
export function localVersion(root, { fresh = false } = {}) {
  const hit = localCache.get(root);
  if (!fresh && hit && Date.now() - hit.at < 5000) return hit.value;
  const isRepo = existsSync(join(root, '.git'));
  const tag = isRepo ? git(root, ['describe', '--tags', '--abbrev=0', '--match', 'v*']) : null;
  const pkg = packageVersion(root);
  // Lấy số lớn hơn giữa thẻ Git và package.json (bản phát triển có thể đã nâng package.json trước khi gắn thẻ)
  const current = [tag, pkg && `v${pkg}`].filter(Boolean).sort(compareSemver).pop() ?? 'v0.0.0';
  const head = isRepo ? gitRun(root, ['rev-parse', '--short', 'HEAD']) : null;
  const value = {
    current,
    commit: head?.ok ? head.out : null,
    branch: head?.ok ? git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) : null,
    commitDate: head?.ok ? git(root, ['log', '-1', '--format=%cI']) : null,
    isRepo,
    // Vì sao không đọc được git (hiện "—" ở commit / nhánh): không phải git clone, thiếu git, git từ chối thư mục...
    problem: !isRepo ? problemOf('no-repo') : head?.ok ? null : problemOf(classifyGitError(head?.err, { missing: head?.missing }), head?.err),
  };
  localCache.set(root, { at: Date.now(), value });
  return value;
}

/** owner/repo của remote origin trên GitHub (https hoặc ssh), null nếu không phải GitHub. */
export function githubRepo(root) {
  const url = git(root, ['remote', 'get-url', 'origin']) ?? '';
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

const fetchJson = (url, timeoutMs = 6000) => new Promise((resolve) => {
  const req = https.get(url, { headers: { 'User-Agent': 'salon-launcher', Accept: 'application/vnd.github+json' }, timeout: timeoutMs }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => { try { resolve({ status: res.statusCode ?? 0, json: res.statusCode === 200 ? JSON.parse(body) : null }); } catch { resolve({ status: res.statusCode ?? 0, json: null }); } });
  });
  req.on('timeout', () => req.destroy());
  req.on('error', () => resolve({ status: 0, json: null }));
});

/**
 * Kiểm tra bản mới. fetchRemote=false chỉ trả thông tin tại máy (dùng khi mở launcher, không chờ mạng).
 * @returns {{ current, latest, updateAvailable, canUpdate, behind, branch, commit, remoteReachable, source, checkedAt, notes, problem }}
 *   problem = null khi ổn; ngược lại { code, message, fix, action?, detail } để giao diện báo đúng nguyên nhân.
 */
export async function checkForUpdate(root, { fetchRemote = true } = {}) {
  const local = localVersion(root, { fresh: true });
  const out = {
    ...local,
    latest: null,
    updateAvailable: false,
    canUpdate: false,
    behind: 0,
    remoteReachable: false,
    source: null,
    checkedAt: new Date().toISOString(),
    notes: null,
  };
  out.problem = local.problem ?? null;
  if (!fetchRemote || !local.isRepo || local.problem) return out;

  const ls = gitRun(root, ['ls-remote', '--tags', '--refs', 'origin', 'v*'], 25_000);
  if (ls.ok) {
    out.remoteReachable = true;
    out.source = 'git';
    out.latest = latestTag(ls.out.split('\n').map((l) => l.split('refs/tags/')[1]).filter(Boolean));
    const fetched = gitRun(root, ['fetch', '--quiet', 'origin', 'main'], 45_000);
    if (fetched.ok) out.behind = Number(git(root, ['rev-list', '--count', 'HEAD..origin/main']) ?? 0) || 0;
    else out.problem = problemOf(classifyGitError(fetched.err), fetched.err);
  } else {
    let code = classifyGitError(ls.err, { missing: ls.missing });
    const repo = githubRepo(root);
    const api = repo ? await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`) : { status: 0, json: null };
    if (api.json?.tag_name) {
      out.remoteReachable = true;
      out.source = 'github';
      out.latest = api.json.tag_name;
      out.notes = typeof api.json.body === 'string' ? api.json.body.slice(0, 4000) : null;
    } else {
      // GitHub trả 404 cho kho riêng tư khi không có quyền: có mạng nhưng bị từ chối, KHÔNG phải mất Internet
      if (code === 'unknown' && api.status === 404) code = 'auth';
      out.problem = problemOf(code, ls.err);
    }
  }
  out.updateAvailable = (!!out.latest && compareSemver(out.latest, out.current) > 0) || (out.branch === 'main' && out.behind > 0);
  // Cập nhật 1 chạm chỉ chạy trên nhánh main (máy tiệm). Máy lập trình (develop/feature) chỉ được báo, không tự kéo mã.
  out.canUpdate = out.updateAvailable && out.branch === 'main';
  return out;
}

/**
 * Đọc CHANGELOG.md (chuẩn Keep a Changelog): "## [1.4.0] - 2026-10-06", "### Thêm mới", "- mục".
 * @returns {{ version: string, date: string | null, sections: { title: string, items: string[] }[] }[]}
 */
export function readChangelog(root, limit = 20) {
  let text = '';
  try { text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8'); } catch { return []; }
  const releases = [];
  let rel = null;
  let sec = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h2 = /^##\s+\[?v?([\d.]+[^\]\s]*)\]?(?:\s*[-–]\s*(\S+))?/.exec(line);
    if (h2) {
      rel = { version: `v${h2[1]}`, date: h2[2] ?? null, sections: [] };
      releases.push(rel);
      sec = null;
      continue;
    }
    if (!rel) continue;
    const h3 = /^###\s+(.+)/.exec(line);
    if (h3) { sec = { title: h3[1].trim(), items: [] }; rel.sections.push(sec); continue; }
    const item = /^\s*[-*]\s+(.+)/.exec(line);
    if (item) {
      if (!sec) { sec = { title: 'Thay đổi', items: [] }; rel.sections.push(sec); }
      sec.items.push(item[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'));
    }
  }
  return releases.slice(0, limit);
}
