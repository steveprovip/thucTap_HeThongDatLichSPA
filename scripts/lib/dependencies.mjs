import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Customer installs must use the reviewed lockfile; a failing install must not resolve a different release. */
export async function installLockedDependencies(dir, label, { run, error = console.error }) {
  if (!existsSync(join(dir, 'package-lock.json'))) {
    error(`[LỖI] ${label}: thiếu package-lock.json. Người phát triển cần tạo và kiểm tra lockfile trước khi bàn giao.`);
    return false;
  }
  const result = await run(['ci', '--no-fund', '--no-audit', '--progress=false', '--prefer-offline'], { cwd: dir, label });
  if (result.status === 0) return true;
  error(`[LỖI] ${label}: npm ci thất bại. Kiểm tra log, Node.js, mạng và cặp package.json/package-lock.json; không tự đổi phiên bản gói.`);
  error(result.out.split('\n').slice(-25).join('\n'));
  return false;
}
