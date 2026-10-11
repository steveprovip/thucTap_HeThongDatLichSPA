/**
 * Part 2 (bàn giao cho chủ tiệm) — kiểm tra môi trường & giữ cấu hình tiệm qua mỗi lần cập nhật. Node thuần.
 *
 *  - readinessChecks(envText)  : danh sách việc cần làm trước khi mở bán (tên tiệm, hotline, VietQR, Gmail, khoá JWT…)
 *  - mergeNewEnvKeys(env, ex)  : bản mới thêm biến cấu hình (vd. BOOKING_REQUIRE_EMAIL, AI_PROVIDER) → chép vào
 *                                backend/.env dưới dạng DÒNG GHI CHÚ "#KEY=giá-trị-mẫu": không đổi hành vi, không đụng
 *                                dòng nào của tiệm, nhưng chủ tiệm / Launcher thấy tuỳ chọn mới để bật.
 *  - snapshotEnvFile(root)     : chụp backend/.env vào backups/env/ trước khi cập nhật (giữ 10 bản mới nhất).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from './shop-config.mjs';

const KEY_LINE = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/;
const DEFAULT_NAME = 'Salon & Spa Hương Sen';
const PLACEHOLDER_JWT = /^(doi_chuoi_nay_trong_moi_truong_that_\w*|dev_\w*_secret|)$/;

/** Khoá có trong .env (kể cả dòng đã ghi chú "#KEY=") — để không chép trùng tuỳ chọn chủ tiệm đã chủ động tắt. */
const knownKeys = (text) => new Set(String(text).split(/\r?\n/).map((l) => KEY_LINE.exec(l)?.[1]).filter(Boolean));

export function mergeNewEnvKeys(envText, exampleText) {
  const have = knownKeys(envText);
  const lines = String(exampleText).split(/\r?\n/);
  const block = [];
  const added = [];
  for (let i = 0; i < lines.length; i += 1) {
    const key = KEY_LINE.exec(lines[i])?.[1];
    if (!key || have.has(key)) continue;
    // Kèm các dòng chú thích ngay phía trên (giải thích tuỳ chọn), bỏ tiêu đề nhóm "# ===== … ====="
    const notes = [];
    for (let j = i - 1; j >= 0 && /^\s*#/.test(lines[j]) && !KEY_LINE.test(lines[j]); j -= 1) {
      if (!/^#\s*=====/.test(lines[j])) notes.unshift(lines[j]);
    }
    if (notes.length && !block.includes(notes[0])) block.push(...notes);
    block.push(`#${lines[i].replace(/^\s*#?\s*/, '')}`);
    added.push(key);
    have.add(key);
  }
  if (!added.length) return { text: envText, added };
  const eol = String(envText).includes('\r\n') ? '\r\n' : '\n';
  const base = String(envText);
  const sep = base === '' || base.endsWith('\n') ? '' : eol;
  const header = '# ===== Tuỳ chọn mới từ bản cập nhật (đang TẮT — bỏ dấu # đầu dòng để dùng) =====';
  return { text: `${base}${sep}${eol}${header}${eol}${block.join(eol)}${eol}`, added };
}

/**
 * Danh sách kiểm tra trước khi mở bán. level: 'error' = chưa chạy đúng được, 'warn' = chạy được nhưng nên làm.
 * `fix` viết cho người không rành kỹ thuật (chỉ đường trong Launcher).
 */
export function readinessChecks(envText, { nodeMajor = Number(process.versions.node.split('.')[0]) } = {}) {
  const env = parseEnv(envText);
  const has = (k) => !!(env[k] ?? '').trim();
  const smtp = (env.SMTP_HOST ?? '').trim();
  return [
    { id: 'node', level: 'error', ok: nodeMajor >= 20, label: `Node.js ${nodeMajor} (cần ≥ 20)`, fix: 'Cài Node.js LTS tại https://nodejs.org' },
    { id: 'env', level: 'error', ok: envText.trim().length > 0, label: 'Có tệp cấu hình backend/.env', fix: 'Bấm BẮT ĐẦU một lần để Launcher tự tạo' },
    {
      id: 'jwt', level: 'error',
      ok: has('JWT_ACCESS_SECRET') && !PLACEHOLDER_JWT.test(env.JWT_ACCESS_SECRET) && !PLACEHOLDER_JWT.test(env.JWT_REFRESH_SECRET ?? ''),
      label: 'Khoá đăng nhập (JWT) riêng của tiệm', fix: 'Bấm BẮT ĐẦU — Launcher tự sinh khoá ngẫu nhiên',
    },
    { id: 'name', level: 'warn', ok: has('SALON_NAME') && env.SALON_NAME !== DEFAULT_NAME, label: 'Tên tiệm (không còn tên mẫu)', fix: 'Launcher › Thiết lập cửa hàng › Tên tiệm' },
    { id: 'hotline', level: 'warn', ok: has('SALON_HOTLINE') && env.SALON_HOTLINE !== '028 3838 6868', label: 'Hotline của tiệm', fix: 'Launcher › Thiết lập cửa hàng › Hotline' },
    { id: 'vietqr', level: 'warn', ok: /^\d{6}$/.test(env.BANK_BIN ?? '') && has('BANK_ACCOUNT_NO'), label: 'Tài khoản nhận chuyển khoản VietQR', fix: 'Launcher › Thiết lập cửa hàng › Ngân hàng + số tài khoản' },
    {
      id: 'mail', level: 'warn', ok: !!smtp && smtp !== 'localhost' && smtp !== '127.0.0.1' && has('SMTP_USER') && has('SMTP_PASSWORD'),
      label: 'Gmail gửi xác nhận / nhắc lịch cho khách', fix: 'Launcher › Thiết lập cửa hàng › Gmail + mật khẩu ứng dụng 16 ký tự',
    },
    {
      id: 'admin', level: 'warn', ok: has('BOOTSTRAP_ADMIN_EMAIL') || env.NODE_ENV !== 'production',
      label: 'Tài khoản quản trị đầu tiên (máy chủ cửa hàng)', fix: 'Launcher › Thiết lập cửa hàng › Tài khoản quản trị đầu tiên',
    },
  ];
}

export function snapshotEnvFile(root, now = new Date(), keep = 10) {
  const src = join(root, 'backend', '.env');
  if (!existsSync(src)) return null;
  const dir = join(root, 'backups', 'env');
  mkdirSync(dir, { recursive: true });
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const dest = join(dir, `backend.env.${stamp}`);
  copyFileSync(src, dest);
  const old = readdirSync(dir).filter((f) => f.startsWith('backend.env.')).sort().reverse().slice(keep);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return dest;
}
