import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage, getErrorStatus, publicApi } from '@/api';
import type { SlotHold } from '@/types';

export type HoldState = 'idle' | 'holding' | 'held' | 'expired' | 'unavailable';

/**
 * Mentor Sprint 2 · mục 11 — giữ chỗ khung giờ trong lúc khách điền form (bước 4).
 *  - vào bước 4: giữ chỗ (đổi giờ / đổi thợ thì trả chỗ cũ rồi giữ chỗ mới);
 *  - rời bước 4 hoặc rời trang: trả chỗ ngay cho khách khác;
 *  - máy chủ báo 409 (người khác vừa giữ / đặt) -> onLost để đưa khách về bước chọn giờ;
 *  - lỗi khác (mạng, máy chủ cũ / chế độ Demo chưa có API) -> bỏ qua, khách vẫn đặt bình thường.
 */
export function useSlotHold(params: {
  active: boolean;
  serviceIds: string[];
  date: string;
  time: string;
  stylistId: string | null;
  onLost: (message: string) => void;
}) {
  const { active, serviceIds, date, time, stylistId, onLost } = params;
  const [hold, setHold] = useState<SlotHold | null>(null);
  const [state, setState] = useState<HoldState>('idle');
  const [now, setNow] = useState(Date.now());
  const holdRef = useRef<SlotHold | null>(null);
  const keyRef = useRef('');
  const onLostRef = useRef(onLost);
  useEffect(() => { onLostRef.current = onLost; }, [onLost]);
  const key = `${serviceIds.join(',')}|${date}|${time}|${stylistId ?? ''}`;

  const release = useCallback(() => {
    const current = holdRef.current;
    holdRef.current = null;
    keyRef.current = '';
    setHold(null);
    setState('idle');
    if (current) void publicApi.releaseHold(current.holdToken).catch(() => undefined);
  }, []);

  const acquire = useCallback(async () => {
    if (!serviceIds.length || !date || !time) return;
    setState('holding');
    try {
      const next = await publicApi.hold({
        serviceIds, date, time, stylistId: stylistId ?? undefined, previousToken: holdRef.current?.holdToken,
      });
      holdRef.current = next;
      keyRef.current = key;
      setHold(next);
      setState('held');
      setNow(Date.now());
    } catch (e) {
      holdRef.current = null;
      setHold(null);
      if (getErrorStatus(e) === 409) {
        setState('idle');
        onLostRef.current(getErrorMessage(e));
      } else {
        setState('unavailable');
      }
    }
  }, [serviceIds, date, time, stylistId, key]);

  // Vào bước 4 / đổi lựa chọn -> giữ chỗ; rời bước 4 -> trả chỗ
  useEffect(() => {
    if (!active) { if (holdRef.current) release(); return; }
    const current = holdRef.current;
    const valid = current && keyRef.current === key && new Date(current.expiresAt).getTime() > Date.now();
    if (!valid) void acquire();
  }, [active, key, acquire, release]);

  // Rời trang khi đang giữ chỗ -> trả chỗ (keepalive để yêu cầu vẫn đi khi tab đóng)
  useEffect(() => () => {
    const current = holdRef.current;
    if (current) void publicApi.releaseHold(current.holdToken).catch(() => undefined);
  }, []);

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (state !== 'held') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const remainingMs = hold ? new Date(hold.expiresAt).getTime() - now : 0;
  useEffect(() => {
    if (state === 'held' && hold && remainingMs <= 0) {
      holdRef.current = null;
      keyRef.current = '';
      setState('expired');
    }
  }, [state, hold, remainingMs]);

  return {
    hold,
    state,
    remainingMs: Math.max(0, remainingMs),
    /** Giữ thêm một lượt (trả chỗ hiện tại rồi giữ lại đúng khung đó). */
    extend: acquire,
    /** Sau khi chốt lịch thành công: máy chủ đã xoá chỗ giữ, chỉ cần quên token. */
    forget: () => { holdRef.current = null; keyRef.current = ''; setHold(null); setState('idle'); },
    token: state === 'held' ? hold?.holdToken : undefined,
  };
}
