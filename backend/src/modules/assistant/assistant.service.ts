import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatVnd } from '../../common/utils/currency.util';
import { addDays, dayOfWeek, endOfDay, startOfDay, todaySalon, toSalon } from '../../common/utils/time.util';
import { StylistsService } from '../stylists/stylists.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { AvailabilityService } from '../booking-engine/availability.service';
import {
  AssistantContext, AssistantIntent, ComboInsight, contextForLlm, detectIntent, DOW_VI, fold, GoldenHour, hourLabel,
  HolidayLite, quickReplies, ruleAnswer, ShiftGapSuggestion, SYSTEM_PROMPT, TodaySnapshot,
} from './assistant-rules';
import {
  CatalogItem, CUSTOMER_SYSTEM_PROMPT, customerContextForLlm, CustomerReply, customerRuleReply, SalonFacts,
} from './customer-assistant-rules';
import { callLlm, DEFAULT_LOCAL_AI_URL, LlmConfig, LlmMessage, pickModel, probeLocalServer } from './llm-client';

/** Trạng thái trợ lý cho giao diện: đang trả lời bằng mô hình (local / cố định) hay bằng luật. */
export interface AssistantStatus {
  /** 'llm' = câu hỏi đang được chuyển cho mô hình ngôn ngữ; 'rules' = Smart Rule Assistant (không cần mô hình). */
  mode: 'llm' | 'rules';
  /** Cấu hình AI_PROVIDER: auto | off | ollama | openai. */
  setting: string;
  provider: string | null;
  model: string | null;
  /** Chế độ auto: có tìm thấy máy chủ AI local (model_AI_local/chay_ai_local.cmd) đang chạy không. */
  localDetected: boolean;
  /** Địa chỉ máy chủ AI local được dò (chế độ auto) — để hướng dẫn bật AI local. */
  localUrl: string | null;
}

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
/** Dò lại máy chủ AI local sau: 30 giây khi đang chạy, 10 giây khi chưa thấy / vừa lỗi (bật model lên là dùng ngay). */
const PROBE_OK_MS = 30_000;
const PROBE_MISS_MS = 10_000;

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

  private probe: { at: number; cfg: LlmConfig | null } | null = null;

  private get settings(): LlmConfig {
    return {
      provider: (this.config.get<string>('ai.provider') ?? 'auto').toLowerCase() || 'auto',
      baseUrl: this.config.get<string>('ai.baseUrl') ?? '',
      model: this.config.get<string>('ai.model') ?? '',
      apiKey: this.config.get<string>('ai.apiKey') ?? '',
      timeoutMs: this.config.get<number>('ai.timeoutMs') ?? 25000,
    };
  }

  private get localUrl(): string {
    return (this.settings.baseUrl || DEFAULT_LOCAL_AI_URL).replace(/\/+$/, '');
  }

  /**
   * TASK v4 · NV5 — fallback 2 lớp. Trả cấu hình mô hình cần gọi, hoặc null = trả lời bằng luật (Smart Rule Assistant):
   *  - AI_PROVIDER=off → luôn null; ollama / openai → cấu hình cố định như trước.
   *  - auto (mặc định) → dò máy chủ AI local (llama.cpp / Ollama chạy Spark-X2.5-4B tại cổng 11434); kết quả dò được nhớ
   *    30 giây (đang chạy) / 10 giây (chưa thấy) nên không làm chậm từng câu hỏi; tắt model đi là tự quay về luật.
   */
  private async resolveLlm(): Promise<LlmConfig | null> {
    const s = this.settings;
    if (['off', 'none', 'rules', 'false', '0'].includes(s.provider)) return null;
    if (s.provider !== 'auto') return { ...s, model: s.model || 'qwen2.5:3b' };
    const fresh = this.probe && Date.now() - this.probe.at < (this.probe.cfg ? PROBE_OK_MS : PROBE_MISS_MS);
    if (!fresh) {
      const found = await probeLocalServer(this.localUrl);
      const model = found.ok ? pickModel(found.models, s.model) : null;
      const cfg: LlmConfig | null = model
        ? { provider: found.kind === 'ollama' ? 'ollama' : 'local', baseUrl: found.kind === 'ollama' ? this.localUrl.replace(/\/v1$/, '') : this.localUrl,
          model, apiKey: s.apiKey, timeoutMs: s.timeoutMs }
        : null;
      if (cfg && !this.probe?.cfg) this.logger.log(`Phát hiện AI local ${cfg.model} tại ${this.localUrl} — chuyển câu hỏi cho mô hình`);
      if (!cfg && this.probe?.cfg) this.logger.warn('AI local đã tắt — trợ lý trả lời theo luật');
      this.probe = { at: Date.now(), cfg };
    }
    return this.probe?.cfg ?? null;
  }

  /** Mô hình vừa lỗi / quá giờ: chế độ auto tạm dùng luật 10 giây rồi mới dò lại (không bắt khách chờ timeout liên tiếp). */
  private markLlmDown(): void {
    if (this.settings.provider === 'auto') this.probe = { at: Date.now(), cfg: null };
  }

  async status(): Promise<AssistantStatus> {
    const s = this.settings;
    const cfg = await this.resolveLlm();
    return {
      mode: cfg ? 'llm' : 'rules',
      setting: s.provider,
      provider: cfg?.provider ?? null,
      model: cfg?.model ?? null,
      localDetected: s.provider === 'auto' && !!cfg,
      localUrl: s.provider === 'auto' ? this.localUrl : null,
    };
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

  /** TASK v4 · NV1 — số liệu tổng hợp hôm nay cho câu "tình hình hôm nay?" (tươi mỗi câu hỏi, không cache 5 phút). */
  async todaySnapshot(): Promise<TodaySnapshot> {
    const day = todaySalon();
    const overdueHours = this.config.get<number>('business.pendingOverdueHours') ?? 12;
    const [statuses, revenue, pending] = await Promise.all([
      this.dataSource.query(
        `SELECT status::text AS status, count(*)::int AS n FROM appointments
          WHERE start_at >= $1 AND start_at <= $2 GROUP BY 1`, [startOfDay(day), endOfDay(day)]) as Promise<{ status: string; n: number }[]>,
      this.dataSource.query(
        `SELECT COALESCE(sum(total), 0)::bigint AS total FROM invoices
          WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2`, [startOfDay(day), endOfDay(day)]) as Promise<{ total: string }[]>,
      this.dataSource.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at < now() - make_interval(hours => $1))::int AS overdue
           FROM appointments WHERE status = 'pending'`, [overdueHours]) as Promise<{ total: number; overdue: number }[]>,
    ]);
    const byStatus: Record<string, number> = {};
    for (const s of ['pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show']) byStatus[s] = 0;
    for (const r of statuses) byStatus[r.status] = r.n;
    const money = Number(revenue[0]?.total ?? 0);
    return {
      date: day,
      dayText: `${DOW_VI[dayOfWeek(day)]} ${day.slice(8, 10)}/${day.slice(5, 7)}`,
      total: statuses.reduce((a, r) => a + r.n, 0),
      byStatus,
      revenue: money,
      revenueText: formatVnd(money),
      pendingTotal: pending[0]?.total ?? 0,
      pendingOverdue: pending[0]?.overdue ?? 0,
    };
  }

  /** Lịch sử hội thoại gần nhất (tối đa 6 lượt) để mô hình hiểu câu hỏi nối tiếp ("thế còn thứ 7?"). */
  private history(history: ChatTurn[] = []): LlmMessage[] {
    return history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 500) }));
  }

  async chat(message: string, opts: { userName?: string | null; history?: ChatTurn[] } = {}): Promise<AssistantChatResult> {
    const intent = detectIntent(message);
    const [cached, today] = await Promise.all([this.context(), this.todaySnapshot().catch(() => null)]);
    const ctx: AssistantContext = { ...cached, today };
    const fallback = ruleAnswer(intent, ctx, { userName: opts.userName, now: new Date() });
    const base = { intent, quickReplies: quickReplies(intent) };
    const cfg = await this.resolveLlm();
    if (!cfg) return { ...base, answer: fallback, source: 'rules', model: null };

    const answer = await callLlm(cfg, [
      { role: 'system', content: `${SYSTEM_PROMPT}\nNgười đang trò chuyện: ${opts.userName ?? 'nhân viên tiệm'}.\nDỮ LIỆU:\n${contextForLlm(ctx)}` },
      ...this.history(opts.history),
      { role: 'user', content: `${message.trim()}\n\n(Gợi ý theo luật, dùng nếu phù hợp: ${fallback})` },
    ]);
    if (!answer) {
      this.logger.warn(`Mô hình ${cfg.provider}/${cfg.model} không phản hồi kịp — dùng câu trả lời theo luật`);
      this.markLlmDown();
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
      price: s.price, priceText: s.priceText, description: s.description, imageUrl: s.imageUrl,
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
    const rule = customerRuleReply(message, catalog, hotIds, facts, new Date());
    const cfg = await this.resolveLlm();
    if (!cfg) return { ...rule, source: 'rules', model: null };

    const answer = await callLlm(cfg, [
      { role: 'system', content: `${CUSTOMER_SYSTEM_PROMPT}\n${customerContextForLlm(catalog, hotIds, facts)}` },
      ...this.history(history),
      { role: 'user', content: `${message.trim()}\n\n(Gợi ý theo luật, dùng nếu phù hợp: ${rule.answer})` },
    ]);
    if (!answer) {
      this.markLlmDown();
      return { ...rule, source: 'rules', model: null };
    }
    const folded = fold(answer);
    const mentioned = catalog.filter((s) => fold(s.name).length >= 4 && folded.includes(fold(s.name)));
    const suggestions = [...rule.suggestions, ...mentioned.filter((m) => !rule.suggestions.some((r) => r.id === m.id))].slice(0, 4);
    return { ...rule, answer, suggestions, source: 'llm', model: cfg.model };
  }
}
