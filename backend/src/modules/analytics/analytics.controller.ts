import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { ReportRangeQuery } from './dto/analytics.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constant';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('analytics')
@UseGuards(RolesGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /** S4-08 — dashboard hôm nay (Lễ tân chỉ xem, Chủ tiệm toàn quyền). */
  @Get('today')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTIONIST)
  today(@Query('date') date?: string) {
    return this.service.todayDashboard(date);
  }

  /** S4-07 — báo cáo doanh thu theo thợ và theo dịch vụ. */
  @Get('revenue')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTIONIST)
  async revenue(@Query() q: ReportRangeQuery) {
    const { from, to } = this.service.resolveRange(q.from, q.to);
    const [byStylist, byService, summary, byDay] = await Promise.all([
      this.service.revenueByStylist(from, to),
      this.service.revenueByService(from, to),
      this.service.revenueSummary(from, to),
      this.service.revenueByDay(from, to),
    ]);
    return { from, to, summary, byStylist, byService, byDay };
  }

  /** S4-09 — tỉ lệ không đến và phân bố lượt hẹn theo khung giờ. */
  @Get('slot-density')
  @Roles(Role.OWNER, Role.ADMIN)
  async density(@Query() q: ReportRangeQuery) {
    const { from, to } = this.service.resolveRange(q.from, q.to);
    const [density, noShow] = await Promise.all([
      this.service.slotDensity(from, to),
      this.service.noShowStats(from, to),
    ]);
    return { from, to, density, noShow };
  }

  @Get('export/stylists.csv')
  @Roles(Role.OWNER, Role.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportStylists(@Query() q: ReportRangeQuery, @Res() res: Response) {
    const { from, to } = this.service.resolveRange(q.from, q.to);
    const csv = await this.service.exportStylistCsv(from, to);
    res.setHeader('Content-Disposition', `attachment; filename="doanh-thu-theo-tho_${from}_${to}.csv"`);
    res.send(csv);
  }

  @Get('export/services.csv')
  @Roles(Role.OWNER, Role.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportServices(@Query() q: ReportRangeQuery, @Res() res: Response) {
    const { from, to } = this.service.resolveRange(q.from, q.to);
    const csv = await this.service.exportServiceCsv(from, to);
    res.setHeader('Content-Disposition', `attachment; filename="doanh-thu-theo-dich-vu_${from}_${to}.csv"`);
    res.send(csv);
  }

  @Get('export/invoices.csv')
  @Roles(Role.OWNER, Role.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportInvoices(@Query() q: ReportRangeQuery, @Res() res: Response) {
    const { from, to } = this.service.resolveRange(q.from, q.to);
    const csv = await this.service.exportInvoicesCsv(from, to);
    res.setHeader('Content-Disposition', `attachment; filename="chi-tiet-phieu_${from}_${to}.csv"`);
    res.send(csv);
  }
}
