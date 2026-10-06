import { useEffect, useState } from 'react';
import { publicApi } from '@/api/public.api';
import type { SalonInfo } from '@/types';

/**
 * Thông tin tiệm cấu hình LÚC CHẠY (backend/.env, sửa qua Launcher > Thiết lập cửa hàng) — dùng chung một lần gọi
 * API cho chân trang, mã VietQR… Đổi tên tiệm / tài khoản ngân hàng không cần build lại giao diện.
 */
let cache: Promise<SalonInfo> | null = null;

export function loadSalonInfo(): Promise<SalonInfo> {
  cache ??= publicApi.salonInfo().catch((e: unknown) => {
    cache = null; // lỗi mạng: lần sau thử lại
    throw e;
  });
  return cache;
}

/** `loaded` = đã có kết quả (thành công hoặc lỗi) để giao diện thôi hiện khung chờ. */
export function useSalonInfo(): { info: SalonInfo | null; loaded: boolean } {
  const [state, setState] = useState<{ info: SalonInfo | null; loaded: boolean }>({ info: null, loaded: false });
  useEffect(() => {
    let alive = true;
    loadSalonInfo()
      .then((info) => { if (alive) setState({ info, loaded: true }); })
      .catch(() => { if (alive) setState({ info: null, loaded: true }); });
    return () => { alive = false; };
  }, []);
  return state;
}
