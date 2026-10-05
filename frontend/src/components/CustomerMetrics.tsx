import { CUSTOMER_METRIC_LABELS, type CustomerMetricsData } from '@/utils/customerMetrics';

/** Dòng số liệu khách: "Lượt hoàn tất: 2 · Lượt không đến: 1 · Tổng lịch đã đặt: 5". */
export function CustomerMetrics({ data, className = '' }: { data: CustomerMetricsData; className?: string }) {
  const L = CUSTOMER_METRIC_LABELS;
  return (
    <p className={className} data-testid="customer-metrics">
      <span>{L.visits}: <strong>{data.totalVisits}</strong></span>
      {' · '}
      <span>{L.noShows}: <strong>{data.noShowCount}</strong></span>
      {' · '}
      <span>{L.total}: <strong>{data.totalAppointments}</strong></span>
    </p>
  );
}
