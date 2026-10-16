import { useSyncExternalStore } from 'react';

/**
 * Âm phản hồi xúc giác tổng hợp tại chỗ bằng Web Audio API (RFC-2026-SPA-V3 · Pillar I.3) — 0 tệp âm thanh, 0 byte tải thêm.
 * Mỗi "tiếng chuông" = sóng sin cơ bản + bội âm 2.76× và 5.4× (phổ đặc trưng chuông kim loại nhỏ), bao hình tấn công 4 ms,
 * tắt dần hàm mũ, lọc thông thấp 4.2 kHz cho tiếng ấm, qua bộ nén để không bao giờ chói.
 *  - tap: chạm nhẹ (chọn dịch vụ) · select: chọn khung giờ · confirm: chốt lịch thành công · alert: lễ tân có lịch đặt online mới.
 *  - Một AudioContext dùng chung cả trang; nút dao động tự ngắt kết nối khi kêu xong (không rò bộ nhớ); tab ẩn → tạm dừng.
 *  - Tắt / bật tiếng được nhớ trên máy (salon.soundMuted).
 */
export type Cue = 'tap' | 'select' | 'confirm' | 'alert';

/** [tần số Hz, độ lớn, thời gian tắt dần s, trễ so với nốt đầu s] */
type Note = [number, number, number, number];
const CUES: Record<Cue, Note[]> = {
  tap: [[1567.98, 0.035, 0.12, 0]],
  select: [[1318.51, 0.06, 0.38, 0]],
  confirm: [[1046.5, 0.06, 0.55, 0], [1567.98, 0.055, 0.9, 0.085]],
  alert: [[659.25, 0.11, 0.9, 0], [830.61, 0.1, 0.9, 0.13], [987.77, 0.1, 1.3, 0.26]],
};
const PARTIALS: [number, number][] = [[1, 1], [2.76, 0.22], [5.4, 0.06]];

const MUTE_KEY = 'salon.soundMuted';
const listeners = new Set<() => void>();
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;

type AudioCtor = typeof AudioContext;
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  bus = ctx.createGain();
  bus.gain.value = 0.9;
  bus.connect(comp).connect(ctx.destination);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
  });
  return ctx;
}

function bell(c: AudioContext, at: number, [freq, gain, decay]: Note): void {
  if (!bus) return;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4200;
  env.connect(tone).connect(bus);
  PARTIALS.forEach(([ratio, amp], i) => {
    const osc = c.createOscillator();
    const level = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    level.gain.value = amp;
    osc.connect(level).connect(env);
    osc.start(at);
    osc.stop(at + decay + 0.05);
    osc.onended = () => {
      osc.disconnect();
      level.disconnect();
      if (i === PARTIALS.length - 1) { env.disconnect(); tone.disconnect(); }
    };
  });
}

/** Phát một âm phản hồi. Trình duyệt chưa cho phát (chưa có thao tác người dùng) → bỏ qua, không phát trễ. */
export function playCue(cue: Cue): void {
  if (muted) return;
  const c = context();
  if (!c) return;
  const requested = performance.now();
  const run = () => {
    if (performance.now() - requested > 250) return; // tiếng phản hồi trễ còn tệ hơn không có tiếng
    const t0 = c.currentTime + 0.01;
    for (const note of CUES[cue]) bell(c, t0 + note[3], note);
  };
  if (c.state === 'running') run();
  else void c.resume().then(run).catch(() => undefined);
}

/** Mở khoá âm thanh ở lần chạm đầu tiên (chính sách autoplay) để chuông báo lịch mới kêu được khi chưa bấm gì thêm. */
export function primeAudioOnFirstGesture(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const unlock = () => {
    const c = context();
    if (c && c.state !== 'running') void c.resume().catch(() => undefined);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* chế độ riêng tư */ }
  listeners.forEach((l) => l());
  if (!next) playCue('tap');
}

export function useSoundMuted(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => muted,
    () => false,
  );
}
