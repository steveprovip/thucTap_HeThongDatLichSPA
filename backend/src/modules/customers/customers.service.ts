import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
      const digits = q.replace(/\D/g, '');
      // QA 11/10: gõ TÊN (không có chữ số) từng khớp mọi khách vì `phone LIKE '%%'` → chỉ so SĐT khi có ≥ 3 chữ số.
      if (digits.length >= 3) {
        qb.where('(f_unaccent(lower(c.full_name)) LIKE :t OR c.phone LIKE :raw)', { t: term, raw: `%${digits}%` });
      } else {
        qb.where('f_unaccent(lower(c.full_name)) LIKE :t', { t: term });
      }
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
    if (dto.fullName !== undefined) {
      if (!dto.fullName.trim()) throw new BadRequestException({ message: 'Tên khách không được để trống', field: 'fullName' });
      c.fullName = dto.fullName.trim();
    }
    if (dto.email !== undefined) c.email = dto.email;
    if (dto.note !== undefined) c.note = dto.note;
    return this.repo.save(c);
  }

  /**
   * QA Sprint 3 · đề xuất 5 + NFR "xoá dữ liệu khách theo yêu cầu trong 7 ngày".
   * Bất biến "không xoá cứng dữ liệu đã được tham chiếu": khách CHƯA có lịch hẹn / phiếu → xoá hẳn; đã có → ẨN DANH
   * (xoá tên, SĐT, email, ghi chú, ghi chú trên lịch hẹn, nhận xét đánh giá) nhưng giữ lịch hẹn / phiếu / điểm sao để
   * doanh thu và thống kê không đổi. SĐT thay bằng số giả đầu "00" (không phải đầu số di động VN, không trùng khách thật).
   */
  async remove(id: string): Promise<{ id: string; mode: 'deleted' | 'anonymized' }> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy hồ sơ khách hàng');
    const [{ n }] = await this.repo.query(
      `SELECT (SELECT count(*) FROM appointments WHERE customer_id = $1)
            + (SELECT count(*) FROM invoices WHERE customer_id = $1) AS n`, [id]);
    if (Number(n) === 0) {
      await this.repo.delete({ id });
      return { id, mode: 'deleted' };
    }
    if (c.phone.startsWith('00')) throw new ConflictException('Hồ sơ này đã được ẩn danh trước đó');
    await this.repo.manager.transaction(async (m) => {
      for (let attempt = 0; ; attempt += 1) {
        const fake = `00${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
        const taken = await m.query('SELECT 1 FROM customers WHERE phone = $1', [fake]);
        if (taken.length && attempt < 5) continue;
        await m.query(
          `UPDATE customers SET full_name = 'Khách đã xoá dữ liệu', phone = $2, email = NULL, note = NULL WHERE id = $1`, [id, fake]);
        break;
      }
      await m.query('UPDATE appointments SET customer_note = NULL WHERE customer_id = $1', [id]);
      await m.query('UPDATE reviews SET comment = NULL WHERE customer_id = $1', [id]);
      // Thư đã / sắp gửi chứa địa chỉ email + tên khách: đây là nhật ký gửi, không phải chứng từ → xoá
      await m.query('DELETE FROM email_queue WHERE appointment_id IN (SELECT id FROM appointments WHERE customer_id = $1)', [id]);
    });
    return { id, mode: 'anonymized' };
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
