import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceItem } from '../../database/entities/service.entity';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { StylistService as StylistServiceLink } from '../../database/entities/stylist-service.entity';
import { Stylist } from '../../database/entities/stylist.entity';
import { Appointment, ACTIVE_STATUSES } from '../../database/entities/appointment.entity';
import { SlotHold } from '../../database/entities/slot-hold.entity';
import { ERROR_CODES, MSG } from '../../common/constants/messages.constant';
import { formatVnd } from '../../common/utils/currency.util';
import {
  addDays, dayOfWeek, endOfDay, isValidDateString, startOfDay, todaySalon, toSalon, trimSeconds,
} from '../../common/utils/time.util';
import { normalizeSearch } from '../../common/utils/text.util';
import { SingleFlight } from '../../common/utils/concurrency';
import { EventsService } from '../events/events.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { StylistsService } from '../stylists/stylists.service';
import {
  computeAvailableSlots, computeFreeIntervals, Interval, isSlotAvailable, longestShiftLength, ShiftInput, SlotCalcInput,
  TimeOffInput, toMinutes,
} from './slot-calculator';
import { rankSmartSlots, SmartSlot, SmartSlotCandidate } from './smart-slots';

export interface PublicServiceView {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
  /** TASK v4 · NV2: ảnh riêng của dịch vụ (null = giao diện tự chọn theo chủ đề). */
  imageUrl: string | null;
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

export interface SmartSlotsResult {
  fromDate: string;
  days: number;
  totalDurationMinutes: number;
  suggestions: SmartSlot[];
  /** Khoảng rảnh liên tục (đủ dài cho gói dịch vụ) của từng thợ từng ngày — để lễ tân nhìn nhanh, khỏi mở lịch ngày. */
  windows: {
    date: string;
    closedReason: string | null;
    stylists: { stylistId: string; stylistName: string; loadMinutes: number; free: { start: string; end: string }[] }[];
  }[];
}

/** Khung một ngày của tiệm (giờ mở cửa, nghỉ lễ / nghỉ hằng tuần). */
interface DayFrame { salonOpen: string; salonClose: string; salonClosed: boolean; closedReason: string | null }
/** Dữ liệu một thợ trong một ngày, nạp theo lô. */
interface StylistDay { shifts: ShiftInput[]; timeOff: TimeOffInput[]; apptBusy: Interval[]; holdBusy: Interval[] }
type CalcInput = SlotCalcInput & { apptBusy: Interval[] };

/** Nhóm dữ liệu mà thao tác ghi làm đổi danh mục công khai (khớp LIVE_PATH của RealtimeInterceptor). */
const CATALOG_SCOPES = new Set(['services', 'service-categories', 'stylists']);
const CATALOG_TTL_MS = 30_000;

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
    @InjectRepository(SlotHold) private readonly holdRepo: Repository<SlotHold>,
    @Optional() events?: EventsService,
  ) {
    // Admin vừa sửa dịch vụ / danh mục / thợ (thao tác ghi thành công) → bỏ bộ nhớ đệm danh mục ngay, khách thấy liền
    events?.stream().subscribe((e) => { if (CATALOG_SCOPES.has(e.scope)) this.catalogCache = null; });
  }

  /** QA 12/10 — danh mục công khai là trang được tải nhiều nhất: giữ 30 giây, hết hạn thì MỘT lần đọc CSDL cho mọi request. */
  private catalogCache: { at: number; groups: PublicCatalogGroup[] } | null = null;
  private readonly catalogFlight = new SingleFlight<PublicCatalogGroup[]>();

  private async baseCatalog(): Promise<PublicCatalogGroup[]> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_TTL_MS) return this.catalogCache.groups;
    return this.catalogFlight.do('catalog', async () => {
      const groups = await this.loadCatalog();
      this.catalogCache = { at: Date.now(), groups };
      return groups;
    });
  }

  /**
   * S2-03: danh mục công khai — chỉ hiện dịch vụ đang bán VÀ có ít nhất một thợ
   * đang làm việc đảm nhận. Có tìm kiếm không dấu.
   */
  async publicCatalog(search?: string): Promise<PublicCatalogGroup[]> {
    const base = await this.baseCatalog();
    const term = search ? normalizeSearch(search) : '';
    if (!term) return base;
    // QA-12: chỉ so khớp TÊN dịch vụ (không dấu); mô tả dài làm kết quả nhiễu nên bỏ qua
    return base
      .map((g) => ({ ...g, services: g.services.filter((s) => normalizeSearch(s.name).includes(term)) }))
      .filter((g) => g.services.length);
  }

  private async loadCatalog(): Promise<PublicCatalogGroup[]> {
    // 4 truy vấn độc lập chạy SONG SONG (trước đây tuần tự); liên kết thợ–dịch vụ chỉ lấy của thợ đang làm
    const [categories, services, links] = await Promise.all([
      this.categoryRepo.find({ order: { displayOrder: 'ASC', name: 'ASC' } }),
      this.serviceRepo.find({ where: { isActive: true }, order: { name: 'ASC' } }),
      this.linkRepo.createQueryBuilder('l')
        .innerJoin(Stylist, 's', 's.id = l.stylistId AND s.isActive = true')
        .select('l.serviceId', 'serviceId').getRawMany<{ serviceId: string }>(),
    ]);

    const servedBy = new Set(links.map((l) => l.serviceId));
    const groups: PublicCatalogGroup[] = [];
    for (const cat of categories) {
      const items = services
        .filter((s) => s.categoryId === cat.id)
        .filter((s) => servedBy.has(s.id))
        .map<PublicServiceView>((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          priceText: formatVnd(s.price),
          description: s.description,
          imageUrl: s.imageUrl ?? null,
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

  /**
   * QA-13: độ dài ca dài nhất (đã trừ nghỉ giữa ca) của các thợ làm được gói dịch vụ, trong 7 ngày
   * tính từ `fromDate`. Trước đây chỉ xét ca của ĐÚNG ngày đang chọn nên ngày thợ nghỉ thì không cảnh báo,
   * còn ngày toàn ca ngắn lại cảnh báo sai dù trong tuần vẫn có ca đủ dài.
   */
  async longestShiftInWeek(stylistIds: string[], fromDate: string): Promise<number> {
    if (!stylistIds.length) return 0;
    const shifts = await this.stylists.getShiftsBetween(fromDate, addDays(fromDate, 6), stylistIds);
    return longestShiftLength(shifts.map<ShiftInput>((s) => ({
      startTime: trimSeconds(s.startTime),
      endTime: trimSeconds(s.endTime),
      breakStart: s.breakStart ? trimSeconds(s.breakStart) : null,
      breakEnd: s.breakEnd ? trimSeconds(s.breakEnd) : null,
    })));
  }

  /** Cảnh báo giỏ dịch vụ ngay ở bước chọn dịch vụ (S2-04 / QA-13). */
  async cartWarning(serviceIds: string[], totalDuration: number, fromDate?: string): Promise<{
    longestShiftMinutes: number; exceedsLongestShift: boolean;
  }> {
    const capable = await this.capableStylists(serviceIds);
    const longest = await this.longestShiftInWeek(capable.map((s) => s.id), fromDate ?? todaySalon());
    return { longestShiftMinutes: longest, exceedsLongestShift: longest > 0 && totalDuration > longest };
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

  /**
   * Lý do tiệm đóng cửa CẢ NGÀY: ngày nghỉ lễ (lấy lý do của ngày nghỉ) hoặc ngày nghỉ cố định hằng tuần.
   * Trả null khi tiệm mở cửa. Dùng chung cho timeline, tra khung giờ và các thao tác tạo / dời lịch.
   */
  async closedReason(date: string): Promise<string | null> {
    const holiday = await this.workingHours.isHoliday(date);
    if (holiday) return holiday.reason;
    const wh = await this.workingHours.getByDayOfWeek(dayOfWeek(date));
    return !wh || wh.isClosed ? MSG.SALON_CLOSED_WEEKLY : null;
  }

  /**
   * Chặn tạo / dời lịch vào ngày tiệm nghỉ cả ngày bằng thông báo rõ lý do (thay vì lỗi "khung giờ không hợp lệ" chung).
   * Mọi nguồn (đặt online, lịch tại quầy, dời lịch) đều đi qua đây nên API bị gọi thẳng cũng không lách được giao diện.
   */
  async assertSalonOpen(date: string, action: 'create' | 'reschedule'): Promise<void> {
    const reason = await this.closedReason(date);
    if (reason === null) return;
    throw new BadRequestException({
      message: action === 'create' ? MSG.SALON_CLOSED_CREATE(reason) : MSG.SALON_CLOSED_RESCHEDULE(reason),
      field: 'date',
      code: ERROR_CODES.SALON_CLOSED,
      details: { date, reason },
    });
  }

  /**
   * Part 4 (tải x10) — khung ngày của tiệm cho NHIỀU ngày: 1 truy vấn ngày nghỉ lễ + 1 truy vấn giờ mở cửa,
   * thay cho 2 truy vấn / ngày / thợ trước đây.
   */
  private async loadDayFrames(dates: string[]): Promise<Map<string, DayFrame>> {
    const out = new Map<string, DayFrame>();
    if (!dates.length) return out;
    const sorted = [...dates].sort();
    const [holidays, byDow] = await Promise.all([
      this.workingHours.listHolidays(sorted[0], sorted[sorted.length - 1]),
      this.workingHours.byDayOfWeekMap(),
    ]);
    for (const date of sorted) {
      const wh = byDow.get(dayOfWeek(date)) ?? null;
      const holiday = holidays.find((h) => h.startDate <= date && date <= h.endDate);
      out.set(date, {
        salonOpen: wh ? trimSeconds(wh.openTime) : '08:00',
        salonClose: wh ? trimSeconds(wh.closeTime) : '20:00',
        salonClosed: !wh || wh.isClosed || !!holiday,
        closedReason: holiday ? holiday.reason : !wh || wh.isClosed ? MSG.SALON_CLOSED_WEEKLY : null,
      });
    }
    return out;
  }

  /**
   * Part 4 — ca làm, ngày nghỉ riêng, lịch hẹn đang giữ chỗ và giữ chỗ tạm của N thợ × M ngày trong MỘT truy vấn
   * (UNION ALL trên các chỉ mục (stylist_id, ngày) sẵn có). Trước đây mỗi thợ mỗi ngày tốn 4 truy vấn → N+1:
   * 40 thợ × 7 ngày = 1.120 truy vấn chỉ để gợi ý khung giờ.
   */
  private async loadStylistDays(
    dates: string[], stylistIds: string[], opts: { excludeAppointmentId?: string; holdToken?: string },
  ): Promise<Map<string, StylistDay>> {
    const out = new Map<string, StylistDay>();
    if (!dates.length || !stylistIds.length) return out;
    const sorted = [...dates].sort();
    const from = sorted[0];
    const to = sorted[sorted.length - 1];
    const rows: {
      kind: 'shift' | 'off' | 'appt' | 'hold'; sid: string; d: string | null;
      a: string | null; b: string | null; c: string | null; e: string | null; ts: Date | null; te: Date | null;
    }[] = await this.apptRepo.manager.query(
      `WITH p AS (SELECT $1::uuid[] AS ids, $2::date AS d0, $3::date AS d1, $4::timestamptz AS t0, $5::timestamptz AS t1)
       SELECT 'shift' AS kind, s.stylist_id::text AS sid, to_char(s.work_date, 'YYYY-MM-DD') AS d,
              to_char(s.start_time, 'HH24:MI') AS a, to_char(s.end_time, 'HH24:MI') AS b,
              to_char(s.break_start, 'HH24:MI') AS c, to_char(s.break_end, 'HH24:MI') AS e,
              NULL::timestamptz AS ts, NULL::timestamptz AS te
         FROM stylist_shifts s, p WHERE s.stylist_id = ANY(p.ids) AND s.work_date BETWEEN p.d0 AND p.d1
       UNION ALL
       SELECT 'off', t.stylist_id::text, to_char(t.off_date, 'YYYY-MM-DD'),
              to_char(t.start_time, 'HH24:MI'), to_char(t.end_time, 'HH24:MI'), NULL, NULL, NULL, NULL
         FROM stylist_time_off t, p WHERE t.stylist_id = ANY(p.ids) AND t.off_date BETWEEN p.d0 AND p.d1
       UNION ALL
       -- Trạng thái viết hằng (từ ACTIVE_STATUSES) để planner dùng chỉ mục một phần ix_appt_active_stylist_range
       SELECT 'appt', a.stylist_id::text, NULL, NULL, NULL, NULL, NULL, a.start_at, a.end_at
         FROM appointments a, p
        WHERE a.stylist_id = ANY(p.ids) AND a.status IN (${ACTIVE_STATUSES.map((s) => `'${s}'`).join(',')})
          AND a.start_at < p.t1 AND a.end_at > p.t0 AND ($6::uuid IS NULL OR a.id <> $6::uuid)
       UNION ALL
       SELECT 'hold', h.stylist_id::text, NULL, NULL, NULL, NULL, NULL, h.start_at, h.end_at
         FROM slot_holds h, p
        WHERE h.stylist_id = ANY(p.ids) AND h.expires_at > now()
          AND h.start_at < p.t1 AND h.end_at > p.t0 AND ($7::text IS NULL OR h.token <> $7::text)
       ORDER BY 1, 2, 3, 4`,
      [stylistIds, from, to, startOfDay(from), endOfDay(to), opts.excludeAppointmentId ?? null, opts.holdToken ?? null],
    );

    const day = (date: string, sid: string): StylistDay => {
      const key = `${date}|${sid}`;
      let v = out.get(key);
      if (!v) { v = { shifts: [], timeOff: [], apptBusy: [], holdBusy: [] }; out.set(key, v); }
      return v;
    };
    const bounds = sorted.map((date) => ({ date, start: startOfDay(date).getTime(), end: endOfDay(date).getTime() }));
    const toInterval = (startAt: Date, endAt: Date): Interval => {
      const s = toSalon(startAt);
      const e = toSalon(endAt);
      return { start: s.hour * 60 + s.minute, end: e.hour * 60 + e.minute };
    };
    for (const r of rows) {
      if (r.kind === 'shift') {
        day(r.d!, r.sid).shifts.push({ startTime: r.a!, endTime: r.b!, breakStart: r.c, breakEnd: r.e });
      } else if (r.kind === 'off') {
        day(r.d!, r.sid).timeOff.push({ startTime: r.a, endTime: r.b });
      } else {
        const s = new Date(r.ts!).getTime();
        const e = new Date(r.te!).getTime();
        for (const b of bounds) {
          if (s < b.end && e > b.start) {
            const target = day(b.date, r.sid);
            (r.kind === 'appt' ? target.apptBusy : target.holdBusy).push(toInterval(new Date(s), new Date(e)));
          }
        }
      }
    }
    return out;
  }

  /** Đầu vào bộ tính khung giờ cho nhiều thợ × nhiều ngày, nạp theo lô (Part 4). */
  private async buildCalcInputs(params: {
    dates: string[];
    stylistIds: string[];
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    /** Giữ chỗ của CHÍNH khách đang hỏi — không tính là bận với họ (Mentor S2 · mục 11). */
    holdToken?: string;
    now?: Date;
    frames?: Map<string, DayFrame>;
  }): Promise<{ frames: Map<string, DayFrame>; inputFor: (date: string, stylistId: string) => CalcInput }> {
    const frames = params.frames ?? (await this.loadDayFrames(params.dates));
    const openDates = params.dates.filter((d) => !frames.get(d)?.salonClosed);
    const data = await this.loadStylistDays(openDates, params.stylistIds, params);
    const step = this.config.get<number>('business.slotStepMinutes')!;
    const empty: StylistDay = { shifts: [], timeOff: [], apptBusy: [], holdBusy: [] };
    return {
      frames,
      inputFor: (date, stylistId) => {
        const f = frames.get(date)!;
        const d = data.get(`${date}|${stylistId}`) ?? empty;
        return {
          salonOpen: f.salonOpen,
          salonClose: f.salonClose,
          salonClosed: f.salonClosed,
          shifts: d.shifts,
          timeOff: d.timeOff,
          busy: [...d.apptBusy, ...d.holdBusy],
          totalDuration: params.totalDuration,
          stepMinutes: step,
          earliestStartMinutes: this.earliestStartMinutes(date, params.ignoreLeadTime, params.now),
          apptBusy: d.apptBusy,
        };
      },
    };
  }

  /** Dựng dữ liệu đầu vào cho bộ tính khung giờ của một thợ trong một ngày. */
  private async buildCalcInput(params: {
    date: string;
    stylistId: string;
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    holdToken?: string;
    now?: Date;
  }): Promise<CalcInput> {
    const { inputFor } = await this.buildCalcInputs({ ...params, dates: [params.date], stylistIds: [params.stylistId] });
    return inputFor(params.date, params.stylistId);
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
    holdToken?: string;
    now?: Date;
    /** Dời / chuyển lịch ĐÃ ĐẶT: dùng thời lượng chốt trên lịch hẹn, không lấy thời lượng dịch vụ hiện hành (S1-05). */
    totalDurationOverride?: number;
  }): Promise<AvailabilityResult> {
    if (!isValidDateString(params.date)) throw new BadRequestException('Ngày không hợp lệ');
    const services = await this.loadServices(params.serviceIds);
    const totalDuration = params.totalDurationOverride ?? services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const estimatedTotal = services.reduce((sum, s) => sum + s.price, 0);

    let candidates = await this.capableStylists(params.serviceIds);
    if (params.stylistId) candidates = candidates.filter((s) => s.id === params.stylistId);

    const { frames, inputFor } = await this.buildCalcInputs({
      dates: [params.date],
      stylistIds: candidates.map((s) => s.id),
      totalDuration,
      ignoreLeadTime: params.ignoreLeadTime,
      excludeAppointmentId: params.excludeAppointmentId,
      holdToken: params.holdToken,
      now: params.now,
    });
    const frame = frames.get(params.date)!;

    const slotMap = new Map<string, string[]>();
    if (!frame.salonClosed) {
      for (const stylist of candidates) {
        for (const time of computeAvailableSlots(inputFor(params.date, stylist.id))) {
          const arr = slotMap.get(time) ?? [];
          arr.push(stylist.id);
          slotMap.set(time, arr);
        }
      }
    }

    const slots: SlotView[] = Array.from(slotMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, stylistIds]) => ({ time, stylistIds }));

    const longest = await this.longestShiftInWeek(candidates.map((s) => s.id), params.date);

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
      salonClosed: frame.salonClosed,
      closedReason: frame.closedReason,
      slots,
      suggestedDates,
      exceedsLongestShift: longest > 0 && totalDuration > longest,
    };
  }

  /**
   * Mentor S2 · mục 4 — Trợ lý AI xếp lịch cho nhân viên: duyệt mọi khung hợp lệ của mọi thợ làm được gói dịch vụ
   * trong `days` ngày kể từ `fromDate`, chấm điểm (sớm · vừa khít · cân bằng) và giải thích lý do.
   * Dùng giờ thực của nhân viên: bỏ mốc đặt trước 60 phút nhưng không gợi ý giờ đã qua.
   */
  async smartSlots(params: {
    serviceIds: string[]; fromDate: string; days?: number; stylistId?: string; limit?: number; now?: Date;
  }): Promise<SmartSlotsResult> {
    if (!isValidDateString(params.fromDate)) throw new BadRequestException('Ngày không hợp lệ');
    const days = Math.min(7, Math.max(1, params.days ?? 3));
    const services = await this.loadServices(params.serviceIds);
    const totalDuration = services.reduce((sum, x) => sum + x.durationMinutes, 0);
    let stylists = await this.capableStylists(params.serviceIds);
    if (params.stylistId) stylists = stylists.filter((x) => x.id === params.stylistId);
    const today = todaySalon(params.now);
    const start = params.fromDate < today ? today : params.fromDate;
    const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
    const { frames, inputFor } = await this.buildCalcInputs({
      dates, stylistIds: stylists.map((s) => s.id), totalDuration, ignoreLeadTime: true, now: params.now,
    });

    const candidates: SmartSlotCandidate[] = [];
    const windows: SmartSlotsResult['windows'] = [];
    dates.forEach((date, i) => {
      const closedReason = frames.get(date)!.closedReason;
      if (closedReason) { windows.push({ date, closedReason, stylists: [] }); return; }
      const perStylist: { id: string; name: string; load: number; free: Interval[]; starts: number[] }[] = [];
      for (const st of stylists) {
        const input = inputFor(date, st.id);
        const free = computeFreeIntervals(input).filter((f) => f.end - f.start >= totalDuration);
        const starts = computeAvailableSlots(input).map(toMinutes);
        const load = input.apptBusy.reduce((sum, b) => sum + (b.end - b.start), 0);
        perStylist.push({ id: st.id, name: st.fullName, load, free, starts });
      }
      const loads = perStylist.map((p) => p.load);
      const allStarts = perStylist.flatMap((p) => p.starts);
      const earliestOfDay = allStarts.length ? Math.min(...allStarts) : 0;
      for (const p of perStylist) {
        for (const s of p.starts) {
          const win = p.free.find((f) => f.start <= s && s + totalDuration <= f.end);
          if (!win) continue;
          candidates.push({
            date, dayOffset: i, start: s, duration: totalDuration, stylistId: p.id, stylistName: p.name,
            freeStart: win.start, freeEnd: win.end, dayLoadMinutes: p.load,
            maxDayLoad: Math.max(...loads), minDayLoad: Math.min(...loads), earliestOfDay,
          });
        }
      }
      const fmt = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      windows.push({
        date, closedReason: null,
        stylists: perStylist.map((p) => ({
          stylistId: p.id, stylistName: p.name, loadMinutes: p.load,
          free: p.free.map((f) => ({ start: fmt(f.start), end: fmt(f.end) })),
        })),
      });
    });
    return {
      fromDate: start, days, totalDurationMinutes: totalDuration,
      suggestions: rankSmartSlots(candidates, Math.min(12, Math.max(1, params.limit ?? 6))),
      windows,
    };
  }

  /** Tìm N ngày gần nhất (tối đa 30 ngày tới) còn khung giờ trống — nạp cả 30 ngày trong một lô (Part 4). */
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

    const today = todaySalon(params.now);
    // Ngày gửi lên đã qua thì xét luôn từ HÔM NAY; còn lại xét từ ngày kế tiếp ngày gửi lên
    const first = params.fromDate < today ? today : addDays(params.fromDate, 1);
    const dates = Array.from({ length: 30 }, (_, i) => addDays(first, i));
    const frames = await this.loadDayFrames(dates);

    // Nạp theo từng tuần (1 truy vấn / tuần): thường 1–2 ngày đầu đã đủ chỗ nên không đọc lịch cả tháng.
    const found: string[] = [];
    for (let w = 0; w < dates.length && found.length < count; w += 7) {
      const week = dates.slice(w, w + 7).filter((d) => !frames.get(d)!.salonClosed);
      if (!week.length) continue;
      const { inputFor } = await this.buildCalcInputs({
        dates: week, frames, stylistIds: candidates.map((s) => s.id), totalDuration, now: params.now,
      });
      for (const date of week) {
        if (found.length >= count) break;
        if (candidates.some((st) => computeAvailableSlots(inputFor(date, st.id)).length > 0)) found.push(date);
      }
    }
    return found;
  }

  /** Phân loại một khung giờ trên đầu vào đã dựng sẵn (dùng chung cho checkSlot và pickAutoStylist). */
  private verdict(input: CalcInput, time: string): 'ok' | 'taken' | 'held' | 'invalid' {
    if (input.salonClosed || !isSlotAvailable({ ...input, busy: [] }, time)) return 'invalid';
    if (!isSlotAvailable({ ...input, busy: input.apptBusy }, time)) return 'taken';
    return isSlotAvailable(input, time) ? 'ok' : 'held';
  }

  /**
   * Phân loại một khung giờ của một thợ:
   *  - 'invalid': nằm ngoài ca / giờ mở cửa / giờ nghỉ / quá sát hiện tại -> khách gửi giờ không có trong danh sách
   *  - 'taken'  : hợp lệ nhưng đã có lịch khác chiếm
   *  - 'held'   : còn trống nhưng một khách khác đang GIỮ CHỖ để hoàn tất đặt lịch (Mentor S2 · mục 11)
   *  - 'ok'     : nhận được
   */
  async checkSlot(params: {
    date: string;
    time: string;
    stylistId: string;
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    holdToken?: string;
    now?: Date;
  }): Promise<'ok' | 'taken' | 'held' | 'invalid'> {
    return this.verdict(await this.buildCalcInput(params), params.time);
  }

  /** Kiểm tra một khung giờ cụ thể của một thợ có còn nhận được không. */
  async canBook(params: {
    date: string;
    time: string;
    stylistId: string;
    totalDuration: number;
    ignoreLeadTime?: boolean;
    excludeAppointmentId?: string;
    holdToken?: string;
    now?: Date;
  }): Promise<boolean> {
    return (await this.checkSlot(params)) === 'ok';
  }

  /**
   * Chọn thợ tự động: trong các thợ rảnh ở khung giờ đó, ưu tiên người có ít
   * lịch nhất trong ngày hôm đó (S2-06). Nạp dữ liệu mọi thợ trong một lô (Part 4).
   */
  async pickAutoStylist(params: {
    date: string;
    time: string;
    serviceIds: string[];
    totalDuration: number;
    ignoreLeadTime?: boolean;
    now?: Date;
    /** Thợ đã thử và bị giành mất khung giờ trong lúc chốt lịch (QA-15). */
    excludeStylistIds?: string[];
    holdToken?: string;
  }): Promise<Stylist | null> {
    const excluded = new Set(params.excludeStylistIds ?? []);
    const candidates = (await this.capableStylists(params.serviceIds)).filter((s) => !excluded.has(s.id));
    if (!candidates.length) return null;
    const loads = await this.stylists.countAppointmentsByStylist(params.date);
    const { inputFor } = await this.buildCalcInputs({
      dates: [params.date],
      stylistIds: candidates.map((s) => s.id),
      totalDuration: params.totalDuration,
      ignoreLeadTime: params.ignoreLeadTime,
      holdToken: params.holdToken,
      now: params.now,
    });

    const available = candidates.filter((st) => this.verdict(inputFor(params.date, st.id), params.time) === 'ok');
    if (!available.length) return null;

    available.sort((a, b) => {
      const diff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
      return diff !== 0 ? diff : a.fullName.localeCompare(b.fullName, 'vi');
    });
    return available[0];
  }
}
