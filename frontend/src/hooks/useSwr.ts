import { useCallback, useEffect, useRef, useState } from 'react';
import { swrStore } from '@/utils/swrStore';

export interface SwrResult<T> {
  data: T | undefined;
  error: unknown;
  /** Chưa có dữ liệu nào để hiện (lần tải ĐẦU TIÊN) — chỉ lúc này mới nên hiện khung chờ. */
  isLoading: boolean;
  /** Đang tải lại ngầm (đã có dữ liệu cũ trên màn hình). */
  isValidating: boolean;
  /** Dữ liệu đang hiện thuộc bộ lọc trước (đổi bộ lọc chưa có bản đệm) — làm mờ nhẹ thay vì xoá trắng. */
  isStale: boolean;
  revalidate: () => Promise<void>;
  /** Sửa dữ liệu đang hiện + bản đệm của khoá hiện tại (cập nhật lạc quan). */
  mutate: (fn: (data: T) => T) => void;
}

/**
 * Stale-while-revalidate cho một khoá: dữ liệu đệm hiện ngay, request mới nhất thắng (phản hồi cũ về muộn bị bỏ),
 * đổi khoá chưa có đệm thì GIỮ dữ liệu trước (isStale) thay vì nhấp nháy khung chờ.
 */
export function useSwr<T>(key: string | null, fetcher: () => Promise<T>): SwrResult<T> {
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown }>(() => ({
    key, data: key ? swrStore.get<T>(key)?.data : undefined, error: undefined,
  }));
  const [validating, setValidating] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(key);
  const seq = useRef(0);

  const revalidate = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
    const my = ++seq.current;
    setValidating(true);
    try {
      const data = await swrStore.fetch<T>(k, () => fetcherRef.current());
      if (my === seq.current) setState({ key: k, data, error: undefined });
    } catch (error) {
      if (my === seq.current) setState((s) => ({ ...s, error }));
    } finally {
      if (my === seq.current) setValidating(false);
    }
  }, []);

  useEffect(() => {
    keyRef.current = key;
    if (!key) return;
    const cached = swrStore.get<T>(key);
    if (cached) setState({ key, data: cached.data, error: undefined });
    void revalidate();
  }, [key, revalidate]);

  const mutate = useCallback((fn: (data: T) => T) => {
    const k = keyRef.current;
    setState((s) => (s.data === undefined ? s : { ...s, data: fn(s.data) }));
    if (k) swrStore.update<T>((x) => x === k, fn);
  }, []);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.data === undefined && !state.error,
    isValidating: validating,
    isStale: state.key !== key,
    revalidate,
    mutate,
  };
}
