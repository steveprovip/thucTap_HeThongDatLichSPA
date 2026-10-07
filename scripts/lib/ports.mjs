/**
 * Tìm tiến trình đang LẮNG NGHE một cổng — để Launcher dọn tiến trình mồ côi của CHÍNH dự án này.
 * Chỉ phần phân tích văn bản (thuần, có kiểm thử); việc chạy lsof / netstat nằm ở launcher.mjs.
 *
 * Vì sao phải chặt chẽ: `lsof -ti :3000` liệt kê cả tiến trình đang KẾT NỐI tới cổng (trình duyệt đang mở trang),
 * `netstat | grep :3000` khớp luôn `:30001`. Bắn nhầm là tắt trình duyệt / ứng dụng khác của người dùng.
 */

/** Danh sách PID (số nguyên dương, không trùng) từ đầu ra `lsof -t`. */
export const parsePidList = (text) => [...new Set(String(text ?? '').split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** PID đang LISTENING đúng cổng này từ đầu ra `netstat -ano -p tcp` (Windows). */
export function parseNetstatListeners(text, port) {
  const pids = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const c = line.trim().split(/\s+/);
    if (c.length < 5 || c[0].toUpperCase() !== 'TCP' || c[3].toUpperCase() !== 'LISTENING') continue;
    if (!c[1].endsWith(`:${port}`)) continue;
    const pid = Number(c[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** Dòng lệnh có nhắc tới thư mục dự án (node …/du_an/frontend/node_modules/vite/bin/vite.js ...)? */
export const mentionsRoot = (commandLine, root) => !!norm(root) && norm(commandLine).includes(norm(root));

/** Thư mục làm việc của tiến trình (đầu ra `lsof -Fn -d cwd`: dòng "n/đường/dẫn") nằm trong thư mục dự án? */
export function cwdInside(lsofOutput, root) {
  const cwd = String(lsofOutput ?? '').split(/\r?\n/).find((l) => l.startsWith('n'))?.slice(1);
  if (!cwd) return false;
  const c = norm(cwd);
  const r = norm(root);
  return c === r || c.startsWith(`${r}/`);
}
