import { useEffect, useRef } from 'react';
import { scopeOfUrl, type LiveChange } from './realtimeScopes';

/**
 * Đồng bộ trực tiếp dữ liệu lịch hẹn giữa các màn hình (Lỗi 6).
 * Mỗi khi có thao tác ghi (tạo lịch vãng lai, check-in, dời lịch, lập phiếu…) thành công,
 * client phát sự kiện này; Lịch ngày, Danh sách lịch hẹn, Khách vãng lai, Chờ xác nhận… lắng nghe
 * và tải lại ngay — kể cả ở tab trình duyệt khác (BroadcastChannel).
 * Sự kiện mang `LiveChange` (phạm vi dữ liệu) để màn hình chỉ tải lại khi dữ liệu của mình đổi.
 */
const EVENT = 'salon:appointments-changed';
const CHANNEL = 'salon-live-sync';

let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }

/** Đường dẫn API mà thao tác ghi lên đó làm thay đổi lịch hẹn / hồ sơ khách. */
const LIVE_PATH = /^\/?(appointments|public\/bookings|public\/cancel|invoices|customers|stylists\/[^/]+\/time-off|holidays)(\/|$)/;

export function affectsAppointments(method: string | undefined, url: string | undefined): boolean {
  if (!method || method.toLowerCase() === 'get' || !url) return false;
  return LIVE_PATH.test(url.split('?')[0]);
}

const emit = (change: LiveChange): void => {
  window.dispatchEvent(new CustomEvent<LiveChange>(EVENT, { detail: change }));
};

/** Thiết bị KHÁC vừa thay đổi dữ liệu (nhận qua luồng trực tiếp): chỉ làm mới tab này, không phát lại cho các tab cùng máy. */
export function dispatchRemoteChange(change: LiveChange = {}): void {
  if (typeof window === 'undefined') return;
  emit(change);
}

/** Tab này vừa ghi dữ liệu thành công: làm mới các màn hình của tab này và các tab khác cùng máy. */
export function notifyAppointmentsChanged(change: LiveChange = {}): void {
  if (typeof window === 'undefined') return;
  emit(change);
  try { channel?.postMessage({ type: EVENT, ...change }); } catch { /* bỏ qua */ }
}

/** Phạm vi của thao tác ghi tính từ URL API (cho `notifyAppointmentsChanged` trong interceptor axios). */
export const changeForRequest = (url: string | undefined): LiveChange => ({ scope: scopeOfUrl(url) });

/** Đăng ký nghe mọi thay đổi (cùng tab + tab khác). Trả hàm huỷ đăng ký. */
export function subscribeLiveChanges(listener: (change: LiveChange) => void): () => void {
  const onWindow = (e: Event) => listener((e as CustomEvent<LiveChange | null>).detail ?? {});
  const onMessage = (e: MessageEvent) => {
    const data: unknown = e.data;
    if (data === EVENT) listener({}); // bản cũ đang mở ở tab khác chỉ gửi chuỗi
    else if (data && typeof data === 'object' && (data as { type?: unknown }).type === EVENT) {
      const { scope, kind, seq } = data as LiveChange;
      listener({ scope, kind, seq });
    }
  };
  window.addEventListener(EVENT, onWindow);
  channel?.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener(EVENT, onWindow);
    channel?.removeEventListener('message', onMessage);
  };
}

/** Gọi `onChange` mỗi khi lịch hẹn thay đổi ở bất kỳ màn hình / tab nào (gộp các sự kiện dồn dập). */
export function useAppointmentsSync(onChange: () => void): void {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribeLiveChanges(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current(), 60);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
