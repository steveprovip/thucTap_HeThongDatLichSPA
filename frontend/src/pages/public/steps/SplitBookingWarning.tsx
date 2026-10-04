import type { Quote } from '@/types';
import { formatDuration } from '@/utils/format';

/**
 * QA-01: khuyên khách tách thành nhiều lần hẹn khi tổng thời lượng vượt ca làm dài nhất trong tuần
 * của các thợ làm được gói dịch vụ (máy chủ tính `exceedsLongestShift`, giao diện chỉ hiển thị).
 */
export function SplitBookingWarning({ quote, className = '' }: { quote: Quote | null; className?: string }) {
  if (!quote?.exceedsLongestShift) return null;
  return (
    <p role="alert"
       className={`rounded-xl border-2 border-amber-400 bg-amber-100 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-amber-950 sm:text-sm ${className}`}>
      ⚠️ Tổng thời lượng dịch vụ ({formatDuration(quote.totalDurationMinutes)}) vượt quá ca làm việc dài nhất trong tuần (
      {formatDuration(quote.longestShiftMinutes ?? 0)}). Quý khách nên tách thành 2 hoặc nhiều lần hẹn khác nhau để tiệm phục vụ trọn vẹn nhất!
    </p>
  );
}
