/**
 * Số liệu khách hàng — MỘT nguồn nhãn + cách đếm duy nhất cho Hồ sơ khách, Chi tiết lịch hẹn và Khách vãng lai.
 *  - Lượt hoàn tất    = số lịch trạng thái "Hoàn tất"
 *  - Lượt không đến   = số lịch trạng thái "Không đến"
 *  - Tổng lịch đã đặt = mọi lịch từng được tạo (kể cả đã huỷ, đang chờ, lịch sắp tới)
 * Cả ba đều được máy chủ đếm trực tiếp từ bảng lịch hẹn.
 */
export const CUSTOMER_METRIC_LABELS = {
  visits: 'Lượt hoàn tất',
  noShows: 'Lượt không đến',
  total: 'Tổng lịch đã đặt',
} as const;

export interface CustomerMetricsData {
  totalVisits: number;
  noShowCount: number;
  totalAppointments: number;
}

/** Chú thích danh sách lịch sử: nói rõ đang xem bao nhiêu lịch trong tổng số lịch đã đặt. */
export const historyCaption = (shown: number, total: number): string =>
  shown >= total ? `${total} lịch` : `${shown} lịch gần nhất trong tổng ${total} lịch đã đặt`;
