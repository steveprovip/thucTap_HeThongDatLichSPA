import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { ServiceNote } from '../../database/entities/service-note.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { MSG } from '../../common/constants/messages.constant';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import { isValidVnPhone, maskPhone, normalizePhone } from '../../common/utils/phone.util';
import { normalizeSearch } from '../../common/utils/text.util';
import { Role } from '../../common/constants/roles.constant';
import { UpdateCustomerDto } from './dto/customer.dto';

export interface CustomerView {
  id: string;
  fullName: string;
  phone: string;
  phoneMasked: boolean;
  email: string | null;
  /** Lượt hoàn tất: số lịch trạng thái 'completed'. */
  totalVisits: number;
  /** Lượt không đến: số lịch trạng thái 'no_show'. */
  noShowCount: number;
  /** Tổng lịch đã đặt: mọi lịch từng được tạo (mọi trạng thái). */
  totalAppointments: number;
  note: string | null;
  isNew: boolean;
  createdAt: Date;
}

export interface VisitHistoryItem {
  appointmentId: string;
  code: string;
  date: Date;
  status: AppointmentStatus;
  stylistName: string;
  services: string[];
  technicalNote: string | null;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
    @InjectRepository(ServiceNote) private readonly noteRepo: Repository<ServiceNote>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
  ) {}

  /** Thợ chỉ thấy số điện thoại đã che; Lễ tân / Chủ tiệm / Admin thấy đầy đủ. */
  toView(c: Customer, viewerRole: Role): CustomerView {
    const mask = viewerRole === Role.STYLIST || viewerRole === Role.CUSTOMER;
    return {
      id: c.id,
      fullName: c.fullName,
      phone: mask ? maskPhone(c.phone) : c.phone,
      phoneMasked: mask,
      email: c.email,
      totalVisits: c.totalVisits,
      noShowCount: c.noShowCount,
      totalAppointments: c.totalAppointments,
      note: c.note,
      isNew: c.totalVisits === 0,
      createdAt: c.createdAt,
    };
  }

  /**
   * S3-10: gộp các lần đến của cùng một số điện thoại thành một hồ sơ.
   * Tên khác trên lịch hẹn mới KHÔNG ghi đè tên hồ sơ cũ — trả về cờ nameConflict
   * để lễ tân chọn.
   */
  async findOrCreateByPhone(
    params: { phone: string; fullName: string; email?: string | null },
    manager?: EntityManager,
  ): Promise<{ customer: Customer; nameConflict: boolean; isNew: boolean }> {
    const phone = normalizePhone(params.phone);
    if (!isValidVnPhone(phone)) throw new BadRequestException({ message: MSG.PHONE_INVALID, field: 'phone' });

    const repo = manager ? manager.getRepository(Customer) : this.repo;
    const existing = await repo.findOne({ where: { phone } });

    if (existing) {
      const nameConflict =
        normalizeSearch(existing.fullName) !== normalizeSearch(params.fullName) && params.fullName.trim().length > 0;
      // Chỉ bổ sung email nếu hồ sơ cũ chưa có
      if (!existing.email && params.email) {
        existing.email = params.email;
        await repo.save(existing);
      }
      return { customer: existing, nameConflict, isNew: false };
    }

    const created = await repo.save(
      repo.create({
        phone,
        fullName: params.fullName.trim(),
        email: params.email ?? null,
      }),
    );
    return { customer: created, nameConflict: false, isNew: true };
  }

  async search(q: string | undefined, page: number, limit: number, viewerRole: Role): Promise<PaginatedResult<CustomerView>> {
    const qb = this.repo.createQueryBuilder('c');
    if (q && q.trim()) {
      const term = `%${normalizeSearch(q)}%`;
      qb.where('(f_unaccent(lower(c.full_name)) LIKE :t OR c.phone LIKE :raw)', {
        t: term, raw: `%${q.replace(/\D/g, '')}%`,
      });
    }
    qb.orderBy('c.updatedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return paginate(items.map((c) => this.toView(c, viewerRole)), total, page, limit);
  }

  async findById(id: string, viewerRole: Role): Promise<CustomerView> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy hồ sơ khách hàng');
    return this.toView(c, viewerRole);
  }

  async findByPhone(phone: string, viewerRole: Role): Promise<CustomerView | null> {
    const c = await this.repo.findOne({ where: { phone: normalizePhone(phone) } });
    return c ? this.toView(c, viewerRole) : null;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy hồ sơ khách hàng');
    if (dto.fullName !== undefined) c.fullName = dto.fullName.trim();
    if (dto.email !== undefined) c.email = dto.email;
    if (dto.note !== undefined) c.note = dto.note;
    return this.repo.save(c);
  }

  /** S4-03: 10 lượt gần nhất của khách kèm ghi chú kỹ thuật. */
  async visitHistory(customerId: string, limit = 10): Promise<VisitHistoryItem[]> {
    const appts = await this.apptRepo.find({
      where: { customerId },
      order: { startAt: 'DESC' },
      take: limit,
    });
    if (!appts.length) return [];

    const ids = appts.map((a) => a.id);
    const services = await this.apptServiceRepo
      .createQueryBuilder('s').where('s.appointment_id IN (:...ids)', { ids }).getMany();
    const notes = await this.noteRepo
      .createQueryBuilder('n').where('n.appointment_id IN (:...ids)', { ids }).getMany();
    const stylists = await this.stylistRepo.find();
    const stylistMap = new Map(stylists.map((s) => [s.id, s.fullName]));

    return appts.map((a) => ({
      appointmentId: a.id,
      code: a.code,
      date: a.startAt,
      status: a.status,
      stylistName: stylistMap.get(a.stylistId) ?? '',
      services: services.filter((s) => s.appointmentId === a.id).map((s) => s.nameSnapshot),
      technicalNote: notes.find((n) => n.appointmentId === a.id)?.content ?? null,
    }));
  }

  /**
   * Tính lại 3 chỉ số của hồ sơ khách — LUÔN đếm trực tiếp từ bảng appointments:
   * lượt hoàn tất (completed), lượt không đến (no_show), tổng lịch đã đặt (mọi trạng thái).
   * Gọi sau mỗi lần tạo lịch / đổi trạng thái / huỷ để các màn hình luôn khớp nhau.
   */
  async refreshCounters(customerId: string, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.repo.manager;
    await runner.query(
      `UPDATE customers c SET
         total_visits       = COALESCE(t.visits, 0),
         no_show_count      = COALESCE(t.no_shows, 0),
         total_appointments = COALESCE(t.total, 0)
       FROM (
         SELECT $1::uuid AS customer_id,
                COUNT(*) FILTER (WHERE status = 'completed') AS visits,
                COUNT(*) FILTER (WHERE status = 'no_show')   AS no_shows,
                COUNT(*)                                      AS total
           FROM appointments WHERE customer_id = $1::uuid
       ) t
       WHERE c.id = t.customer_id`,
      [customerId],
    );
  }

  async upsertServiceNote(params: {
    appointmentId: string;
    customerId: string;
    stylistId: string | null;
    content: string;
    createdBy: string | null;
  }): Promise<ServiceNote> {
    const existing = await this.noteRepo.findOne({ where: { appointmentId: params.appointmentId } });
    if (existing) {
      existing.content = params.content;
      existing.stylistId = params.stylistId;
      return this.noteRepo.save(existing);
    }
    return this.noteRepo.save(this.noteRepo.create({ ...params }));
  }
}
