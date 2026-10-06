import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalonWorkingHour } from '../../database/entities/salon-working-hour.entity';
import { SalonHoliday } from '../../database/entities/salon-holiday.entity';
import { Appointment, ACTIVE_STATUSES } from '../../database/entities/appointment.entity';
import { MSG } from '../../common/constants/messages.constant';
import { DOW_LABELS, endOfDay, startOfDay, timeToMinutes, todaySalon, trimSeconds } from '../../common/utils/time.util';
import { CreateHolidayDto, GenerateHolidaysDto, UpdateWorkingHoursDto } from './dto/working-hours.dto';
import { generateVietnamHolidays, HolidaySuggestion, isSupportedHolidayYear } from './vn-holidays';

/** Một ngày lễ đề xuất kèm kết quả đối chiếu với dữ liệu thật của tiệm. */
export interface HolidaySuggestionView extends HolidaySuggestion {
  /**
   *  - ready    : có thể áp dụng ngay (không trùng ngày nghỉ đã có, không chèn lên lịch hẹn của khách)
   *  - exists   : đã có ngày nghỉ của tiệm phủ lên khoảng này -> bỏ qua để không trùng lặp
   *  - conflict : đang có lịch hẹn chưa hoàn tất -> KHÔNG tự áp dụng, chủ tiệm phải xử lý lịch trước hoặc xác nhận ghi đè
   *  - past     : đã qua -> không cần khai báo
   */
  status: 'ready' | 'exists' | 'conflict' | 'past';
  existingReason: string | null;
  affectedAppointments: number;
  affectedCodes: string[];
}

export interface GenerateHolidaysResult {
  year: number;
  created: { key: string; id: string; name: string; startDate: string; endDate: string }[];
  skipped: { key: string; name: string; reason: string }[];
}

export interface WorkingHourView {
  id: string;
  dayOfWeek: number;
  dayLabel: string;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

@Injectable()
export class WorkingHoursService {
  constructor(
    @InjectRepository(SalonWorkingHour) private readonly repo: Repository<SalonWorkingHour>,
    @InjectRepository(SalonHoliday) private readonly holidayRepo: Repository<SalonHoliday>,
    @InjectRepository(Appointment) private readonly apptRepo: Repository<Appointment>,
  ) {}

  private toView(w: SalonWorkingHour): WorkingHourView {
    return {
      id: w.id,
      dayOfWeek: w.dayOfWeek,
      dayLabel: DOW_LABELS[w.dayOfWeek],
      openTime: trimSeconds(w.openTime),
      closeTime: trimSeconds(w.closeTime),
      isClosed: w.isClosed,
    };
  }

  /** Trả đủ 7 ngày, thiếu thì tạo mặc định để màn hình luôn có 7 dòng. */
  async list(): Promise<WorkingHourView[]> {
    let rows = await this.repo.find({ order: { dayOfWeek: 'ASC' } });
    if (rows.length < 7) {
      const existing = new Set(rows.map((r) => r.dayOfWeek));
      const missing = [0, 1, 2, 3, 4, 5, 6].filter((d) => !existing.has(d));
      if (missing.length) {
        await this.repo.save(
          missing.map((d) =>
            this.repo.create({ dayOfWeek: d, openTime: '08:00', closeTime: '20:00', isClosed: false }),
          ),
        );
        rows = await this.repo.find({ order: { dayOfWeek: 'ASC' } });
      }
    }
    // Hiển thị từ Thứ hai đến Chủ nhật cho hợp thói quen người Việt
    const order = [1, 2, 3, 4, 5, 6, 0];
    return rows
      .slice()
      .sort((a, b) => order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek))
      .map((r) => this.toView(r));
  }

  /** S1-08: giờ đóng phải sau giờ mở ít nhất 60 phút. */
  async update(dto: UpdateWorkingHoursDto): Promise<WorkingHourView[]> {
    for (const d of dto.days) {
      if (d.isClosed) continue;
      if (timeToMinutes(d.closeTime) - timeToMinutes(d.openTime) < 60) {
        throw new BadRequestException({
          message: `${DOW_LABELS[d.dayOfWeek]}: ${MSG.WORKING_HOURS_MIN_60}`,
          field: `days.${d.dayOfWeek}.closeTime`,
        });
      }
    }

    for (const d of dto.days) {
      const row = await this.repo.findOne({ where: { dayOfWeek: d.dayOfWeek } });
      if (row) {
        row.openTime = d.openTime;
        row.closeTime = d.closeTime;
        row.isClosed = d.isClosed;
        await this.repo.save(row);
      } else {
        await this.repo.save(this.repo.create({ ...d }));
      }
    }
    return this.list();
  }

  async getByDayOfWeek(dow: number): Promise<SalonWorkingHour | null> {
    return this.repo.findOne({ where: { dayOfWeek: dow } });
  }

  // -------------------------------------------------------------- HOLIDAYS
  async listHolidays(from?: string, to?: string): Promise<SalonHoliday[]> {
    const qb = this.holidayRepo.createQueryBuilder('h');
    if (from) qb.andWhere('h.end_date >= :from', { from });
    if (to) qb.andWhere('h.start_date <= :to', { to });
    return qb.orderBy('h.start_date', 'ASC').getMany();
  }

  /** Cảnh báo số lịch hẹn bị ảnh hưởng trước khi lưu ngày nghỉ (S2-02). */
  async previewHolidayImpact(startDate: string, endDate: string): Promise<{ affected: number; codes: string[] }> {
    const rows = await this.apptRepo
      .createQueryBuilder('a')
      .where('a.start_at >= :from', { from: startOfDay(startDate) })
      .andWhere('a.start_at <= :to', { to: endOfDay(endDate) })
      .andWhere('a.status IN (:...st)', { st: ACTIVE_STATUSES })
      .orderBy('a.start_at', 'ASC')
      .getMany();
    return { affected: rows.length, codes: rows.map((r) => r.code) };
  }

  async createHoliday(dto: CreateHolidayDto): Promise<SalonHoliday | { warning: string; affected: number; codes: string[] }> {
    if (dto.endDate < dto.startDate) throw new BadRequestException(MSG.DATE_RANGE_INVALID);
    const impact = await this.previewHolidayImpact(dto.startDate, dto.endDate);
    if (impact.affected > 0 && !dto.force) {
      return {
        warning: `Khoảng ngày nghỉ này đang có ${impact.affected} lịch hẹn chưa hoàn tất. Xác nhận để lưu và xử lý các lịch hẹn đó.`,
        affected: impact.affected,
        codes: impact.codes,
      };
    }
    return this.holidayRepo.save(
      this.holidayRepo.create({ startDate: dto.startDate, endDate: dto.endDate, reason: dto.reason.trim() }),
    );
  }

  async removeHoliday(id: string): Promise<{ success: boolean }> {
    const found = await this.holidayRepo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(MSG.HOLIDAY_NOT_FOUND);
    await this.holidayRepo.delete(id);
    return { success: true };
  }

  // -------------------------------------------------- TRỢ LÝ SINH NGÀY LỄ (Mentor S2 · mục 5)
  /**
   * Đề xuất toàn bộ ngày lễ quốc gia của một năm và đối chiếu từng ngày với:
   *  1. ngày nghỉ đã khai báo (tránh trùng lặp);
   *  2. lịch hẹn đang giữ chỗ của khách (tránh "ngày nghỉ của tiệm chèn lên ngày đặt dịch vụ của khách").
   */
  async suggestHolidays(year: number, today: string = todaySalon()): Promise<HolidaySuggestionView[]> {
    if (!isSupportedHolidayYear(year)) throw new BadRequestException('Năm phải trong khoảng 2000–2100');
    const out: HolidaySuggestionView[] = [];
    for (const h of generateVietnamHolidays(year)) {
      const existing = await this.listHolidays(h.startDate, h.endDate);
      const impact = await this.previewHolidayImpact(h.startDate, h.endDate);
      const status: HolidaySuggestionView['status'] = h.endDate < today ? 'past'
        : existing.length ? 'exists'
          : impact.affected > 0 ? 'conflict' : 'ready';
      out.push({
        ...h,
        status,
        existingReason: existing[0]?.reason ?? null,
        affectedAppointments: impact.affected,
        affectedCodes: impact.codes.slice(0, 20),
      });
    }
    return out;
  }

  /**
   * Áp dụng 1-click. Mặc định chỉ tạo các ngày ở trạng thái "ready"; ngày "conflict" chỉ được tạo khi
   * truyền force=true (chủ tiệm đã xem danh sách lịch bị ảnh hưởng). Ngày "exists"/"past" luôn bỏ qua.
   */
  async generateHolidays(dto: GenerateHolidaysDto): Promise<GenerateHolidaysResult> {
    const suggestions = await this.suggestHolidays(dto.year);
    const wanted = dto.keys?.length ? new Set(dto.keys) : null;
    const result: GenerateHolidaysResult = { year: dto.year, created: [], skipped: [] };
    for (const s of suggestions) {
      if (wanted && !wanted.has(s.key)) continue;
      if (s.status === 'past') { result.skipped.push({ key: s.key, name: s.name, reason: 'Ngày lễ đã qua' }); continue; }
      if (s.status === 'exists') {
        result.skipped.push({ key: s.key, name: s.name, reason: `Đã có ngày nghỉ "${s.existingReason ?? ''}"` });
        continue;
      }
      if (s.status === 'conflict' && !dto.force) {
        result.skipped.push({
          key: s.key, name: s.name,
          reason: `Đang có ${s.affectedAppointments} lịch hẹn của khách (${s.affectedCodes.slice(0, 5).join(', ')})`,
        });
        continue;
      }
      const saved = await this.holidayRepo.save(
        this.holidayRepo.create({ startDate: s.startDate, endDate: s.endDate, reason: s.name }),
      );
      result.created.push({ key: s.key, id: saved.id, name: s.name, startDate: s.startDate, endDate: s.endDate });
    }
    return result;
  }

  /** Ngày này tiệm có nghỉ không. */
  async isHoliday(date: string): Promise<SalonHoliday | null> {
    return this.holidayRepo
      .createQueryBuilder('h')
      .where(':d BETWEEN h.start_date AND h.end_date', { d: date })
      .getOne();
  }

  async holidayDatesIn(from: string, to: string): Promise<Set<string>> {
    const rows = await this.listHolidays(from, to);
    const set = new Set<string>();
    for (const h of rows) {
      const start = new Date(`${h.startDate}T00:00:00Z`);
      const end = new Date(`${h.endDate}T00:00:00Z`);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        set.add(d.toISOString().slice(0, 10));
      }
    }
    return set;
  }
}
