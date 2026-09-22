import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from '../../database/entities/invoice.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { StylistShift } from '../../database/entities/stylist-shift.entity';
import { MSG } from '../../common/constants/messages.constant';
import { formatVnd } from '../../common/utils/currency.util';
import { buildCsv } from '../../common/utils/csv.util';
import {
  addDays, daysBetween, endOfDay, startOfDay, todaySalon, toSalon,
} from '../../common/utils/time.util';
import { DateTime } from 'luxon';

export interface RevenueByStylistRow {
  stylistId: string;
  stylistName: string;
  completedCount: number;
  revenue: number;
  revenueText: string;
  avgPerVisit: number;
  avgPerVisitText: string;
}

export interface RevenueByServiceRow {
  serviceId: string | null;
  serviceName: string;
  quantity: number;
  revenue: number;
  revenueText: string;
}

export interface SlotDensityRow {
  hour: number;
  hourLabel: string;
  weekdayCount: number;
  weekendCount: number;
  totalCount: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(StylistShift) private readonly shiftRepo: Repository<StylistShift>,
  ) {}

  /** Mặc định là tháng hiện tại, tối đa 365 ngày một lần xem (S4-07). */
  resolveRange(from?: string, to?: string): { from: string; to: string } {
    const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
    const f = from ?? now.startOf('month').toFormat('yyyy-MM-dd');
    const t = to ?? now.endOf('month').toFormat('yyyy-MM-dd');
    if (t < f) throw new BadRequestException(MSG.DATE_RANGE_INVALID);
    if (daysBetween(f, t) > 365) throw new BadRequestException(MSG.DATE_RANGE_TOO_LONG);
    return { from: f, to: t };
  }

  /** S4-07: doanh thu theo thợ, chỉ tính phiếu ĐÃ ĐÓNG. */
  async revenueByStylist(from: string, to: string): Promise<RevenueByStylistRow[]> {
    const rows = await this.dataSource.query(
      `SELECT s.id   AS stylist_id,
              s.full_name AS stylist_name,
              COUNT(i.id)::int AS completed_count,
              COALESCE(SUM(i.total), 0)::bigint AS revenue,
              COALESCE(ROUND(AVG(i.total)), 0)::bigint AS avg_per_visit
         FROM stylists s
         LEFT JOIN invoices i
           ON i.stylist_id = s.id
          AND i.status = 'closed'
          AND i.closed_at >= $1 AND i.closed_at <= $2
        GROUP BY s.id, s.full_name
        HAVING COUNT(i.id) > 0
        ORDER BY revenue DESC, s.full_name`,
      [startOfDay(from), endOfDay(to)],
    );
    return (rows as Record<string, string>[]).map((r) => ({
      stylistId: r.stylist_id,
      stylistName: r.stylist_name,
      completedCount: Number(r.completed_count),
      revenue: Number(r.revenue),
      revenueText: formatVnd(Number(r.revenue)),
      avgPerVisit: Number(r.avg_per_visit),
      avgPerVisitText: formatVnd(Number(r.avg_per_visit)),
    }));
  }

  /** S4-07: doanh thu theo dịch vụ, sắp xếp giảm dần theo doanh thu. */
  async revenueByService(from: string, to: string): Promise<RevenueByServiceRow[]> {
    const rows = await this.dataSource.query(
      `SELECT ii.service_id,
              ii.name AS service_name,
              SUM(ii.quantity)::int AS quantity,
              SUM(ii.line_total)::bigint AS revenue
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.status = 'closed' AND i.closed_at >= $1 AND i.closed_at <= $2
        GROUP BY ii.service_id, ii.name
        ORDER BY revenue DESC`,
      [startOfDay(from), endOfDay(to)],
    );
    return (rows as Record<string, string>[]).map((r) => ({
      serviceId: r.service_id ?? null,
      serviceName: r.service_name,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
      revenueText: formatVnd(Number(r.revenue)),
    }));
  }

  /** Tổng doanh thu để đối chiếu 100% với tổng phiếu trong cùng khoảng ngày. */
  async revenueSummary(from: string, to: string) {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS invoice_count,
              COALESCE(SUM(subtotal), 0)::bigint   AS subtotal,
              COALESCE(SUM(discount_amount), 0)::bigint AS discount,
              COALESCE(SUM(total), 0)::bigint      AS total
         FROM invoices
        WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2`,
      [startOfDay(from), endOfDay(to)],
    );
    return {
      invoiceCount: Number(row.invoice_count),
      subtotal: Number(row.subtotal),
      subtotalText: formatVnd(Number(row.subtotal)),
      discount: Number(row.discount),
      discountText: formatVnd(Number(row.discount)),
      total: Number(row.total),
      totalText: formatVnd(Number(row.total)),
    };
  }

  /** S4-09: tỉ lệ không đến và tỉ lệ huỷ, một chữ số thập phân. */
  async noShowStats(from: string, to: string) {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'no_show')::int   AS no_show,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM appointments
        WHERE start_at >= $1 AND start_at <= $2`,
      [startOfDay(from), endOfDay(to)],
    );
    const total = Number(row.total);
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
    return {
      total,
      noShow: Number(row.no_show),
      cancelled: Number(row.cancelled),
      completed: Number(row.completed),
      noShowRate: pct(Number(row.no_show)),
      cancelRate: pct(Number(row.cancelled)),
      completionRate: pct(Number(row.completed)),
    };
  }

  /** S4-09: phân bố lượt hẹn theo khung giờ, tách ngày thường và cuối tuần. */
  async slotDensity(from: string, to: string): Promise<SlotDensityRow[]> {
    const rows = await this.dataSource.query(
      `SELECT EXTRACT(HOUR FROM (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS hour,
              COUNT(*) FILTER (
                WHERE EXTRACT(DOW FROM (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) BETWEEN 1 AND 5
              )::int AS weekday_count,
              COUNT(*) FILTER (
                WHERE EXTRACT(DOW FROM (start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 6)
              )::int AS weekend_count,
              COUNT(*)::int AS total_count
         FROM appointments
        WHERE start_at >= $1 AND start_at <= $2
          AND status NOT IN ('cancelled')
        GROUP BY hour
        ORDER BY hour`,
      [startOfDay(from), endOfDay(to)],
    );
    return (rows as Record<string, string>[]).map((r) => ({
      hour: Number(r.hour),
      hourLabel: `${String(r.hour).padStart(2, '0')}:00`,
      weekdayCount: Number(r.weekday_count),
      weekendCount: Number(r.weekend_count),
      totalCount: Number(r.total_count),
    }));
  }

  /** S4-08: trang tổng quan của hôm nay. */
  async todayDashboard(date?: string) {
    const day = date ?? todaySalon();
    const [statusRow] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int     AS pending,
              COUNT(*) FILTER (WHERE status = 'confirmed')::int   AS confirmed,
              COUNT(*) FILTER (WHERE status = 'arrived')::int     AS arrived,
              COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
              COUNT(*) FILTER (WHERE status = 'completed')::int   AS completed,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int   AS cancelled,
              COUNT(*) FILTER (WHERE status = 'no_show')::int     AS no_show,
              COUNT(*)::int AS total
         FROM appointments
        WHERE start_at >= $1 AND start_at <= $2`,
      [startOfDay(day), endOfDay(day)],
    );

    const [revenueRow] = await this.dataSource.query(
      `SELECT COALESCE(SUM(total), 0)::bigint AS revenue, COUNT(*)::int AS invoices
         FROM invoices
        WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2`,
      [startOfDay(day), endOfDay(day)],
    );

    const [shiftRow] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT stylist_id)::int AS working_stylists
         FROM stylist_shifts WHERE work_date = $1`,
      [day],
    );

    const revenue = Number(revenueRow.revenue);
    return {
      date: day,
      statuses: {
        pending: Number(statusRow.pending),
        confirmed: Number(statusRow.confirmed),
        arrived: Number(statusRow.arrived),
        in_progress: Number(statusRow.in_progress),
        completed: Number(statusRow.completed),
        cancelled: Number(statusRow.cancelled),
        no_show: Number(statusRow.no_show),
      },
      totalAppointments: Number(statusRow.total),
      revenue,
      revenueText: formatVnd(revenue),
      invoiceCount: Number(revenueRow.invoices),
      workingStylists: Number(shiftRow.working_stylists),
      refreshedAt: new Date(),
    };
  }

  /** Doanh thu theo ngày, dùng cho biểu đồ đường trên dashboard. */
  async revenueByDay(from: string, to: string) {
    const rows = await this.dataSource.query(
      `SELECT (closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
              COALESCE(SUM(total), 0)::bigint AS revenue,
              COUNT(*)::int AS invoices
         FROM invoices
        WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2
        GROUP BY day ORDER BY day`,
      [startOfDay(from), endOfDay(to)],
    );
    const map = new Map(
      (rows as { day: Date | string; revenue: string; invoices: number }[]).map((r) => [
        typeof r.day === 'string' ? r.day.slice(0, 10) : toSalon(r.day).toFormat('yyyy-MM-dd'),
        { revenue: Number(r.revenue), invoices: Number(r.invoices) },
      ]),
    );

    const out: { date: string; revenue: number; revenueText: string; invoices: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const hit = map.get(d);
      out.push({
        date: d,
        revenue: hit?.revenue ?? 0,
        revenueText: formatVnd(hit?.revenue ?? 0),
        invoices: hit?.invoices ?? 0,
      });
    }
    return out;
  }

  // ------------------------------------------------------------- XUẤT CSV
  /** S4-07: CSV mã hoá UTF-8 (có BOM) mở đúng tiếng Việt trên Excel. */
  async exportStylistCsv(from: string, to: string): Promise<string> {
    const rows = await this.revenueByStylist(from, to);
    return buildCsv(
      ['Thợ', 'Số lượt hoàn tất', 'Tổng doanh thu (đ)', 'Trung bình mỗi lượt (đ)'],
      rows.map((r) => [r.stylistName, r.completedCount, r.revenue, r.avgPerVisit]),
    );
  }

  async exportServiceCsv(from: string, to: string): Promise<string> {
    const rows = await this.revenueByService(from, to);
    return buildCsv(
      ['Dịch vụ', 'Số lượt', 'Tổng doanh thu (đ)'],
      rows.map((r) => [r.serviceName, r.quantity, r.revenue]),
    );
  }

  async exportInvoicesCsv(from: string, to: string): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT i.code, i.closed_at, c.full_name AS customer, c.phone,
              s.full_name AS stylist, i.subtotal, i.discount_amount, i.total,
              i.payment_method, a.code AS appointment_code
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         JOIN stylists  s ON s.id = i.stylist_id
         JOIN appointments a ON a.id = i.appointment_id
        WHERE i.status = 'closed' AND i.closed_at >= $1 AND i.closed_at <= $2
        ORDER BY i.closed_at`,
      [startOfDay(from), endOfDay(to)],
    );
    return buildCsv(
      ['Mã phiếu', 'Thời điểm đóng', 'Khách hàng', 'Số điện thoại', 'Thợ',
        'Tạm tính (đ)', 'Giảm giá (đ)', 'Thực thu (đ)', 'Hình thức', 'Mã lịch hẹn'],
      (rows as Record<string, unknown>[]).map((r) => [
        r.code,
        toSalon(r.closed_at as Date).toFormat('dd/MM/yyyy HH:mm'),
        r.customer,
        r.phone,
        r.stylist,
        Number(r.subtotal),
        Number(r.discount_amount),
        Number(r.total),
        r.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
        r.appointment_code,
      ]),
    );
  }
}
