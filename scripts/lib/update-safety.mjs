/**
 * An toàn cho quy trình CẬP NHẬT (QA 12/10) — bổ sung các bước mà quy trình cập nhật hiện đại yêu cầu nhưng launcher
 * còn thiếu (đối chiếu: staged update + preflight tương thích + health gate chức năng + rollback chỉ khi dữ liệu còn tương thích):
 *   1. Khoá cập nhật: mỗi bản cài chỉ MỘT tiến trình cập nhật chạy (bấm CẬP NHẬT hai lần không còn hai lần git pull / build / migrate).
 *   2. Preflight migration: bản mới có migration PHÁ HUỶ (DROP COLUMN / DROP TABLE / đổi kiểu cột / đổi tên / xoá dữ liệu…) thì
 *      "tự quay về bản cũ" KHÔNG còn an toàn (mã cũ chạy trên cấu trúc mới) → dừng trước khi đụng vào gì, trừ khi cho phép rõ ràng.
 *   3. Smoke test chức năng sau khi bật bản mới: không chỉ /health mà cả API công khai khách dùng thật.
 *   4. Nhật ký cập nhật: mỗi lần cập nhật ghi một dòng JSON (từ → tới, kết quả, thời gian, bản sao lưu) để tra lại.
 * Hàm thuần / không cần mạng để kiểm thử bằng node:test (scripts/lib/test/update-safety.test.mjs).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const UPDATE_LOCK = '.salon-update.lock';
/** Khoá cũ hơn ngần này coi như kẹt (máy mất điện giữa chừng) dù PID trùng hợp đang sống. */
const STALE_MS = 2 * 60 * 60 * 1000;

const alive = (pid) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/**
 * Giành khoá cập nhật. Trả { ok: true } hoặc { ok: false, holder } khi có tiến trình cập nhật KHÁC đang chạy.
 * `pid` cho phép bước 2 (update-apply, chạy bằng mã mới) tiếp quản khoá của bước 1 (cùng phiên cập nhật).
 */
export function acquireUpdateLock(root, { pid = process.pid, now = Date.now(), isAlive = alive, inherit = null } = {}) {
  const file = join(root, UPDATE_LOCK);
  if (existsSync(file)) {
    let holder = null;
    try { holder = JSON.parse(readFileSync(file, 'utf8')); } catch { holder = null; }
    const stale = !holder || now - Number(holder.at ?? 0) > STALE_MS || !isAlive(holder.pid);
    const ours = holder && inherit && holder.pid === inherit;
    if (!stale && !ours) return { ok: false, holder };
  }
  writeFileSync(file, JSON.stringify({ pid, at: now }));
  return { ok: true };
}

export function releaseUpdateLock(root, { pid = process.pid } = {}) {
  const file = join(root, UPDATE_LOCK);
  try {
    const holder = JSON.parse(readFileSync(file, 'utf8'));
    if (holder.pid !== pid) return; // khoá đã được người khác tiếp quản
  } catch { /* hỏng thì xoá luôn */ }
  rmSync(file, { force: true });
}

/** Phần thân hàm up() của một migration TypeORM (down() luôn chứa DROP để huỷ — không tính). */
export function upBody(source) {
  const start = source.search(/\basync\s+up\s*\(/);
  if (start < 0) return source;
  const rest = source.slice(start);
  const end = rest.search(/\basync\s+down\s*\(/);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Câu lệnh trong up() khiến MÃ CŨ không còn chạy đúng trên CSDL mới (rollback mã không an toàn) hoặc làm mất dữ liệu.
 * Bỏ qua thao tác dựng lại được: DROP CONSTRAINT / INDEX / TRIGGER / FUNCTION / VIEW, DROP ... IF EXISTS đi kèm tạo lại.
 */
const DESTRUCTIVE = [
  { re: /\bDROP\s+TABLE\b/i, why: 'xoá bảng' },
  { re: /\bDROP\s+COLUMN\b/i, why: 'xoá cột' },
  { re: /\bALTER\s+COLUMN\s+\w+\s+(SET\s+DATA\s+)?TYPE\b/i, why: 'đổi kiểu cột' },
  { re: /\bRENAME\s+(COLUMN\b|TO\b)/i, why: 'đổi tên bảng / cột' },
  // Câu lệnh đứng đầu chuỗi SQL (không bắt 'BEFORE TRUNCATE' của trigger chặn xoá hay chữ TRUNCATE trong RAISE EXCEPTION)
  { re: /(?:^|[;'"`]\s*)TRUNCATE\s+(?:TABLE\s+)?["a-z_]/im, why: 'xoá sạch bảng' },
  { re: /(?:^|[;'"`]\s*)DELETE\s+FROM\b/im, why: 'xoá dữ liệu' },
  { re: /\bSET\s+NOT\s+NULL\b/i, why: 'bắt buộc cột (mã cũ có thể ghi NULL)' },
];

export function destructiveStatements(source) {
  const body = upBody(source);
  return DESTRUCTIVE.filter((d) => d.re.test(body)).map((d) => d.why);
}

/** files: [{ path, source }] các migration MỚI của bản cập nhật → danh sách migration phá huỷ kèm lý do. */
export function migrationPreflight(files) {
  return files
    .map((f) => ({ path: f.path, reasons: destructiveStatements(f.source) }))
    .filter((f) => f.reasons.length);
}

/**
 * Smoke test sau khi bật bản mới: mỗi mục { name, status, ok } (ok = điều kiện nội dung). Trả danh sách mục hỏng.
 * Launcher tự gọi HTTP; ở đây chỉ phán định để kiểm thử được.
 */
/** API bọc kết quả trong { success, data } (TransformInterceptor) — kể cả /health. */
export const unwrap = (b) => (b && typeof b === 'object' && 'success' in b && 'data' in b ? b.data : b);

export const SMOKE_CHECKS = [
  { name: 'API + CSDL', path: '/health', check: (b) => unwrap(b)?.status === 'ok' && unwrap(b)?.database === 'up' },
  { name: 'thông tin tiệm', path: '/api/public/salon-info', check: (b) => !!unwrap(b) },
  { name: 'danh mục dịch vụ', path: '/api/public/catalog', check: (b) => Array.isArray(unwrap(b)) },
  // Câu số liệu: trả lời bằng danh mục thật, không gọi mô hình ngôn ngữ (smoke không phụ thuộc AI local đang nạp)
  { name: 'trợ lý AI khách', path: '/api/public/assistant/chat', body: { message: 'có bao nhiêu dịch vụ' }, check: (b) => unwrap(b)?.intent === 'count_services' },
];

export function smokeFailures(results) {
  return results.filter((r) => !(r.status >= 200 && r.status < 300 && r.ok)).map((r) => `${r.name} (HTTP ${r.status || 'không phản hồi'})`);
}

/** Nhật ký cập nhật: logs/update-history.jsonl, mỗi lần một dòng. */
export function recordUpdate(root, entry) {
  const file = join(root, 'logs', 'update-history.jsonl');
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* nhật ký không được làm hỏng cập nhật */ }
  return file;
}
