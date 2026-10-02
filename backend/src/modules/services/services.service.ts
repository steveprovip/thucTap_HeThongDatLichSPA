import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { ServiceItem } from '../../database/entities/service.entity';
import { StylistService } from '../../database/entities/stylist-service.entity';
import { AppointmentServiceItem } from '../../database/entities/appointment-service.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { MSG } from '../../common/constants/messages.constant';
import { normalizeSearch } from '../../common/utils/text.util';
import { formatVnd } from '../../common/utils/currency.util';
import {
  CreateCategoryDto, CreateServiceDto, ListServicesQuery, UpdateCategoryDto, UpdateServiceDto,
} from './dto/service.dto';

export interface ServiceView {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
  isActive: boolean;
  stylistIds: string[];
  stylistCount: number;
  /** Cảnh báo dịch vụ chưa có thợ nào đảm nhận (S1-07). */
  hasNoStylist: boolean;
  /** Số lịch hẹn đang tham chiếu dịch vụ; > 0 thì giao diện khoá nút xoá, chỉ cho ngừng kinh doanh (S1-05). */
  appointmentCount: number;
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ServiceCategory) private readonly categoryRepo: Repository<ServiceCategory>,
    @InjectRepository(ServiceItem) private readonly serviceRepo: Repository<ServiceItem>,
    @InjectRepository(StylistService) private readonly linkRepo: Repository<StylistService>,
    @InjectRepository(AppointmentServiceItem) private readonly apptServiceRepo: Repository<AppointmentServiceItem>,
  ) {}

  // ------------------------------------------------------------ CATEGORIES
  async listCategories(): Promise<(ServiceCategory & { serviceCount: number })[]> {
    const categories = await this.categoryRepo.find({ order: { displayOrder: 'ASC', name: 'ASC' } });
    const counts = await this.serviceRepo
      .createQueryBuilder('s')
      .select('s.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.category_id')
      .getRawMany<{ categoryId: string; count: string }>();
    const map = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));
    return categories.map((c) => Object.assign(c, { serviceCount: map.get(c.id) ?? 0 }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<ServiceCategory> {
    const dup = await this.categoryRepo
      .createQueryBuilder('c').where('lower(c.name) = lower(:n)', { n: dto.name.trim() }).getOne();
    if (dup) throw new ConflictException({ message: MSG.CATEGORY_NAME_DUPLICATED, field: 'name' });
    return this.categoryRepo.save(
      this.categoryRepo.create({ name: dto.name.trim(), displayOrder: dto.displayOrder ?? 0 }),
    );
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<ServiceCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(MSG.CATEGORY_NOT_FOUND);
    if (dto.name !== undefined) {
      const dup = await this.categoryRepo
        .createQueryBuilder('c')
        .where('lower(c.name) = lower(:n)', { n: dto.name.trim() })
        .andWhere('c.id <> :id', { id })
        .getOne();
      if (dup) throw new ConflictException({ message: MSG.CATEGORY_NAME_DUPLICATED, field: 'name' });
      category.name = dto.name.trim();
    }
    if (dto.displayOrder !== undefined) category.displayOrder = dto.displayOrder;
    return this.categoryRepo.save(category);
  }

  /** S1-06: nhóm còn dịch vụ đang bán thì không xoá được. */
  async removeCategory(id: string): Promise<{ success: boolean }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(MSG.CATEGORY_NOT_FOUND);
    const active = await this.serviceRepo.count({ where: { categoryId: id, isActive: true } });
    if (active > 0) throw new ConflictException(MSG.CATEGORY_HAS_SERVICES(active));
    const anyService = await this.serviceRepo.count({ where: { categoryId: id } });
    if (anyService > 0) throw new ConflictException(MSG.CATEGORY_HAS_SERVICES(anyService));
    await this.categoryRepo.delete(id);
    return { success: true };
  }

  // -------------------------------------------------------------- SERVICES
  private async toViews(services: ServiceItem[]): Promise<ServiceView[]> {
    if (services.length === 0) return [];
    const categories = await this.categoryRepo.find();
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const links = await this.linkRepo.find({ where: { serviceId: In(services.map((s) => s.id)) } });
    const byService = new Map<string, string[]>();
    for (const l of links) {
      const arr = byService.get(l.serviceId) ?? [];
      arr.push(l.stylistId);
      byService.set(l.serviceId, arr);
    }
    const usageRows: { serviceId: string; count: string }[] = await this.apptServiceRepo
      .createQueryBuilder('a')
      .select('a.serviceId', 'serviceId')
      .addSelect('COUNT(*)', 'count')
      .where('a.serviceId IN (:...ids)', { ids: services.map((s) => s.id) })
      .groupBy('a.serviceId')
      .getRawMany();
    const usage = new Map(usageRows.map((r) => [r.serviceId, Number(r.count)]));
    return services.map((s) => {
      const stylistIds = byService.get(s.id) ?? [];
      return {
        id: s.id,
        categoryId: s.categoryId,
        categoryName: catMap.get(s.categoryId) ?? '',
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
        priceText: formatVnd(s.price),
        description: s.description,
        isActive: s.isActive,
        stylistIds,
        stylistCount: stylistIds.length,
        hasNoStylist: stylistIds.length === 0,
        appointmentCount: usage.get(s.id) ?? 0,
      };
    });
  }

  async list(q: ListServicesQuery): Promise<ServiceView[]> {
    const qb = this.serviceRepo.createQueryBuilder('s')
      .leftJoin('service_categories', 'c', 'c.id = s.category_id');
    if (q.categoryId) qb.andWhere('s.category_id = :cid', { cid: q.categoryId });
    if (q.isActive !== undefined) qb.andWhere('s.is_active = :a', { a: q.isActive });
    if (q.search) {
      // Gõ không dấu vẫn ra kết quả có dấu (S2-03)
      qb.andWhere('f_unaccent(lower(s.name)) LIKE :t', { t: `%${normalizeSearch(q.search)}%` });
    }
    qb.orderBy('c.display_order', 'ASC').addOrderBy('s.name', 'ASC');
    const rows = await qb.getMany();
    let views = await this.toViews(rows);
    if (q.onlyWithStylist) views = views.filter((v) => v.stylistCount > 0);
    return views;
  }

  async findOne(id: string): Promise<ServiceView> {
    const service = await this.serviceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(MSG.SERVICE_NOT_FOUND);
    return (await this.toViews([service]))[0];
  }

  async findManyByIds(ids: string[]): Promise<ServiceItem[]> {
    if (ids.length === 0) return [];
    return this.serviceRepo.find({ where: { id: In(ids) } });
  }

  private validateRules(duration?: number, price?: number): void {
    if (duration !== undefined && (duration % 15 !== 0 || duration < 15 || duration > 240)) {
      throw new BadRequestException({ message: MSG.SERVICE_DURATION_INVALID, field: 'durationMinutes' });
    }
    if (price !== undefined && (!Number.isInteger(price) || price <= 0 || price > 20_000_000)) {
      throw new BadRequestException({ message: MSG.SERVICE_PRICE_INVALID, field: 'price' });
    }
  }

  async create(dto: CreateServiceDto): Promise<ServiceView> {
    this.validateRules(dto.durationMinutes, dto.price);
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(MSG.CATEGORY_NOT_FOUND);
    const dup = await this.serviceRepo
      .createQueryBuilder('s').where('lower(s.name) = lower(:n)', { n: dto.name.trim() }).getOne();
    if (dup) throw new ConflictException({ message: MSG.SERVICE_NAME_DUPLICATED, field: 'name' });

    const saved = await this.dataSource.transaction(async (manager) => {
      const service = await manager.save(
        manager.create(ServiceItem, {
          categoryId: dto.categoryId,
          name: dto.name.trim(),
          durationMinutes: dto.durationMinutes,
          price: dto.price,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
        }),
      );
      if (dto.stylistIds?.length) {
        await manager.save(
          dto.stylistIds.map((sid) =>
            manager.create(StylistService, { stylistId: sid, serviceId: service.id }),
          ),
        );
      }
      return service;
    });
    return this.findOne(saved.id);
  }

  /**
   * S1-05: đổi thời lượng của một dịch vụ KHÔNG làm thay đổi các lịch hẹn đã đặt
   * (lịch hẹn giữ bản chụp duration_snapshot / price_snapshot riêng).
   */
  async update(id: string, dto: UpdateServiceDto): Promise<ServiceView> {
    this.validateRules(dto.durationMinutes, dto.price);
    const service = await this.serviceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(MSG.SERVICE_NOT_FOUND);

    if (dto.name !== undefined) {
      const dup = await this.serviceRepo
        .createQueryBuilder('s')
        .where('lower(s.name) = lower(:n)', { n: dto.name.trim() })
        .andWhere('s.id <> :id', { id })
        .getOne();
      if (dup) throw new ConflictException({ message: MSG.SERVICE_NAME_DUPLICATED, field: 'name' });
      service.name = dto.name.trim();
    }
    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException(MSG.CATEGORY_NOT_FOUND);
      service.categoryId = dto.categoryId;
    }
    if (dto.durationMinutes !== undefined) service.durationMinutes = dto.durationMinutes;
    if (dto.price !== undefined) service.price = dto.price;
    if (dto.description !== undefined) service.description = dto.description;
    if (dto.isActive !== undefined) service.isActive = dto.isActive;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(ServiceItem, service);
      if (dto.stylistIds) {
        await manager.delete(StylistService, { serviceId: id });
        if (dto.stylistIds.length) {
          await manager.save(
            dto.stylistIds.map((sid) => manager.create(StylistService, { stylistId: sid, serviceId: id })),
          );
        }
      }
    });
    return this.findOne(id);
  }

  /**
   * S1-05 / QA-06: dịch vụ đã có lịch hẹn HOẶC đã nằm trên phiếu tính tiền thì không xoá cứng,
   * chỉ được ngừng bán. invoice_items.service_id là ON DELETE SET NULL nên trước đây xoá vẫn "thành công"
   * và làm mất liên kết dịch vụ ở báo cáo doanh thu. Khoá dòng dịch vụ (FOR UPDATE) để lịch/phiếu tạo
   * song song (giữ KEY SHARE trên dòng này qua khoá ngoại) phải chờ -> không lọt giữa bước đếm và bước xoá.
   */
  async remove(id: string): Promise<{ success: boolean }> {
    await this.dataSource.transaction(async (manager) => {
      const locked: { id: string }[] = await manager.query('SELECT id FROM services WHERE id = $1 FOR UPDATE', [id]);
      if (!locked.length) throw new NotFoundException(MSG.SERVICE_NOT_FOUND);
      const usedByAppointments = await manager.count(AppointmentServiceItem, { where: { serviceId: id } });
      if (usedByAppointments > 0) throw new ConflictException(MSG.SERVICE_IN_USE);
      const usedByInvoices = await manager.count(InvoiceItem, { where: { serviceId: id } });
      if (usedByInvoices > 0) throw new ConflictException(MSG.SERVICE_IN_INVOICE);
      await manager.delete(StylistService, { serviceId: id });
      await manager.delete(ServiceItem, { id });
    });
    return { success: true };
  }
}
