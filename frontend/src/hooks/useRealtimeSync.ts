import { useEffect, useRef, useState } from 'react';
import { getRealtimeStatus, useRealtimeStatus } from '@/utils/realtime';
import { subscribeLiveChanges } from '@/utils/liveSync';
import { shouldSync, type RealtimeDomain } from '@/utils/realtimeScopes';

export type { RealtimeDomain } from '@/utils/realtimeScopes';

interface UseRealtimeSyncOptions {
  domains?: RealtimeDomain[];
  onSync: () => void | Promise<void>;
  debounceMs?: number;
}

/**
 * Hook đồng bộ dữ liệu thời gian thực (SSE + LiveSync) không làm giật giao diện (Silent Revalidation).
 * - Chỉ tải lại khi thay đổi thuộc `domains` của màn hình (sự kiện mang phạm vi dữ liệu từ máy chủ).
 * - Gom nhịp sự kiện (debounce 150ms): 10 thay đổi dồn dập = 1 lần tải.
 * - Tab hiện lại: luồng trực tiếp tự nối lại và chỉ báo làm mới khi đã lỡ thay đổi; hook chỉ tự làm mới khi KHÔNG có
 *   luồng trực tiếp (chế độ demo / chưa kết nối).
 */
export function useRealtimeSync({
  domains = ['appointments', 'shifts', 'invoices'],
  onSync,
  debounceMs = 150,
}: UseRealtimeSyncOptions) {
  const realtimeStatus = useRealtimeStatus();
  const isConnected = realtimeStatus === 'live' || realtimeStatus === 'polling';
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(Date.now());
  const onSyncRef = useRef(onSync);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const domainKey = domains.join(',');

  useEffect(() => {
    const watched = domainKey.split(',') as RealtimeDomain[];
    const triggerSilentSync = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        timerRef.current = null;
        try {
          await onSyncRef.current();
          setLastSyncedAt(Date.now());
        } catch {
          // Bỏ qua lỗi ngầm để không gián đoạn người dùng
        }
      }, debounceMs);
    };

    const unsubscribe = subscribeLiveChanges((change) => {
      if (shouldSync(change, watched)) triggerSilentSync();
    });

    const handleVisibilityChange = () => {
      const status = getRealtimeStatus();
      if (document.visibilityState === 'visible' && (status === 'idle' || status === 'offline')) triggerSilentSync();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [debounceMs, domainKey]);

  return { isConnected, lastSyncedAt, realtimeStatus };
}
