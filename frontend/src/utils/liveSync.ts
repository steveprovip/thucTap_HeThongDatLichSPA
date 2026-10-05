import { useEffect, useRef } from 'react';

/**
 * Đồng bộ trực tiếp dữ liệu lịch hẹn giữa các màn hình (Lỗi 6).
 * Mỗi khi có thao tác ghi (tạo lịch vãng lai, check-in, dời lịch, lập phiếu…) thành công,
 * client phát sự kiện này; Lịch ngày, Danh sách lịch hẹn, Khách vãng lai, Chờ xác nhận… lắng nghe
 * và tải lại ngay — kể cả ở tab trình duyệt khác (BroadcastChannel).
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

/** Thiết bị KHÁC vừa thay đổi dữ liệu (nhận qua luồng trực tiếp): chỉ làm mới tab này, không phát lại cho các tab cùng máy. */
export function dispatchRemoteChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function notifyAppointmentsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
  try { channel?.postMessage(EVENT); } catch { /* bỏ qua */ }
}

/** Gọi `onChange` mỗi khi lịch hẹn thay đổi ở bất kỳ màn hình / tab nào (gộp các sự kiện dồn dập). */
export function useAppointmentsSync(onChange: () => void): void {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current(), 60);
    };
    const onMessage = (e: MessageEvent) => { if (e.data === EVENT) fire(); };
    window.addEventListener(EVENT, fire);
    channel?.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENT, fire);
      channel?.removeEventListener('message', onMessage);
    };
  }, []);
}
