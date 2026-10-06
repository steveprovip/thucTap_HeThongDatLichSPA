#!/usr/bin/env node
/**
 * Sắp xếp lại nhánh Git theo mô hình của dự án (Mentor Sprint 2 · mục 1, xem docs/guides/git/GIT-BRANCHING.md):
 *   main (Production) · develop (Staging) · feature/* · fix/* · docs/* (+ hotfix/*, release/* khi cần).
 *
 *   node scripts/git/branch-cleanup.mjs            XEM TRƯỚC (không thay đổi gì)
 *   node scripts/git/branch-cleanup.mjs --apply    thực hiện trên kho mã GitHub (origin)
 *
 * Với mỗi nhánh trên origin, trừ main / develop:
 *   1. Gắn thẻ lưu trữ  archive/<tên-nhánh>  trỏ đúng commit cuối của nhánh (KHÔNG mất lịch sử, khôi phục được:
 *      git checkout -b <tên-nhánh> archive/<tên-nhánh>).
 *   2. Xoá nhánh trên origin (và nhánh cùng tên ở máy nếu đã hợp nhất).
 * Nhánh CHƯA hợp nhất vào main vẫn được lưu trữ như trên nhưng được liệt kê riêng để chủ dự án biết.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');
const KEEP = new Set(['main', 'develop', 'HEAD']);

const git = (args, { check = true } = {}) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (check && r.status !== 0) throw new Error(`git ${args.join(' ')}\n${r.stderr}`);
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};

git(['fetch', '--prune', '--tags', 'origin']);
const remote = git(['for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/origin']).out.split('\n').filter((b) => b && !KEEP.has(b));
const local = new Set(git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).out.split('\n').filter(Boolean));

if (!remote.length) {
  console.log('Kho mã đã gọn: chỉ còn main và develop.');
  process.exit(0);
}

console.log(APPLY ? '== THỰC HIỆN sắp xếp nhánh ==' : '== XEM TRƯỚC (thêm --apply để thực hiện) ==');
const unmerged = [];
for (const b of remote) {
  const merged = git(['merge-base', '--is-ancestor', `origin/${b}`, 'origin/main'], { check: false }).ok;
  if (!merged) unmerged.push(b);
  const tag = `archive/${b}`;
  console.log(`- ${b.padEnd(34)} ${merged ? 'đã hợp nhất vào main' : 'CHƯA hợp nhất      '} -> thẻ ${tag}, xoá nhánh`);
  if (!APPLY) continue;
  if (!git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { check: false }).ok) {
    git(['tag', '-a', tag, `origin/${b}`, '-m', `Lưu trữ nhánh ${b} trước khi sắp xếp lại nhánh (Mentor Sprint 2)`]);
  }
  git(['push', 'origin', `refs/tags/${tag}`]);
  git(['push', 'origin', '--delete', b]);
  if (local.has(b) && merged) git(['branch', '-d', b], { check: false });
}
if (unmerged.length) {
  console.log(`\nNhánh chưa hợp nhất (đã lưu trữ bằng thẻ archive/*, khôi phục được bất cứ lúc nào): ${unmerged.join(', ')}`);
}
console.log(APPLY ? '\nXong. Kho mã còn main + develop; lịch sử cũ nằm ở các thẻ archive/*.' : '\nChưa thay đổi gì.');
