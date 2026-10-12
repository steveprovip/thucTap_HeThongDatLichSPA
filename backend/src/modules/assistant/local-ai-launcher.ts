import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * QA Sprint 3 · mục 6 — AI TỰ PHỤC HỒI. Sau khi khởi động lại máy, máy chủ AI local (cổng 11434) không tự bật nên trợ
 * lý rơi về chế độ luật cho tới khi có người nhớ chạy model_AI_local\chay_ai_local.cmd. Ở đây backend tự bật lại nó
 * (ẩn cửa sổ, tách khỏi tiến trình backend nên khởi động lại backend không tắt model) khi:
 *   - đã tải model + có tệp chay_ai_local.cmd (tức là máy này ĐÃ chọn dùng AI local),
 *   - địa chỉ AI là máy này (localhost), đang chạy Windows,
 *   - không tắt bằng AI_LOCAL_AUTOSTART=0 (bộ kiểm thử luôn tắt).
 */
export const LOCAL_AI_SCRIPT = 'chay_ai_local.cmd';
export const LOCAL_AI_MODEL = 'Spark-X2.5-4B-Q4_K_M.gguf';

/** Thư mục model_AI_local: AI_LOCAL_DIR, hoặc cạnh thư mục chạy backend (launcher chạy backend với cwd = backend/). */
export function findLocalAiDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string | null {
  const candidates = [env.AI_LOCAL_DIR, join(cwd, 'model_AI_local'), join(cwd, '..', 'model_AI_local')]
    .filter((d): d is string => !!d).map((d) => resolve(d));
  return candidates.find((d) => existsSync(join(d, LOCAL_AI_SCRIPT)) && existsSync(join(d, LOCAL_AI_MODEL))) ?? null;
}

export const isLoopbackUrl = (url: string): boolean => {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * Bật chay_ai_local.cmd ở chế độ ẩn. Dùng PowerShell Start-Process thay vì spawn trực tiếp: tiến trình con của Node
 * trên Windows nằm trong job object của backend (tắt backend là tắt luôn model) và llama-server sẽ bật cửa sổ console.
 */
export function launchLocalAi(dir: string): boolean {
  if (process.platform !== 'win32') return false;
  const quoted = dir.replace(/'/g, "''");
  try {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c','${LOCAL_AI_SCRIPT}' -WorkingDirectory '${quoted}' -WindowStyle Hidden`,
    ], { windowsHide: true, stdio: 'ignore', env: { ...process.env, SALON_NO_PAUSE: '1' } });
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
