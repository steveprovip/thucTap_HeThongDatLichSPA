import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceItem } from '../../database/entities/service.entity';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { StylistService as StylistServiceLink } from '../../database/entities/stylist-service.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { Appointment, ACTIVE_STATUSES } from '../../database/entities/appointment.entity';
import { MSG } from '../../common/constants/messages.constant';
import { formatVnd } from '../../common/utils/currency.util';
import {
  addDays, dayOfWeek, endOfDay, isValidDateString, startOfDay, todaySalon, toSalon, trimSeconds,
} from '../../common/utils/time.util';
import { normalizeSearch } from '../../common/utils/text.util';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { StylistsService } from '../stylists/stylists.service';
import {
  computeAvailableSlots, isSlotAvailable, longestShiftLength, ShiftInput, SlotCalcInput, TimeOffInput,
} from './slot-calculator';

export interface PublicServiceView {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
}

export interface PublicCatalogGroup {
  categoryId: string;
  categoryName: string;
  displayOrder: number;
  services: PublicServiceView[];
}

export interface SlotView {
  /** 'HH:mm' */
  time: string;
  /** Các thợ rảnh ở khung giờ này (đã lọc theo kỹ năng). */
  stylistIds: string[];
}

export interface AvailabilityResult {
  date: string;
  totalDurationMinutes: number;
  estimatedTotal: number;
  estimatedTotalText: string;
  salonClosed: boolean;
  closedReason: string | null;
  slots: SlotView[];
  /** Gợi ý 2 ngày gần nhất còn chỗ khi ngày đang chọn hết khung giờ (S2-05). */
  suggestedDates: string[];
  /** Cảnh báo nên tách thành hai lần hẹn (S2-04). */
  exceedsLongestShift: boolean;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly config: ConfigService,
    private readonly workingHours: WorkingHoursService,
    private readonly stylists: StylistsService,
    @InjectRepository(ServiceItem) private readonly serviceRepo: Repository<ServiceItem>,
    @InjectRepository(ServiceCategory) private readonly categoryRepo: Repository<ServiceCategory>,
    @InjectRepository(StylistServiceLink) private readonly linkRepo: Repository<StylistServiceLink>,
    @InjectRepository(Stylist) private readonly stylistRepo: Repository<Stylist>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
  ) {}

  /**
   * S2-03: danh mục công khai — chỉ hiện dịch vụ đang bán VÀ có ít nhất một thợ
   * đang làm việc đảm nhận. Có tìm kiếm không dấu.
   */
  async publicCatalog(search?: string): Promise<PublicCatalogGroup[]> {
    const categories = await this.categoryRepo.find({ order: { displayOrder: 'ASC', name: 'ASC' } });
    const services = await this.serviceRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    const activeStylists = await this.stylistRepo.find({ where: { isActive: true } });
    const activeIds = new Set(activeStylists.map((s) => s.id));
    const links = await this.linkRepo.find();

    const servedBy = new Map<string, number>();
    for (const l of links) {
      if (activeIds.has(l.stylistId)) servedBy.set(l.serviceId, (servedBy.get(l.serviceId) ?? 0) + 1);
    }

    const term = search ? normalizeSearch(search) : '';
    const groups: PublicCatalogGroup[] = [];
    for (const cat of categories) {
      const items = services
        .filter((s) => s.categoryId === cat.id)
        .filter((s) => (servedBy.get(s.id) ?? 0) > 0)
        .filter((s) => !term || normalizeSearch(s.name).includes(term) ||
          normalizeSearch(s.description ?? '').includes(term))
        .map<PublicServiceView>((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          priceText: formatVnd(s.price),
          description: s.description,
        }));
      if (items.length) {
        groups.push({
          categoryId: cat.id,
          categoryName: cat.name,
          displayOrder: cat.displayOrder,
          services: items,
        });
      }
    }
    return groups;
  }

  /** Các thợ làm được toàn bộ dịch vụ đã chọn (S2-06). */
  async capableStylists(serviceIds: string[]): Promise<Stylist[]> {
    return this.stylists.findCapableStylists(serviceIds);
  }

  async loadServices(serviceIds: string[]): Promise<ServiceItem[]> {
    const maxServices = this.config.get<number>('business.maxServicesPerBooking')!;
    if (!serviceIds?.length) throw new BadRequestException(MSG.NO_SERVICE_SELECTED);
    const unique = Array.from(new Set(serviceIds));
    if (unique.length > maxServices) throw new BadRequestException(MSG.MAX_SERVICES(maxServices));
    const services = await this.serviceRepo.find({ where: { id: In(unique), isActive: true } });
    if (services.length !== unique.length) throw new NotFoundException(MSG.SERVICE_NOT_FOUND);
    return services;
  }

  /** Mốc sớm nhất được phép đặt trong ngày `date`, tính bằng phút kể từ 00:00. */
  private earliestStartMinutes(date: string, ignoreLeadTime = false, now: Date = new Date()): number {
    const leadMinutes = ignoreLeadTime ? 0 : this.config.get<number>('business.minLeadTimeMinutes')!;
    const today = todaySalon(now);
    if (date < today) return Number.POSITIVE_INFINITY; // ngày quá khứ: không khung giờ nào hợp lệ
    if (date > today) return Number.NEGATIVE_INFINITY;
    const nowSalon = toSalon(now);
    return nowSalon.hour * 60 + nowSalon.minute + leadMinutes;
  }

  /** Dựng dữ liệu đầu vào cho bộ tính khung giờ của một thợ trong một ngày. */
  private async buildCalcInput(params: {
    date: string;
    stylistId: string;
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    now?: Date;
  }): Promise<SlotCalcInput> {
    const { date, stylistId, totalDuration } = params;
    const dow = dayOfWeek(date);
    const wh = await this.workingHours.getByDayOfWeek(dow);
    const holiday = await this.workingHours.isHoliday(date);

    const shifts = (await this.stylists.getShiftsForDate(date, [stylistId])).map<ShiftInput>((s) => ({
      startTime: trimSeconds(s.startTime),
      endTime: trimSeconds(s.endTime),
      breakStart: s.breakStart ? trimSeconds(s.breakStart) : null,
      breakEnd: s.breakEnd ? trimSeconds(s.breakEnd) : null,
    }));

    const timeOff = (await this.stylists.getTimeOffForDate(date, [stylistId])).map<TimeOffInput>((t) => ({
      startTime: t.startTime ? trimSeconds(t.startTime) : null,
      endTime: t.endTime ? trimSeconds(t.endTime) : null,
    }));

    const qb = this.apptRepo.createQueryBuilder('a')
      .where('a.stylist_id = :sid', { sid: stylistId })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .andWhere('a.start_at < :dayEnd AND a.end_at > :dayStart', {
        dayStart: startOfDay(date), dayEnd: endOfDay(date),
      });
    if (params.excludeAppointmentId) qb.andWhere('a.id <> :ex', { ex: params.excludeAppointmentId });
    const appts = await qb.getMany();

    const busy = appts.map((a) => {
      const s = toSalon(a.startAt);
      const e = toSalon(a.endAt);
      return { start: s.hour * 60 + s.minute, end: e.hour * 60 + e.minute };
    });

    return {
      salonOpen: wh ? trimSeconds(wh.openTime) : '08:00',
      salonClose: wh ? trimSeconds(wh.closeTime) : '20:00',
      salonClosed: !wh || wh.isClosed || !!holiday,
      shifts,
      timeOff,
      busy,
      totalDuration,
      stepMinutes: this.config.get<number>('business.slotStepMinutes')!,
      earliestStartMinutes: this.earliestStartMinutes(date, params.ignoreLeadTime, params.now),
    };
  }

  /**
   * S2-05: khung giờ còn đủ chỗ cho tổng thời lượng đã chọn trong một ngày.
   * Nếu truyền stylistId, chỉ trả khung giờ của riêng thợ đó (S2-06).
   */
  async getAvailability(params: {
    date: string;
    serviceIds: string[];
    stylistId?: string;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    now?: Date;
  }): Promise<AvailabilityResult> {
    if (!isValidDateString(params.date)) throw new BadRequestException('Ngày không hợp lệ');
    const services = await this.loadServices(params.serviceIds);
    const totalDuration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const estimatedTotal = services.reduce((sum, s) => sum + s.price, 0);

    const holiday = await this.workingHours.isHoliday(params.date);
    const wh = await this.workingHours.getByDayOfWeek(dayOfWeek(params.date));
    const salonClosed = !wh || wh.isClosed || !!holiday;

    let candidates = await this.capableStylists(params.serviceIds);
    if (params.stylistId) candidates = candidates.filter((s) => s.id === params.stylistId);

    const slotMap = new Map<string, string[]>();
    let longest = 0;

    if (!salonClosed) {
      for (const stylist of candidates) {
        const input = await this.buildCalcInput({
          date: params.date,
          stylistId: stylist.id,
          totalDuration,
          ignoreLeadTime: params.ignoreLeadTime,
          excludeAppointmentId: params.excludeAppointmentId,
          now: params.now,
        });
        longest = Math.max(longest, longestShiftLength(input.shifts));
        for (const time of computeAvailableSlots(input)) {
          const arr = slotMap.get(time) ?? [];
          arr.push(stylist.id);
          slotMap.set(time, arr);
        }
      }
    }

    const slots: SlotView[] = Array.from(slotMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, stylistIds]) => ({ time, stylistIds }));

    const suggestedDates = slots.length === 0
      ? await this.findNearestAvailableDates({
          serviceIds: params.serviceIds,
          fromDate: params.date,
          stylistId: params.stylistId,
          count: 2,
          now: params.now,
        })
      : [];

    return {
      date: params.date,
      totalDurationMinutes: totalDuration,
      estimatedTotal,
      estimatedTotalText: formatVnd(estimatedTotal),
      salonClosed,
      closedReason: holiday ? holiday.reason : wh?.isClosed ? 'Tiệm nghỉ theo lịch hằng tuần' : null,
      slots,
      suggestedDates,
      exceedsLongestShift: longest > 0 && totalDuration > longest,
    };
  }

  /** Tìm N ngày gần nhất (tối đa 30 ngày tới) còn khung giờ trống. */
  async findNearestAvailableDates(params: {
    serviceIds: string[];
    fromDate: string;
    stylistId?: string;
    count?: number;
    now?: Date;
  }): Promise<string[]> {
    const count = params.count ?? 2;
    const services = await this.loadServices(params.serviceIds);
    const totalDuration = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    let candidates = await this.capableStylists(params.serviceIds);
    if (params.stylistId) candidates = candidates.filter((s) => s.id === params.stylistId);
    if (!candidates.length) return [];

    const found: string[] = [];
    const today = todaySalon(params.now);
    let cursor = params.fromDate < today ? today : params.fromDate;

    for (let i = 1; i <= 30 && found.length < count; i += 1) {
      cursor = addDays(cursor, 1);
      const wh = await this.workingHours.getByDayOfWeek(dayOfWeek(cursor));
      if (!wh || wh.isClosed) continue;
      if (await this.workingHours.isHoliday(cursor)) continue;

      for (const stylist of candidates) {
        const input = await this.buildCalcInput({
          date: cursor, stylistId: stylist.id, totalDuration, now: params.now,
        });
        if (computeAvailableSlots(input).length > 0) {
          found.push(cursor);
          break;
        }
      }
    }
    return found;
  }

  /** Kiểm tra một khung giờ cụ thể của một thợ có còn nhận được không. */
  async canBook(params: {
    date: string;
    time: string;
    stylistId: string;
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    now?: Date;
  }): Promise<boolean> {
    const input = await this.buildCalcInput({
      date: params.date,
      stylistId: params.stylistId,
      totalDuration: params.totalDuration,
      ignoreLeadTime: params.ignoreLeadTime,
      excludeAppointmentId: params.excludeAppointmentId,
      now: params.now,
    });
    if (input.salonClosed) return false;
    return isSlotAvailable(input, params.time);
  }

  /**
   * Chọn thợ tự động: trong các thợ rảnh ở khung giờ đó, ưu tiên người có ít
   * lịch nhất trong ngày hôm đó (S2-06).
   */
  async pickAutoStylist(params: {
    date: string;
    time: string;
    serviceIds: string[];
    totalDuration: number;
    ignoreLeadTime?: boolean;
    now?: Date;
  }): Promise<Stylist | null> {
    const candidates = await this.capableStylists(params.serviceIds);
    const loads = await this.stylists.countAppointmentsByStylist(params.date);

    const available: Stylist[] = [];
    for (const stylist of candidates) {
      const ok = await this.canBook({
        date: params.date,
        time: params.time,
        stylistId: stylist.id,
        totalDuration: params.totalDuration,
        ignoreLeadTime: params.ignoreLeadTime,
        now: params.now,
      });
      if (ok) available.push(stylist);
    }
    if (!available.length) return null;

    available.sort((a, b) => {
      const diff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
      return diff !== 0 ? diff : a.fullName.localeCompare(b.fullName, 'vi');
    });
    return available[0];
  }
}
