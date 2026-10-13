/**
 * Cho CSDL đám mây miễn phí được NGỦ khi tiệm vắng (Neon Free: 100 CU-giờ/tháng, tự ngủ sau 5 phút không truy vấn).
 * Tác vụ nền mỗi phút (cảnh báo quá giờ, gửi email, dọn giữ chỗ) vốn đánh thức CSDL suốt 24 giờ → hết hạn mức giữa tháng.
 * Bật IDLE_DB_SLEEP=true (render.yaml đã bật): có người dùng trong 15 phút gần nhất thì chạy bình thường; vắng thì mỗi
 * tác vụ chạy tối đa 1 lần / giờ (vẫn gửi email nhắc lịch, dọn giữ chỗ). Máy chạy tại tiệm: không đặt biến → như cũ.
 * Lệnh giữ máy chủ thức (GET /health/live) KHÔNG tính là hoạt động và không đụng CSDL.
 */
const ACTIVE_WINDOW_MS = 15 * 60_000;
const IDLE_EVERY_MS = 60 * 60_000;

let lastActivity = 0;
const lastIdleRun = new Map<string, number>();

export const markActivity = (now = Date.now()): void => { lastActivity = now; };

export function backgroundAllowed(job: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.IDLE_DB_SLEEP !== 'true') return true;
  if (now - lastActivity < ACTIVE_WINDOW_MS) return true;
  if (now - (lastIdleRun.get(job) ?? 0) >= IDLE_EVERY_MS) {
    lastIdleRun.set(job, now);
    return true;
  }
  return false;
}

/** Chỉ cho bộ kiểm thử. */
export const resetActivity = (): void => { lastActivity = 0; lastIdleRun.clear(); };
