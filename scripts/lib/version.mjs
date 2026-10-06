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

const git = (root, args, timeout = 20_000) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
};

export function packageVersion(root) {
  try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
}

/** Thông tin bản đang chạy (không cần mạng). */
export function localVersion(root) {
  const isRepo = existsSync(join(root, '.git'));
  const tag = isRepo ? git(root, ['describe', '--tags', '--abbrev=0', '--match', 'v*']) : null;
  const pkg = packageVersion(root);
  // Lấy số lớn hơn giữa thẻ Git và package.json (bản phát triển có thể đã nâng package.json trước khi gắn thẻ)
  const current = [tag, pkg && `v${pkg}`].filter(Boolean).sort(compareSemver).pop() ?? 'v0.0.0';
  return {
    current,
    commit: isRepo ? git(root, ['rev-parse', '--short', 'HEAD']) : null,
    branch: isRepo ? git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) : null,
    commitDate: isRepo ? git(root, ['log', '-1', '--format=%cI']) : null,
    isRepo,
  };
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
    res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); } });
  });
  req.on('timeout', () => req.destroy());
  req.on('error', () => resolve(null));
});

/**
 * Kiểm tra bản mới. fetchRemote=false chỉ trả thông tin tại máy (dùng khi mở launcher, không chờ mạng).
 * @returns {{ current, latest, updateAvailable, behind, branch, commit, remoteReachable, source, checkedAt, notes }}
 */
export async function checkForUpdate(root, { fetchRemote = true } = {}) {
  const local = localVersion(root);
  const out = {
    ...local,
    latest: null,
    updateAvailable: false,
    behind: 0,
    remoteReachable: false,
    source: null,
    checkedAt: new Date().toISOString(),
    notes: null,
  };
  if (!fetchRemote || !local.isRepo) return out;

  const lsRemote = git(root, ['ls-remote', '--tags', '--refs', 'origin', 'v*'], 25_000);
  if (lsRemote !== null) {
    out.remoteReachable = true;
    out.source = 'git';
    out.latest = latestTag(lsRemote.split('\n').map((l) => l.split('refs/tags/')[1]).filter(Boolean));
    if (git(root, ['fetch', '--quiet', 'origin', 'main'], 45_000) !== null) {
      out.behind = Number(git(root, ['rev-list', '--count', 'HEAD..origin/main']) ?? 0) || 0;
    }
  } else {
    const repo = githubRepo(root);
    const rel = repo ? await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`) : null;
    if (rel?.tag_name) {
      out.remoteReachable = true;
      out.source = 'github';
      out.latest = rel.tag_name;
      out.notes = typeof rel.body === 'string' ? rel.body.slice(0, 4000) : null;
    }
  }
  out.updateAvailable = (!!out.latest && compareSemver(out.latest, out.current) > 0) || (out.branch === 'main' && out.behind > 0);
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
