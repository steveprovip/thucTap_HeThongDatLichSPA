import { useEffect, useRef, useState } from 'react';
import { useRealtimeStatus } from '@/utils/realtime';

export type RealtimeDomain = 'appointments' | 'shifts' | 'invoices' | 'services' | 'general';

interface UseRealtimeSyncOptions {
  domains?: RealtimeDomain[];
  onSync: () => void | Promise<void>;
  debounceMs?: number;
}

const EVENT = 'salon:appointments-changed';

/**
 * Hook đồng bộ dữ liệu thời gian thực (SSE + LiveSync) không làm giật giao diện (Silent Revalidation).
 * Gom nhịp sự kiện (debounce 150ms) và tự động đồng bộ lại khi người dùng mở lại tab (visibilitychange).
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
    const triggerSilentSync = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        try {
          await onSyncRef.current();
          setLastSyncedAt(Date.now());
        } catch {
          // Bỏ qua lỗi ngầm để không gián đoạn người dùng
        }
      }, debounceMs);
    };

    const handleEvent = () => triggerSilentSync();
    window.addEventListener(EVENT, handleEvent);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerSilentSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener(EVENT, handleEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [debounceMs, domainKey]);

  return { isConnected, lastSyncedAt, realtimeStatus };
}
