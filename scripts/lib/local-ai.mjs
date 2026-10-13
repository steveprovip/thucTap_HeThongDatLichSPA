// AI local 1 chạm: HoYoSalon tự lo model Spark-X2.5-4B + bộ chạy llama.cpp, không cần ai nhớ chạy tai_model_local.cmd.
//  - Máy mới clone (model / runtime nằm trong .gitignore nên KHÔNG có): tải nền, ẩn, tải tiếp được, tải xong tự bật AI.
//  - Đã có đủ: bật AI ẩn nếu cổng 11434 chưa chạy (backend cũng tự bật lại khi AI tắt).
//  - Không chặn việc mở hệ thống: trợ lý trả lời bằng luật cho tới khi AI sẵn sàng (~10 giây sau khi bật).
//  - Bỏ qua khi: không phải Windows, AI_PROVIDER cố định (off / ollama / openai), AI_LOCAL_AUTOSTART=0, ổ đĩa không đủ chỗ.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';

export const MODEL_FILE = 'Spark-X2.5-4B-Q4_K_M.gguf';
export const MODEL_SIZE = 2600224352;
export const RUNTIME_SIZE = 800 * 1024 * 1024; // bộ chạy CUDA giải nén ~700 MB
export const AI_PORT = 11434;
const GROWING_MS = 120_000; // tệp .part vừa ghi trong 2 phút = đang tải (cửa sổ khác / lần bấm trước)

const fileSize = (p) => { try { return statSync(p).size; } catch { return 0; } };
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

/** Có llama-server.exe trong runtime\ (tìm đệ quy, bản zip có thể giải nén vào thư mục con). */
export function hasRuntime(dir) {
  const walk = (d, depth) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return false; }
    return entries.some((e) => (e.isFile() && e.name.toLowerCase() === 'llama-server.exe') || (e.isDirectory() && depth < 3 && walk(join(d, e.name), depth + 1)));
  };
  return walk(join(dir, 'runtime'), 0);
}

const hasOllama = () => {
  try { return spawnSync('where', ['ollama'], { windowsHide: true, stdio: 'ignore' }).status === 0; } catch { return false; }
};

/** Cấu hình AI trong backend/.env (chỉ 2 biến cần): AI_PROVIDER, AI_LOCAL_AUTOSTART. */
export function aiEnv(root) {
  const env = {};
  try {
    for (const line of readFileSync(join(root, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(AI_PROVIDER|AI_LOCAL_AUTOSTART)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* chưa có .env */ }
  return { provider: (process.env.AI_PROVIDER ?? env.AI_PROVIDER ?? '').trim().toLowerCase() || 'auto',
    autostart: !['0', 'false', 'off', 'no'].includes(String(process.env.AI_LOCAL_AUTOSTART ?? env.AI_LOCAL_AUTOSTART ?? '').trim().toLowerCase()) };
}

/**
 * Việc cần làm cho AI local (hàm thuần, dễ kiểm thử):
 * 'skip' | 'ready' (đủ model + bộ chạy) | 'downloading' (đang tải dở ở nơi khác) | 'no-space' | 'download'.
 */
export function planLocalAi({ platform, provider, autostart, modelSize, partSize, partMtime, runtime, ollama, freeBytes, now }) {
  if (platform !== 'win32' || provider !== 'auto' || !autostart) return { action: 'skip' };
  const haveModel = modelSize === MODEL_SIZE;
  if (haveModel && (runtime || ollama)) return { action: 'ready' };
  if (partMtime && now - partMtime < GROWING_MS) return { action: 'downloading' };
  const need = (haveModel ? 0 : MODEL_SIZE - Math.min(partSize, MODEL_SIZE)) + (runtime || ollama ? 0 : RUNTIME_SIZE) + 200 * 1024 * 1024;
  if (freeBytes != null && freeBytes < need) return { action: 'no-space', needBytes: need, freeBytes };
  return { action: 'download' };
}

/** Trạng thái để Launcher hiển thị: sẵn sàng / đang tải x% / chưa có. */
export function localAiStatus(root, now = Date.now()) {
  const dir = join(root, 'model_AI_local');
  const model = fileSize(join(dir, MODEL_FILE));
  const part = join(dir, `${MODEL_FILE}.part`);
  const partSize = fileSize(part);
  const downloading = partSize > 0 && now - mtime(part) < GROWING_MS;
  return {
    haveModel: model === MODEL_SIZE,
    haveRuntime: hasRuntime(dir),
    downloading,
    percent: downloading ? Math.min(99, Math.round((partSize / MODEL_SIZE) * 100)) : model === MODEL_SIZE ? 100 : 0,
  };
}

export const aiUp = (port = AI_PORT, timeoutMs = 1500) => new Promise((resolve) => {
  const req = http.get(`http://127.0.0.1:${port}/v1/models`, { timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on('timeout', () => { req.destroy(); resolve(false); });
  req.on('error', () => resolve(false));
});

/** Chạy chuỗi lệnh cmd ẨN và TÁCH khỏi launcher (đóng launcher không dừng việc tải / máy chủ AI). KHÔNG dùng detached của Node:
 *  powershell có console riêng thì Start-Process không bật được cmd (thử thật). Start-Process đã tách tiến trình rồi. */
function startHidden(dir, cmdLine) {
  const q = (s) => s.replace(/'/g, "''");
  // -EncodedCommand (UTF-16LE base64): Node escape dấu " trong tham số theo kiểu khác PowerShell 5.1 → lệnh hỏng, cmd không chạy
  const script = `Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c','"${q(cmdLine)}"' -WorkingDirectory '${q(dir)}' -WindowStyle Hidden`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')],
  { windowsHide: true, stdio: 'ignore', env: { ...process.env, SALON_NO_PAUSE: '1', AI_PORT: String(AI_PORT), PORT: String(AI_PORT) } });
  child.on('error', () => undefined);
  child.unref();
}

/**
 * Gọi khi bấm BẮT ĐẦU: chuẩn bị AI local ở nền. Trả về thông điệp ngắn để ghi log Launcher (không bao giờ ném lỗi).
 * Nhật ký tải / chạy: logs\ai-local.log.
 */
export async function ensureLocalAi(root, log = () => {}) {
  try {
    const dir = join(root, 'model_AI_local');
    if (!existsSync(join(dir, 'tai_model_local.cmd'))) return 'skip';
    const { provider, autostart } = aiEnv(root);
    const part = join(dir, `${MODEL_FILE}.part`);
    let freeBytes = null;
    try { const s = statfsSync(dir); freeBytes = Number(s.bavail) * Number(s.bsize); } catch { /* Node cũ: bỏ qua kiểm tra */ }
    const runtime = hasRuntime(dir);
    const plan = planLocalAi({
      platform: process.platform, provider, autostart, modelSize: fileSize(join(dir, MODEL_FILE)), partSize: fileSize(part),
      partMtime: mtime(part), runtime, ollama: runtime ? false : hasOllama(), freeBytes, now: Date.now(),
    });
    try { mkdirSync(join(root, 'logs'), { recursive: true }); } catch { /* bỏ qua */ }
    const logFile = join(root, 'logs', 'ai-local.log');
    switch (plan.action) {
      case 'skip':
        return 'skip';
      case 'ready':
        if (await aiUp()) { log('      AI local: đang chạy (Spark-X2.5-4B).'); return 'up'; }
        startHidden(dir, `call "${join(dir, 'chay_ai_local.cmd')}" >> "${logFile}" 2>&1`);
        log('      AI local: đang bật ở nền (sẵn sàng sau khoảng 10–30 giây).');
        return 'starting';
      case 'downloading':
        log(`      AI local: đang tải model ở nền (${localAiStatus(root).percent}%).`);
        return 'downloading';
      case 'no-space':
        log(`      [LƯU Ý] AI local cần thêm ${(plan.needBytes / 1e9).toFixed(1)} GB trống trên ổ đĩa (còn ${(plan.freeBytes / 1e9).toFixed(1)} GB). `
          + 'Trợ lý vẫn trả lời bằng luật; dọn ổ đĩa rồi bấm BẮT ĐẦU lại để tự tải.');
        return 'no-space';
      default:
        try { writeFileSync(logFile, `===== ${new Date().toISOString()} tự tải AI local =====\n`, { flag: 'a' }); } catch { /* logs/ chưa có */ }
        // Tải (tải tiếp được, kiểm SHA-256, chọn bộ chạy theo card đồ hoạ) rồi bật AI ngay — tất cả ẩn
        // Đường dẫn TUYỆT ĐỐI: máy bật NoDefaultCurrentDirectoryInExePath thì cmd không tìm tệp trong thư mục hiện tại
        startHidden(dir, `call "${join(dir, 'tai_model_local.cmd')}" >> "${logFile}" 2>&1 && call "${join(dir, 'chay_ai_local.cmd')}" >> "${logFile}" 2>&1`);
        log('      AI local: máy này chưa có model — đang tự tải ~2,6 GB ở nền (tải tiếp được nếu mất mạng).');
        log('      Trong lúc tải, Trợ lý vẫn trả lời bằng luật; tải xong AI tự bật, không cần làm gì thêm.');
        return 'download';
    }
  } catch (e) {
    log(`      [LƯU Ý] Không chuẩn bị được AI local: ${e.message}`);
    return 'error';
  }
}
