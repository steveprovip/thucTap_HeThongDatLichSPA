import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export interface BackButtonProps {
  /** Trang dự phòng khi không có lịch sử (mở thẳng bằng link / tab mới). */
  to?: string;
  label?: string;
  /** Tự xử lý (vd. lùi một bước trong wizard) thay vì lùi lịch sử trình duyệt. */
  onClick?: () => void;
  className?: string;
}

/** react-router lưu vị trí trong history.state.idx; > 0 nghĩa là có trang trước trong ứng dụng. */
const canGoBack = () => {
  try { return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0; } catch { return false; }
};

/**
 * Lỗi 8: nút "← Quay lại" thống nhất cho trang con, ngăn kéo chi tiết, bước wizard, phiếu tính tiền
 * và form quản trị. Có nhãn cho trình đọc màn hình, vùng chạm ≥ 36px, phản hồi nhấn nảy nhẹ.
 */
export function BackButton({ to = '/', label = 'Quay lại', onClick, className = '' }: BackButtonProps) {
  const navigate = useNavigate();
  const handle = () => {
    if (onClick) return onClick();
    if (canGoBack()) navigate(-1);
    else navigate(to, { replace: true });
  };
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      className={`group inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3.5 py-1.5
                  text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition-all duration-200
                  hover:-translate-y-0.5 hover:border-teal-300 hover:text-teal-700 hover:shadow-card-hover active:scale-95 ${className}`}
    >
      <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      {label}
    </button>
  );
}
