import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatVnd } from '../../common/utils/currency.util';
import { addDays, todaySalon, toSalon } from '../../common/utils/time.util';
import { StylistsService } from '../stylists/stylists.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import {
  AssistantContext, AssistantIntent, ComboInsight, contextForLlm, detectIntent, DOW_VI, GoldenHour, hourLabel,
  HolidayLite, ruleAnswer, ShiftGapSuggestion, SYSTEM_PROMPT,
} from './assistant-rules';
import { callLlm, LlmConfig } from './llm-client';

export interface AssistantInsights {
  windowDays: number;
  goldenHours: GoldenHour[];
  quietHours: GoldenHour[];
  combos: ComboInsight[];
  topServices: { name: string; count: number }[];
}

export interface AssistantChatResult {
  intent: AssistantIntent;
  answer: string;
  /** 'llm' = mô hình ngôn ngữ trả lời; 'rules' = luật dựa trên số liệu (không cấu hình / mô hình lỗi / quá giờ). */
  source: 'llm' | 'rules';
  model: string | null;
}

const CACHE_MS = 5 * 60_000;
const INSIGHT_DAYS = 90;

/**
 * Part 5 — Trợ lý AI cho chủ tiệm & lễ tân. Lõi là SỐ LIỆU THẬT (giờ vàng, combo, khung thiếu thợ, ngày lễ) tính bằng
 * SQL tổng hợp; mô hình ngôn ngữ nhỏ (tuỳ chọn) chỉ diễn đạt lại thành câu trả lời tự nhiên. Không gửi dữ liệu cá nhân
 * của khách cho mô hình. (Excel đặt "ML gợi ý" ngoài phạm vi bản đầu → đây là phần mở rộng theo yêu cầu mentor.)
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private cache: { at: number; ctx: AssistantContext } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly stylists: StylistsService,
    private readonly workingHours: WorkingHoursService,
  ) {}

  private get llm(): LlmConfig {
    return {
      provider: (this.config.get<string>('ai.provider') ?? '').toLowerCase(),
      baseUrl: this.config.get<string>('ai.baseUrl') ?? '',
      model: this.config.get<string>('ai.model') ?? 'qwen2.5:3b',
      apiKey: this.config.get<string>('ai.apiKey') ?? '',
      timeoutMs: this.config.get<number>('ai.timeoutMs') ?? 15000,
    };
  }

  status(): { provider: string | null; model: string | null } {
    const { provider, model } = this.llm;
    return provider ? { provider, model } : { provider: null, model: null };
  }

  /** Giờ vàng / giờ vắng (theo thứ × giờ, 90 ngày qua, trong giờ mở cửa) + combo dịch vụ hay đặt cùng nhau. */
  async insights(): Promise<AssistantInsights> {
    const [heat, combos, top, hours] = await Promise.all([
      this.dataSource.query(
        `SELECT extract(dow FROM start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS dow,
                extract(hour FROM start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour, count(*)::int AS n
           FROM appointments
          WHERE start_at >= now() - make_interval(days => $1) AND start_at < now() AND status <> 'cancelled'
          GROUP BY 1, 2`, [INSIGHT_DAYS]) as Promise<{ dow: number; hour: number; n: number }[]>,
      this.dataSource.query(
        `SELECT a.service_id AS s1, b.service_id AS s2, count(*)::int AS n
           FROM appointment_services a
           JOIN appointment_services b ON b.appointment_id = a.appointment_id AND a.service_id < b.service_id
           JOIN appointments ap ON ap.id = a.appointment_id
          WHERE ap.start_at >= now() - interval '180 days' AND ap.status <> 'cancelled'
          GROUP BY 1, 2 HAVING count(*) >= 2 ORDER BY n DESC LIMIT 5`) as Promise<{ s1: string; s2: string; n: number }[]>,
      this.dataSource.query(
        `SELECT x.name_snapshot AS name, count(*)::int AS n
           FROM appointment_services x JOIN appointments ap ON ap.id = x.appointment_id
          WHERE ap.start_at >= now() - make_interval(days => $1) AND ap.status <> 'cancelled'
          GROUP BY 1 ORDER BY n DESC LIMIT 5`, [INSIGHT_DAYS]) as Promise<{ name: string; n: number }[]>,
      this.workingHours.byDayOfWeekMap(),
    ]);

    // Ô (thứ, giờ) nằm trọn trong giờ mở cửa — ô vắng được tính cả khi chưa có lượt nào
    const cells: GoldenHour[] = [];
    const count = new Map(heat.map((h) => [`${h.dow}|${h.hour}`, h.n]));
    for (const [dow, wh] of hours) {
      if (wh.isClosed) continue;
      const open = Math.ceil(Number(wh.openTime.slice(0, 2)) + Number(wh.openTime.slice(3, 5)) / 60);
      const close = Number(wh.closeTime.slice(0, 2));
      for (let h = open; h < close; h += 1) {
        cells.push({ dow, dayLabel: DOW_VI[dow], hour: h, label: hourLabel(dow, h), bookings: count.get(`${dow}|${h}`) ?? 0 });
      }
    }
    const busy = [...cells].sort((a, b) => b.bookings - a.bookings || a.dow - b.dow || a.hour - b.hour);
    const total = cells.reduce((s, c) => s + c.bookings, 0);

    let comboViews: ComboInsight[] = [];
    if (combos.length) {
      const ids = Array.from(new Set(combos.flatMap((c) => [c.s1, c.s2])));
      const svc: { id: string; name: string; duration_minutes: number; price: string }[] = await this.dataSource.query(
        'SELECT id, name, duration_minutes, price FROM services WHERE id = ANY($1::uuid[]) AND is_active', [ids]);
      const byId = new Map(svc.map((s) => [s.id, s]));
      comboViews = combos.filter((c) => byId.has(c.s1) && byId.has(c.s2)).map((c) => {
        const a = byId.get(c.s1)!;
        const b = byId.get(c.s2)!;
        const price = Number(a.price) + Number(b.price);
        return { names: [a.name, b.name], count: c.n, totalDuration: a.duration_minutes + b.duration_minutes, totalPrice: price, priceText: formatVnd(price) };
      });
    }

    return {
      windowDays: INSIGHT_DAYS,
      goldenHours: total ? busy.slice(0, 5) : [],
      // Giờ vắng: chỉ xét ô từng có khách (ô 0 lượt thường là giờ nghỉ trưa / ngoài ca → không nên mời khách vào)
      quietHours: busy.filter((c) => c.bookings > 0).slice(-5).reverse(),
      combos: comboViews,
      topServices: top.map((t) => ({ name: t.name, count: t.n })),
    };
  }

  /** Khung giờ thiếu thợ trong `days` ngày tới + thợ nên xếp (rảnh, ít giờ nhất tuần — cân bằng tải). */
  async shiftSuggestions(days = 7, minStaff = 1): Promise<{ from: string; to: string; gaps: ShiftGapSuggestion[] }> {
    const from = todaySalon();
    const to = addDays(from, days - 1);
    const report = await this.stylists.coverage(from, to, minStaff);
    const nowHm = toSalon(new Date()).toFormat('HH:mm');
    const gaps = report.days.flatMap((d) => d.gaps
      .filter((g) => d.date !== from || g.endTime > nowHm) // hôm nay: bỏ khoảng trống đã trôi qua
      .map((g) => ({
      date: d.date, dayText: d.dayText, startTime: g.startTime, endTime: g.endTime, minCount: g.minCount,
      hint: g.hint ?? null, candidates: g.candidates.slice(0, 3),
    })));
    return { from, to, gaps };
  }

  private async holidaysLite(): Promise<HolidayLite[]> {
    const today = todaySalon();
    const year = Number(today.slice(0, 4));
    const out: HolidayLite[] = [];
    for (const y of [year, year + 1]) {
      const list = await this.workingHours.suggestHolidays(y).catch(() => [] as Awaited<ReturnType<WorkingHoursService['suggestHolidays']>>);
      out.push(...list.filter((h) => h.endDate >= today && h.startDate <= addDays(today, 180))
        .map((h) => ({ name: h.name, startDate: h.startDate, endDate: h.endDate, days: h.days, status: h.status })));
    }
    return out;
  }

  private async context(refresh = false): Promise<AssistantContext> {
    if (!refresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.ctx;
    const [ins, shifts, holidays] = await Promise.all([
      this.insights(), this.shiftSuggestions(7, 1), this.holidaysLite(),
    ]);
    const ctx: AssistantContext = { ...ins, gaps: shifts.gaps, holidays };
    this.cache = { at: Date.now(), ctx };
    return ctx;
  }

  async chat(message: string): Promise<AssistantChatResult> {
    const intent = detectIntent(message);
    const ctx = await this.context();
    const fallback = ruleAnswer(intent, ctx);
    const cfg = this.llm;
    if (!cfg.provider) return { intent, answer: fallback, source: 'rules', model: null };

    const answer = await callLlm(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `DỮ LIỆU:\n${contextForLlm(ctx)}\n\nGỢI Ý THEO LUẬT:\n${fallback}\n\nCÂU HỎI: ${message.trim()}` },
    ]);
    if (!answer) {
      this.logger.warn(`Mô hình ${cfg.provider}/${cfg.model} không phản hồi kịp — dùng câu trả lời theo luật`);
      return { intent, answer: fallback, source: 'rules', model: null };
    }
    return { intent, answer, source: 'llm', model: cfg.model };
  }
}
