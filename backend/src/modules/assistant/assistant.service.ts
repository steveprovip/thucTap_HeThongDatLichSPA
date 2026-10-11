import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatVnd } from '../../common/utils/currency.util';
import { addDays, todaySalon, toSalon } from '../../common/utils/time.util';
import { StylistsService } from '../stylists/stylists.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { AvailabilityService } from '../booking-engine/availability.service';
import {
  AssistantContext, AssistantIntent, ComboInsight, contextForLlm, detectIntent, DOW_VI, fold, GoldenHour, hourLabel,
  HolidayLite, quickReplies, ruleAnswer, ShiftGapSuggestion, SYSTEM_PROMPT,
} from './assistant-rules';
import {
  CatalogItem, CUSTOMER_SYSTEM_PROMPT, customerContextForLlm, CustomerReply, customerRuleReply, SalonFacts,
} from './customer-assistant-rules';
import { callLlm, LlmConfig, LlmMessage } from './llm-client';

export interface AssistantInsights {
  windowDays: number;
  goldenHours: GoldenHour[];
  quietHours: GoldenHour[];
  combos: ComboInsight[];
  topServices: { name: string; count: number }[];
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface CustomerChatResult extends CustomerReply {
  source: 'llm' | 'rules';
  model: string | null;
}

export interface AssistantChatResult {
  intent: AssistantIntent;
  /** Câu hỏi gợi ý tiếp theo (nút bấm nhanh). */
  quickReplies: string[];
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
    private readonly availability: AvailabilityService,
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

  /** Lịch sử hội thoại gần nhất (tối đa 6 lượt) để mô hình hiểu câu hỏi nối tiếp ("thế còn thứ 7?"). */
  private history(history: ChatTurn[] = []): LlmMessage[] {
    return history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 500) }));
  }

  async chat(message: string, opts: { userName?: string | null; history?: ChatTurn[] } = {}): Promise<AssistantChatResult> {
    const intent = detectIntent(message);
    const ctx = await this.context();
    const fallback = ruleAnswer(intent, ctx, { userName: opts.userName });
    const base = { intent, quickReplies: quickReplies(intent) };
    const cfg = this.llm;
    if (!cfg.provider) return { ...base, answer: fallback, source: 'rules', model: null };

    const answer = await callLlm(cfg, [
      { role: 'system', content: `${SYSTEM_PROMPT}\nNgười đang trò chuyện: ${opts.userName ?? 'nhân viên tiệm'}.\nDỮ LIỆU:\n${contextForLlm(ctx)}` },
      ...this.history(opts.history),
      { role: 'user', content: `${message.trim()}\n\n(Gợi ý theo luật, dùng nếu phù hợp: ${fallback})` },
    ]);
    if (!answer) {
      this.logger.warn(`Mô hình ${cfg.provider}/${cfg.model} không phản hồi kịp — dùng câu trả lời theo luật`);
      return { ...base, answer: fallback, source: 'rules', model: null };
    }
    return { ...base, answer, source: 'llm', model: cfg.model };
  }

  // ------------------------------------------------------------- AI tư vấn khách (trang công khai)
  private publicCache: { at: number; catalog: CatalogItem[]; hotIds: string[]; facts: SalonFacts } | null = null;

  private async publicData(): Promise<{ catalog: CatalogItem[]; hotIds: string[]; facts: SalonFacts }> {
    if (this.publicCache && Date.now() - this.publicCache.at < 60_000) return this.publicCache;
    const [groups, hot, hours] = await Promise.all([
      this.availability.publicCatalog(),
      this.dataSource.query(
        `SELECT x.service_id AS id, count(*)::int AS n
           FROM appointment_services x JOIN appointments a ON a.id = x.appointment_id
          WHERE a.start_at >= now() - interval '90 days' AND a.status <> 'cancelled'
          GROUP BY 1 ORDER BY n DESC LIMIT 8`) as Promise<{ id: string; n: number }[]>,
      this.workingHours.list(),
    ]);
    const catalog: CatalogItem[] = groups.flatMap((g) => g.services.map((s) => ({
      id: s.id, name: s.name, categoryName: g.categoryName, durationMinutes: s.durationMinutes,
      price: s.price, priceText: s.priceText, description: s.description,
    })));
    const c = (k: string): string => this.config.get<string>(`app.${k}`) ?? '';
    const facts: SalonFacts = {
      name: c('salonName'), hotline: c('salonHotline'), address: c('salonAddress'),
      openingHours: hours.map((h) => ({ dayLabel: h.dayLabel, isClosed: h.isClosed, openTime: h.openTime, closeTime: h.closeTime })),
    };
    const ids = new Set(catalog.map((x) => x.id));
    this.publicCache = { at: Date.now(), catalog, hotIds: hot.map((h) => h.id).filter((id) => ids.has(id)), facts };
    return this.publicCache;
  }

  /**
   * TASK v3 · NV1 — tư vấn khách trên trang công khai. Gợi ý dịch vụ luôn lấy từ danh mục thật (luật), mô hình ngôn
   * ngữ (nếu bật) chỉ diễn đạt lại cho tự nhiên; dịch vụ mô hình nhắc tới cũng được thêm vào gợi ý để khách bấm chọn.
   */
  async customerChat(message: string, history: ChatTurn[] = []): Promise<CustomerChatResult> {
    const { catalog, hotIds, facts } = await this.publicData();
    const rule = customerRuleReply(message, catalog, hotIds, facts);
    const cfg = this.llm;
    if (!cfg.provider) return { ...rule, source: 'rules', model: null };

    const answer = await callLlm(cfg, [
      { role: 'system', content: `${CUSTOMER_SYSTEM_PROMPT}\n${customerContextForLlm(catalog, hotIds, facts)}` },
      ...this.history(history),
      { role: 'user', content: `${message.trim()}\n\n(Gợi ý theo luật, dùng nếu phù hợp: ${rule.answer})` },
    ]);
    if (!answer) return { ...rule, source: 'rules', model: null };
    const folded = fold(answer);
    const mentioned = catalog.filter((s) => fold(s.name).length >= 4 && folded.includes(fold(s.name)));
    const suggestions = [...rule.suggestions, ...mentioned.filter((m) => !rule.suggestions.some((r) => r.id === m.id))].slice(0, 4);
    return { ...rule, answer, suggestions, source: 'llm', model: cfg.model };
  }
}
