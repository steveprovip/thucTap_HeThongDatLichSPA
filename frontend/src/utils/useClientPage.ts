import { useEffect, useMemo, useState } from 'react';
import { paginate, type PageOf } from './opsHelpers';

/**
 * Phân trang ở trình duyệt cho danh sách đã tải sẵn (doanh thu, dịch vụ, thợ, tài khoản, mã giảm giá…).
 * `resetKey` đổi (tab nhóm, từ khoá, bộ lọc) → về trang 1; danh sách co lại → không đứng ở trang rỗng.
 */
export function useClientPage<T>(items: readonly T[], initialLimit = 10, resetKey: unknown = null): PageOf<T> & {
  setPage: (p: number) => void;
  setLimit: (n: number) => void;
} {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(initialLimit);
  useEffect(() => { setPage(1); }, [resetKey]);
  const paged = useMemo(() => paginate(items, page, limit), [items, page, limit]);
  useEffect(() => { if (page > paged.totalPages) setPage(paged.totalPages); }, [page, paged.totalPages]);
  return { ...paged, setPage, setLimit: (n: number) => { setLimitState(n); setPage(1); } };
}
