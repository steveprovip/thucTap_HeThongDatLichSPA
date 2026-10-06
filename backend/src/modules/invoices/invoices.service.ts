import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Invoice, InvoiceStatus, PaymentMethod } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Voucher, DiscountType } from '../../database/entities/voucher.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { MSG } from '../../common/constants/messages.constant';
import { AuthUser } from '../../common/types/auth.types';
import { formatVnd } from '../../common/utils/currency.util';
import { generateInvoiceCode } from '../../common/utils/code.util';
import { todaySalon } from '../../common/utils/time.util';
import { ReviewsService } from '../reviews/reviews.service';
import {
  AdjustInvoiceDto, CreateInvoiceDto, CreateVoucherDto, InvoiceItemDto, PayInvoiceDto, UpdateInvoiceDto,
} from './dto/invoice.dto';

export interface InvoiceView {
  id: string;
  code: string;
  appointmentId: string;
  appointmentCode: string;
  customerName: string;
  customerPhone: string;
  stylistName: string;
  items: { id: string; serviceId: string | null; name: string; unitPrice: number; unitPriceText: string;
    quantity: number; lineTotal: number; lineTotalText: string }[];
  subtotal: number;
  subtotalText: string;
  voucherCode: string | null;
  discountAmount: number;
  discountAmountText: string;
  total: number;
  totalText: string;
  paymentMethod: PaymentMethod | null;
  transferNote: string | null;
  status: InvoiceStatus;
  statusLabel: string;
  adjustsInvoiceId: string | null;
  adjustReason: string | null;
  paidAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Nháp',
  [InvoiceStatus.PAID]: 'Đã thanh toán',
  [InvoiceStatus.CLOSED]: 'Đã đóng',
  [InvoiceStatus.ADJUSTED]: 'Đã điều chỉnh',
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reviews: ReviewsService,
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly itemRepo: Repository<InvoiceItem>,
    @InjectRepository(Voucher) private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  // ---------------------------------------------------------------- HELPERS
  private async toView(invoice: Invoice): Promise<InvoiceView> {
    const items = await this.itemRepo.find({ where: { invoiceId: invoice.id }, order: { createdAt: 'ASC' } });
    const appt = await this.apptRepo.findOne({ where: { id: invoice.appointmentId } });
    const customer = await this.customerRepo.findOne({ where: { id: invoice.customerId } });
    const stylist = await this.stylistRepo.findOne({ where: { id: invoice.stylistId } });

    return {
      id: invoice.id,
      code: invoice.code,
      appointmentId: invoice.appointmentId,
      appointmentCode: appt?.code ?? '',
      customerName: customer?.fullName ?? '',
      customerPhone: customer?.phone ?? '',
      stylistName: stylist?.fullName ?? '',
      items: items.map((i) => ({
        id: i.id,
        serviceId: i.serviceId,
        name: i.name,
        unitPrice: i.unitPrice,
        unitPriceText: formatVnd(i.unitPrice),
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        lineTotalText: formatVnd(i.lineTotal),
      })),
      subtotal: invoice.subtotal,
      subtotalText: formatVnd(invoice.subtotal),
      voucherCode: invoice.voucherCode,
      discountAmount: invoice.discountAmount,
      discountAmountText: formatVnd(invoice.discountAmount),
      total: invoice.total,
      totalText: formatVnd(invoice.total),
      paymentMethod: invoice.paymentMethod,
      transferNote: invoice.transferNote,
      status: invoice.status,
      statusLabel: STATUS_LABELS[invoice.status],
      adjustsInvoiceId: invoice.adjustsInvoiceId,
      adjustReason: invoice.adjustReason,
      paidAt: invoice.paidAt,
      closedAt: invoice.closedAt,
      createdAt: invoice.createdAt,
    };
  }

  /** S4-02: một phiếu chỉ áp một mã; mã hết hạn thì báo lỗi và KHÔNG đổi tổng tiền. */
  private async resolveVoucher(code: string | null | undefined, subtotal: number): Promise<{
    voucher: Voucher | null; discount: number;
  }> {
    if (!code) return { voucher: null, discount: 0 };
    const voucher = await this.voucherRepo
      .createQueryBuilder('v').where('upper(v.code) = upper(:c)', { c: code.trim() }).getOne();
    if (!voucher || !voucher.isActive) throw new BadRequestException(MSG.VOUCHER_NOT_FOUND);

    const today = todaySalon();
    if (today < voucher.startDate || today > voucher.endDate) {
      throw new BadRequestException(MSG.VOUCHER_EXPIRED);
    }
    if (voucher.maxUsage !== null && voucher.usedCount >= voucher.maxUsage) {
      throw new BadRequestException(MSG.VOUCHER_USED_UP);
    }

    const discount = voucher.discountType === DiscountType.PERCENT
      ? Math.round((subtotal * voucher.discountValue) / 100)
      : Math.min(voucher.discountValue, subtotal);

    return { voucher, discount };
  }

  private computeTotals(items: InvoiceItemDto[]): { lines: Omit<InvoiceItem, 'id' | 'invoice' | 'service' | 'createdAt' | 'invoiceId'>[]; subtotal: number } {
    if (!items.length) throw new BadRequestException(MSG.INVOICE_NO_ITEMS);
    let subtotal = 0;
    const lines = items.map((i) => {
      const lineTotal = i.unitPrice * i.quantity;
      subtotal += lineTotal;
      return {
        serviceId: i.serviceId ?? null,
        name: i.name,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal,
      } as Omit<InvoiceItem, 'id' | 'invoice' | 'service' | 'createdAt' | 'invoiceId'>;
    });
    return { lines, subtotal };
  }

  // ------------------------------------------------------------------ CRUD
  /**
   * S4-01: lập phiếu, tự nạp các dịch vụ của lịch hẹn kèm đơn giá tại thời điểm hẹn.
   * Chỉ lập được khi thợ đã bấm hoàn tất.
   */
  async create(dto: CreateInvoiceDto, user: AuthUser): Promise<InvoiceView> {
    const appt = await this.apptRepo.findOne({ where: { id: dto.appointmentId } });
    if (!appt) throw new NotFoundException(MSG.APPOINTMENT_NOT_FOUND);
    if (appt.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(MSG.INVOICE_REQUIRES_COMPLETED);
    }
    const existing = await this.repo.findOne({
      where: { appointmentId: dto.appointmentId, adjustsInvoiceId: null as unknown as undefined },
    });
    if (existing) throw new ConflictException(MSG.INVOICE_EXISTS);

    const apptServices = await this.apptServiceRepo.find({
      where: { appointmentId: dto.appointmentId }, order: { position: 'ASC' },
    });
    const items: InvoiceItemDto[] = dto.items?.length
      ? dto.items
      : apptServices.map((s) => ({
          serviceId: s.serviceId, name: s.nameSnapshot, unitPrice: s.priceSnapshot, quantity: 1,
        }));

    const { lines, subtotal } = this.computeTotals(items);

    const saved = await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(Invoice, {
          code: generateInvoiceCode(),
          appointmentId: appt.id,
          customerId: appt.customerId,
          stylistId: appt.stylistId,
          subtotal,
          discountAmount: 0,
          total: subtotal,
          status: InvoiceStatus.DRAFT,
          createdBy: user.id,
        }),
      );
      await manager.save(lines.map((l) => manager.create(InvoiceItem, { ...l, invoiceId: invoice.id })));
      return invoice;
    });

    return this.toView(saved);
  }

  async findOne(id: string): Promise<InvoiceView> {
    const invoice = await this.repo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    return this.toView(invoice);
  }

  async findByAppointment(appointmentId: string): Promise<InvoiceView | null> {
    const invoice = await this.repo.findOne({
      where: { appointmentId },
      order: { createdAt: 'DESC' },
    });
    return invoice ? this.toView(invoice) : null;
  }

  /** Khoá dòng phiếu (FOR UPDATE) và bảo đảm phiếu còn sửa được; trả về trạng thái hiện tại trong CSDL. */
  private async lockOpenInvoice(manager: EntityManager, id: string): Promise<InvoiceStatus> {
    const rows: { status: InvoiceStatus }[] = await manager.query('SELECT status FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    if (rows[0].status === InvoiceStatus.CLOSED || rows[0].status === InvoiceStatus.ADJUSTED) {
      throw new ConflictException(MSG.INVOICE_CLOSED);
    }
    return rows[0].status;
  }

  /** Sửa dòng dịch vụ / áp mã giảm giá khi phiếu còn ở trạng thái nháp. */
  async update(id: string, dto: UpdateInvoiceDto): Promise<InvoiceView> {
    const invoice = await this.repo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    if (invoice.status === InvoiceStatus.CLOSED || invoice.status === InvoiceStatus.ADJUSTED) {
      throw new ConflictException(MSG.INVOICE_CLOSED);
    }

    const { lines, subtotal } = this.computeTotals(dto.items);
    const { voucher, discount } = await this.resolveVoucher(dto.voucherCode, subtotal);

    await this.dataSource.transaction(async (manager) => {
      // Khoá dòng phiếu + đọc lại trạng thái TRONG giao dịch: "Đóng phiếu" chạy song song không thể bị lượt sửa này
      // kéo phiếu đã đóng về nháp (kiểm tra ở trên chỉ là đọc trước, không giữ khoá)
      invoice.status = await this.lockOpenInvoice(manager, id);
      await manager.delete(InvoiceItem, { invoiceId: id });
      await manager.save(lines.map((l) => manager.create(InvoiceItem, { ...l, invoiceId: id })));
      invoice.subtotal = subtotal;
      invoice.voucherId = voucher?.id ?? null;
      invoice.voucherCode = voucher?.code ?? null;
      invoice.discountAmount = discount;
      invoice.total = Math.max(0, subtotal - discount);
      // Đã ghi nhận thanh toán mà sửa số tiền -> số đã thu không còn khớp phiếu: buộc thu lại
      if (invoice.status === InvoiceStatus.PAID) {
        invoice.status = InvoiceStatus.DRAFT;
        invoice.paidAt = null;
      }
      await manager.save(Invoice, invoice);
    });

    return this.toView(invoice);
  }

  async pay(id: string, dto: PayInvoiceDto): Promise<InvoiceView> {
    const invoice = await this.repo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    if (invoice.status === InvoiceStatus.CLOSED || invoice.status === InvoiceStatus.ADJUSTED) {
      throw new ConflictException(MSG.INVOICE_CLOSED);
    }
    if (dto.paymentMethod === PaymentMethod.TRANSFER && !dto.transferNote?.trim()) {
      throw new BadRequestException({ message: MSG.TRANSFER_NOTE_REQUIRED, field: 'transferNote' });
    }

    invoice.paymentMethod = dto.paymentMethod;
    invoice.transferNote = dto.paymentMethod === PaymentMethod.TRANSFER ? dto.transferNote!.trim() : null;
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await this.lockOpenInvoice(manager, id);
      await manager.save(Invoice, invoice);
    });
    return this.toView(invoice);
  }

  /**
   * S4-01: chỉ đóng lịch hẹn khi thợ đã hoàn tất VÀ phiếu đã thanh toán.
   * Đóng xong thì phát sinh liên kết đánh giá (S4-04).
   */
  async close(id: string): Promise<InvoiceView> {
    const invoice = await this.repo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    if (invoice.status === InvoiceStatus.CLOSED) return this.toView(invoice);
    if (invoice.status !== InvoiceStatus.PAID) throw new BadRequestException(MSG.CLOSE_REQUIRES_PAID);

    const appt = await this.apptRepo.findOne({ where: { id: invoice.appointmentId } });
    if (!appt || appt.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(MSG.INVOICE_REQUIRES_COMPLETED);
    }

    const closedAt = new Date();
    const closedNow = await this.dataSource.transaction(async (manager) => {
      // Chuyển trạng thái CÓ ĐIỀU KIỆN: bấm "Đóng phiếu" 2 lần / 2 máy cùng lúc chỉ đóng 1 lần
      const res = await manager.update(Invoice, { id, status: InvoiceStatus.PAID }, { status: InvoiceStatus.CLOSED, closedAt });
      if (!res.affected) return false;
      if (invoice.voucherId) {
        // Tăng lượt dùng có chặn trần max_usage ngay tại câu UPDATE (không vượt dù đóng song song)
        const used = await manager
          .createQueryBuilder()
          .update(Voucher)
          .set({ usedCount: () => 'used_count + 1' })
          .where('id = :vid AND (max_usage IS NULL OR used_count < max_usage)', { vid: invoice.voucherId })
          .execute();
        if (!used.affected) throw new BadRequestException(MSG.VOUCHER_USED_UP);
      }
      return true;
    });
    if (!closedNow) return this.findOne(id);
    invoice.status = InvoiceStatus.CLOSED;
    invoice.closedAt = closedAt;

    await this.reviews.createInvitation(invoice.appointmentId);
    return this.toView(invoice);
  }

  /** S4-01: phiếu đã đóng không sửa được, phải tạo phiếu điều chỉnh có ghi lý do. */
  async adjust(id: string, dto: AdjustInvoiceDto, user: AuthUser): Promise<InvoiceView> {
    const origin = await this.repo.findOne({ where: { id } });
    if (!origin) throw new NotFoundException(MSG.INVOICE_NOT_FOUND);
    if (origin.status !== InvoiceStatus.CLOSED) {
      throw new BadRequestException('Chỉ tạo phiếu điều chỉnh cho phiếu đã đóng');
    }

    const { lines, subtotal } = this.computeTotals(dto.items);
    const { voucher, discount } = await this.resolveVoucher(dto.voucherCode, subtotal);

    const adjusted = await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(Invoice, {
          code: generateInvoiceCode(),
          appointmentId: origin.appointmentId,
          customerId: origin.customerId,
          stylistId: origin.stylistId,
          subtotal,
          voucherId: voucher?.id ?? null,
          voucherCode: voucher?.code ?? null,
          discountAmount: discount,
          total: Math.max(0, subtotal - discount),
          paymentMethod: origin.paymentMethod,
          transferNote: origin.transferNote,
          status: InvoiceStatus.CLOSED,
          adjustsInvoiceId: origin.id,
          adjustReason: dto.reason,
          createdBy: user.id,
          paidAt: new Date(),
          closedAt: new Date(),
        }),
      );
      await manager.save(lines.map((l) => manager.create(InvoiceItem, { ...l, invoiceId: invoice.id })));
      // Có điều kiện: hai lượt "Lập phiếu điều chỉnh" cùng lúc chỉ một lượt thành công (lượt kia huỷ cả giao dịch)
      const res = await manager.update(Invoice, { id: origin.id, status: InvoiceStatus.CLOSED }, { status: InvoiceStatus.ADJUSTED });
      if (!res.affected) throw new ConflictException('Phiếu này vừa được điều chỉnh bởi người khác. Tải lại để xem phiếu mới nhất');
      origin.status = InvoiceStatus.ADJUSTED;
      return invoice;
    });

    return this.toView(adjusted);
  }

  async list(params: { from?: string; to?: string; status?: InvoiceStatus; page: number; limit: number }) {
    const qb = this.repo.createQueryBuilder('i');
    if (params.from) qb.andWhere('i.created_at >= :from', { from: `${params.from}T00:00:00+07:00` });
    if (params.to) qb.andWhere('i.created_at <= :to', { to: `${params.to}T23:59:59+07:00` });
    if (params.status) qb.andWhere('i.status = :st', { st: params.status });
    qb.orderBy('i.createdAt', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit);

    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map((r) => this.toView(r)));
    return { items, total, page: params.page, limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)) };
  }

  // -------------------------------------------------------------- VOUCHERS
  async listVouchers(): Promise<Voucher[]> {
    return this.voucherRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createVoucher(dto: CreateVoucherDto): Promise<Voucher> {
    if (dto.discountType === DiscountType.PERCENT && dto.discountValue > 100) {
      throw new BadRequestException({ message: 'Giảm theo phần trăm tối đa là 100', field: 'discountValue' });
    }
    if (dto.endDate < dto.startDate) throw new BadRequestException(MSG.DATE_RANGE_INVALID);
    const dup = await this.voucherRepo
      .createQueryBuilder('v').where('upper(v.code) = upper(:c)', { c: dto.code }).getOne();
    if (dup) throw new ConflictException({ message: 'Mã giảm giá đã tồn tại', field: 'code' });

    return this.voucherRepo.save(
      this.voucherRepo.create({
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        startDate: dto.startDate.slice(0, 10),
        endDate: dto.endDate.slice(0, 10),
        maxUsage: dto.maxUsage ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async removeVoucher(id: string): Promise<{ success: boolean }> {
    const v = await this.voucherRepo.findOne({ where: { id } });
    if (!v) throw new NotFoundException(MSG.VOUCHER_NOT_FOUND);
    v.isActive = false;
    await this.voucherRepo.save(v);
    return { success: true };
  }

  /** Xem trước số tiền giảm khi lễ tân gõ mã. */
  async previewVoucher(code: string, subtotal: number) {
    const { voucher, discount } = await this.resolveVoucher(code, subtotal);
    return {
      code: voucher?.code ?? null,
      discountAmount: discount,
      discountAmountText: formatVnd(discount),
      total: Math.max(0, subtotal - discount),
      totalText: formatVnd(Math.max(0, subtotal - discount)),
    };
  }
}
