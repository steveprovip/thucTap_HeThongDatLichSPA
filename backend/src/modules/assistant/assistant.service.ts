import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { appendFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { formatVnd } from '../../common/utils/currency.util';
import { addDays, dayOfWeek, endOfDay, startOfDay, todaySalon, toSalon } from '../../common/utils/time.util';
import { StylistsService } from '../stylists/stylists.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { AvailabilityService } from '../booking-engine/availability.service';
import {
  AssistantContext, AssistantIntent, ComboInsight, contextForLlm, detectIntent, DOW_VI, fold, GoldenHour, hourLabel,
  HolidayLite, parsePeriod, quickReplies, ruleAnswer, ShiftGapSuggestion, StaffFacts, SYSTEM_PROMPT, TodaySnapshot, topN,
  WorkingStylist,
} from './assistant-rules';
import { APPOINTMENT_STATUS_LABELS } from '../../common/constants/messages.constant';
import { findLocalAiDir, isLoopbackUrl, launchLocalAi } from './local-ai-launcher';
import { LlmGate, SingleFlight, TtlCache } from './llm-gate';
import { EventsService } from '../events/events.service';
import {
  CatalogItem, CUSTOMER_SYSTEM_PROMPT, DialogState, customerContextForLlm, CustomerReply, customerRuleReply, SalonFacts,
  DIRECT_INTENTS, availabilityAnswer, isUnaccented, leadSentence, matchServices, sanitizeLlmAnswer, stripBookingNag, ungroundedClaim,
  buildRewriteMessages, faithfulRewrite, groupAvailabilityAnswer, LearnedPhrase, parseRewrite, repeatGuard,
  AvailabilityData, bookTimeFor, nearestSlotNote, pickNearestSlot, VerifiedSlot,
} from './customer-assistant-rules';
import type { WhenQuery } from './customer-intent-parsers';
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
  /** Máy này đã tải model (model_AI_local) và bật được AI local một chạm. */
  localAvailable: boolean;
  /** Đang khởi động AI local (đã bật chay_ai_local.cmd, chờ model nạp xong). */
  localStarting: boolean;
  /** Máy có model nhưng AI local không chạy (đã tắt / tự bật không lên) → giao diện hiện nút "Khởi động lại AI". */
  localLost: boolean;
}

export interface AssistantInsights {
  windowDays: number;
  goldenHours: GoldenHour[];
  quietHours: GoldenHour[];
  combos: ComboInsight[];
  topServices: { name: string; count: number }[];
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Câu trả lời coi là "chưa giải quyết được" để ghi vào lỗ hổng kiến thức. */
const GAP_INTENTS = new Set(['unknown', 'handoff', 'not_offered']);
/** Chủ tiệm duyệt một câu mà luật vẫn không hiểu → báo lỗi 400 có lời giải thích. */
export class LearningRejected extends Error {}
interface GapEntry { at: string; q: string; intent: string }
/** Che SĐT, email, dãy số dài trước khi ghi nhật ký (bảo vệ dữ liệu cá nhân). */
export const redactPersonal = (text: string): string => text
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
  .replace(/(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/g, '[sđt]')
  .replace(/\d{6,}/g, '[số]');

interface PublicData {
  at: number;
  catalog: CatalogItem[];
  hotIds: string[];
  facts: SalonFacts;
  /** serviceId → lượt đặt 90 ngày. */
  popularity: Record<string, number>;
  /** Câu / cụm từ chủ tiệm đã duyệt (vòng tự cải tiến). */
  learned: LearnedPhrase[];
}

/** Đề xuất học / câu đã học của trợ lý (bảng assistant_learned_phrases). */
export interface LearnedPhraseRow {
  id: string; kind: 'question' | 'alias' | 'answer'; phrase: string; rewrite: string; intent: string | null;
  status: 'suggested' | 'approved' | 'rejected'; source: 'llm' | 'rephrase' | 'owner'; hits: number; createdAt: string; updatedAt: string;
}

export interface CustomerChatResult extends CustomerReply {
  source: 'llm' | 'rules';
  model: string | null;
  /** Câu luật chưa hiểu được mô hình viết lại → "Mình hiểu là: …" (khách thấy trợ lý hiểu gì, sửa được nếu sai). */
  understoodAs?: string;
  /** Ngày vừa tra giờ trống (yyyy-MM-dd) — nút "Đặt" mở phiếu đặt lịch đúng ngày này. */
  bookDate?: string;
  /** Giờ (HH:mm) ĐÃ TRA THẬT còn trống — nút "Đặt" mở phiếu chọn sẵn đúng giờ này (không bao giờ là giờ suy đoán). */
  bookTime?: string;
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
/** Câu hỏi số liệu của trợ lý nhân sự trả lời thẳng bằng dữ liệu thật (không qua mô hình ngôn ngữ). */
const STAFF_FACT_INTENTS: ReadonlySet<AssistantIntent> = new Set<AssistantIntent>([
  'today', 'working_stylists', 'top_customers', 'next_appointment', 'closed_days', 'service_count', 'revenue', 'stylist_load',
]);
const INSIGHT_DAYS = 90;
/** Dò lại máy chủ AI local sau: 30 giây khi đang chạy, 10 giây khi chưa thấy / vừa lỗi (bật model lên là dùng ngay). */
const PROBE_OK_MS = 30_000;
const PROBE_MISS_MS = 10_000;
/** Nạp model 4B lên card đồ hoạ mất 20–90 giây: không bật lại chay_ai_local.cmd lần nữa trong khoảng này. */
const AUTOSTART_COOLDOWN_MS = 3 * 60_000;
/** Tự bật lại tối đa 3 lần liên tiếp không thành công (model hỏng / thiếu VRAM…) rồi chờ người bấm "Khởi động lại AI". */
const MAX_AUTO_STARTS = 3;

/**
 * Part 5 — Trợ lý AI cho chủ tiệm & lễ tân. Lõi là SỐ LIỆU THẬT (giờ vàng, combo, khung thiếu thợ, ngày lễ) tính bằng
 * SQL tổng hợp; mô hình ngôn ngữ nhỏ (tuỳ chọn) chỉ diễn đạt lại thành câu trả lời tự nhiên. Không gửi dữ liệu cá nhân
 * của khách cho mô hình. (Excel đặt "ML gợi ý" ngoài phạm vi bản đầu → đây là phần mở rộng theo yêu cầu mentor.)
 */
@Injectable()
export class AssistantService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AssistantService.name);
  private cache: { at: number; ctx: AssistantContext } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly stylists: StylistsService,
    private readonly workingHours: WorkingHoursService,
    private readonly availability: AvailabilityService,
    @Optional() events?: EventsService,
  ) {
    const n = (k: string, d: number): number => this.config.get<number>(`ai.${k}`) ?? d;
    this.gate = new LlmGate(n('maxConcurrency', 2), n('maxQueue', 6), n('queueWaitMs', 4000));
    this.answerCache = new TtlCache(n('cacheMinutes', 10) * 60_000, 500);
    // Dịch vụ / giá / giờ mở cửa vừa đổi → bỏ danh mục và câu trả lời AI đã nhớ (tránh báo giá cũ)
    events?.stream().subscribe((e) => {
      if (['services', 'service-categories', 'stylists', 'working-hours', 'holidays', 'vouchers'].includes(e.scope)) {
        this.publicCache = null;
        this.answerCache.clear();
      }
    });
  }

  /** Chịu tải: số câu gọi mô hình cùng lúc / hàng chờ / bộ nhớ đệm câu trả lời (xem llm-gate.ts). */
  private readonly gate: LlmGate;
  private readonly answerCache: TtlCache<{ answer: string; suggestions: CatalogItem[] }>;
  private readonly llmFlight = new SingleFlight<{ answer: string; suggestions: CatalogItem[] } | 'busy' | 'ungrounded' | null>();
  private readonly publicFlight = new SingleFlight<PublicData>();
  /** Câu viết lại của mô hình theo câu khách (bỏ dấu) — 1000 khách hỏi cùng một câu lạ chỉ tốn một lượt mô hình. */
  private readonly rewriteCache = new TtlCache<{ v: string | null }>(30 * 60_000, 500);
  private readonly rewriteFlight = new SingleFlight<string | null>();
  private readonly contextFlight = new SingleFlight<AssistantContext>();

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
      if (cfg) { this.autostartAt = 0; this.autoAttempts = 0; this.wasUp = true; }
      else if (this.config.get<boolean>('ai.autostart') && this.autoAttempts < MAX_AUTO_STARTS) this.startLocal(false);
    }
    return this.probe?.cfg ?? null;
  }

  private autostartAt = 0;
  /** AI local từng chạy trong phiên backend này (để phân biệt "mất kết nối" với "chưa bật bao giờ"). */
  private wasUp = false;
  private autoAttempts = 0;

  /** Thư mục model_AI_local nếu máy này bật được AI local (chế độ auto + địa chỉ localhost + đã tải model). */
  private localDir(): string | null {
    if (this.settings.provider !== 'auto' || !isLoopbackUrl(this.localUrl)) return null;
    return findLocalAiDir();
  }

  /**
   * QA Sprint 3 · mục 6 — tự phục hồi AI: bật lại máy chủ AI local đã tải sẵn (ẩn cửa sổ). `manual` = người dùng bấm nút
   * "Bật AI local" (vẫn tôn trọng thời gian chờ nạp model để không bật hai bản cùng lúc).
   */
  startLocal(manual = true): { started: boolean; starting: boolean; message: string } {
    const dir = this.localDir();
    if (!dir) {
      return { started: false, starting: false, message: 'Máy này chưa tải AI local (model_AI_local\\tai_model_local.cmd) hoặc đang dùng AI cấu hình cố định' };
    }
    if (Date.now() - this.autostartAt < AUTOSTART_COOLDOWN_MS) {
      return { started: false, starting: true, message: 'AI local đang khởi động, model nạp xong là trợ lý tự chuyển sang AI' };
    }
    const started = launchLocalAi(dir);
    if (!started) return { started: false, starting: false, message: 'Hệ điều hành này chưa hỗ trợ bật AI local một chạm' };
    this.autostartAt = Date.now();
    this.autoAttempts = manual ? 0 : this.autoAttempts + 1; // bấm tay: cho tự phục hồi thêm một vòng nữa
    this.probe = { at: Date.now(), cfg: null }; // dò lại sau 10 giây
    this.logger.log(`${manual ? 'Người dùng bật' : 'Tự bật lại'} AI local: ${dir}`);
    return { started: true, starting: true, message: 'Đang bật AI local, khoảng 30–90 giây nữa trợ lý sẽ trả lời bằng AI' };
  }

  /**
   * Zero-touch: backend vừa khởi động (thường ngay sau khi bật lại máy) → nếu máy này đã tải model_AI_local mà cổng AI
   * chưa mở thì bật ngầm chay_ai_local.cmd luôn, không đợi có người hỏi trợ lý hay bấm nút. Chạy nền, không chặn khởi động.
   */
  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>('ai.autostart') || !this.localDir()) return;
    void this.resolveLlm()
      .then((cfg) => { if (cfg) this.logger.log(`AI local ${cfg.model} đã sẵn sàng khi khởi động`); })
      .catch(() => undefined);
  }

  /** Mô hình vừa lỗi / quá giờ: chế độ auto tạm dùng luật 10 giây rồi mới dò lại (không bắt khách chờ timeout liên tiếp). */
  private markLlmDown(): void {
    if (this.settings.provider === 'auto') this.probe = { at: Date.now(), cfg: null };
  }

  async status(): Promise<AssistantStatus> {
    const s = this.settings;
    const cfg = await this.resolveLlm();
    const dir = cfg ? null : this.localDir();
    const starting = !cfg && Date.now() - this.autostartAt < AUTOSTART_COOLDOWN_MS;
    return {
      mode: cfg ? 'llm' : 'rules',
      setting: s.provider,
      provider: cfg?.provider ?? null,
      model: cfg?.model ?? null,
      localDetected: s.provider === 'auto' && !!cfg,
      localUrl: s.provider === 'auto' ? this.localUrl : null,
      localAvailable: !cfg && !!dir,
      localStarting: starting,
      // Mất kết nối = máy có model nhưng AI không chạy: đã từng chạy rồi tắt, đã tự bật mà không lên, hoặc tắt tự bật
      localLost: !cfg && !!dir && !starting && (this.wasUp || this.autostartAt > 0 || !this.config.get<boolean>('ai.autostart')),
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
    return this.contextFlight.do('ctx', async () => {
      const [ins, shifts, holidays] = await Promise.all([
        this.insights(), this.shiftSuggestions(7, 1), this.holidaysLite(),
      ]);
      const ctx: AssistantContext = { ...ins, gaps: shifts.gaps, holidays };
      this.cache = { at: Date.now(), ctx };
      return ctx;
    });
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

  /**
   * QA 12/10 — thợ có ca hôm nay + đang trong ca / đang làm khách / đang rảnh (tươi mỗi câu hỏi). Chỉ tên thợ (nhân sự),
   * không có dữ liệu khách. Thợ xin nghỉ cả ngày không tính là đang trong ca.
   */
  async workingToday(): Promise<WorkingStylist[]> {
    const rows: {
      stylist_id: string; full_name: string; start_time: string; end_time: string; break_start: string | null; break_end: string | null;
      time_off: string | null; on_shift: boolean; busy: boolean;
    }[] = await this.dataSource.query(
      `WITH n AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time AS lt)
       SELECT s.id AS stylist_id, s.full_name,
              to_char(sh.start_time, 'HH24:MI') AS start_time, to_char(sh.end_time, 'HH24:MI') AS end_time,
              to_char(sh.break_start, 'HH24:MI') AS break_start, to_char(sh.break_end, 'HH24:MI') AS break_end,
              (SELECT string_agg(CASE WHEN o.start_time IS NULL THEN 'cả ngày'
                        ELSE to_char(o.start_time, 'HH24:MI') || '–' || to_char(o.end_time, 'HH24:MI') END, ', ' ORDER BY o.start_time NULLS FIRST)
                 FROM stylist_time_off o WHERE o.stylist_id = s.id AND o.off_date = sh.work_date) AS time_off,
              (n.lt >= sh.start_time AND n.lt < sh.end_time
                AND NOT (sh.break_start IS NOT NULL AND n.lt >= sh.break_start AND n.lt < sh.break_end)
                AND NOT EXISTS (SELECT 1 FROM stylist_time_off o WHERE o.stylist_id = s.id AND o.off_date = sh.work_date
                                 AND (o.start_time IS NULL OR (n.lt >= o.start_time AND n.lt < o.end_time)))) AS on_shift,
              EXISTS (SELECT 1 FROM appointments a WHERE a.stylist_id = s.id
                       AND (a.status = 'in_progress'
                         OR (a.status IN ('confirmed', 'arrived') AND a.start_at <= now() AND a.end_at > now()))) AS busy
         FROM stylist_shifts sh JOIN stylists s ON s.id = sh.stylist_id CROSS JOIN n
        WHERE sh.work_date = $1 AND s.is_active
        ORDER BY sh.start_time, s.full_name`, [todaySalon()]);

    const byStylist = new Map<string, WorkingStylist>();
    for (const r of rows) {
      const text = `${r.start_time}–${r.end_time}${r.break_start ? ` (nghỉ ${r.break_start}–${r.break_end})` : ''}`;
      const cur = byStylist.get(r.stylist_id);
      if (cur) {
        cur.shiftsText += `, ${text}`;
        cur.onShiftNow ||= r.on_shift;
      } else {
        byStylist.set(r.stylist_id, { fullName: r.full_name, shiftsText: text, onShiftNow: r.on_shift, busyNow: r.busy, timeOff: r.time_off });
      }
    }
    return [...byStylist.values()];
  }

  /**
   * QA Sprint 3 · mục 6 — số liệu thật cho câu hỏi tra cứu (top khách, lịch gần nhất, ngày nghỉ, số dịch vụ, doanh thu
   * theo kỳ, thợ ít / nhiều việc). Chỉ đọc khi đúng ý định → không tốn truy vấn cho câu khác. Trả thẳng bằng luật, KHÔNG
   * gửi tên khách cho mô hình ngôn ngữ.
   */
  async staffFacts(intent: AssistantIntent, message: string): Promise<StaffFacts> {
    const today = todaySalon();
    switch (intent) {
      case 'top_customers': {
        const rows: { full_name: string; visits: number; spent: string }[] = await this.dataSource.query(
          `SELECT c.full_name, count(*)::int AS visits,
                  COALESCE((SELECT sum(i.total) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'closed'), 0)::bigint AS spent
             FROM appointments a JOIN customers c ON c.id = a.customer_id
            WHERE a.status = 'completed'
            GROUP BY c.id, c.full_name ORDER BY visits DESC, spent DESC, c.full_name LIMIT $1`, [topN(message)]);
        return { topCustomers: rows.map((r) => ({ fullName: r.full_name, visits: r.visits, spentText: formatVnd(Number(r.spent)) })) };
      }
      case 'next_appointment': {
        const rows: { full_name: string; start_at: Date; status: string; stylist: string; services: string | null }[] = await this.dataSource.query(
          `SELECT c.full_name, a.start_at, a.status::text AS status, st.full_name AS stylist,
                  (SELECT string_agg(x.name_snapshot, ', ' ORDER BY x.position) FROM appointment_services x WHERE x.appointment_id = a.id) AS services
             FROM appointments a JOIN customers c ON c.id = a.customer_id JOIN stylists st ON st.id = a.stylist_id
            WHERE a.start_at >= now() AND a.status IN ('pending', 'confirmed')
            ORDER BY a.start_at LIMIT 3`);
        return {
          upcoming: rows.map((r) => {
            const t = toSalon(new Date(r.start_at));
            return {
              fullName: r.full_name, services: r.services ?? 'dịch vụ', stylist: r.stylist,
              whenText: `${t.toFormat('HH:mm')} ${DOW_VI[t.weekday % 7]} ${t.toFormat('dd/MM')}`,
              statusLabel: APPOINTMENT_STATUS_LABELS[r.status] ?? r.status,
              minutesUntil: Math.max(0, Math.round((new Date(r.start_at).getTime() - Date.now()) / 60_000)),
            };
          }),
        };
      }
      case 'closed_days': {
        const [hours, upcoming] = await Promise.all([
          this.workingHours.list(),
          this.dataSource.query(
            `SELECT reason, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
               FROM salon_holidays WHERE end_date >= $1 ORDER BY start_date LIMIT 8`, [today]) as Promise<{ reason: string; start_date: string; end_date: string }[]>,
        ]);
        const DOW_FULL = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
        return {
          closed: {
            weeklyClosed: hours.filter((h) => h.isClosed).map((h) => DOW_FULL[h.dayOfWeek]),
            upcoming: upcoming.map((h) => ({ reason: h.reason, startDate: h.start_date, endDate: h.end_date })),
          },
        };
      }
      case 'service_count': {
        const rows: { name: string; n: number; min: string; max: string }[] = await this.dataSource.query(
          `SELECT g.name, count(*)::int AS n, min(s.price)::bigint AS min, max(s.price)::bigint AS max
             FROM services s JOIN service_categories g ON g.id = s.category_id
            WHERE s.is_active GROUP BY g.id, g.name, g.display_order ORDER BY g.display_order, g.name`);
        const min = rows.length ? Math.min(...rows.map((r) => Number(r.min))) : 0;
        const max = rows.length ? Math.max(...rows.map((r) => Number(r.max))) : 0;
        return {
          services: {
            total: rows.reduce((a, r) => a + r.n, 0), byCategory: rows.map((r) => ({ name: r.name, count: r.n })),
            minPriceText: formatVnd(min), maxPriceText: formatVnd(max),
          },
        };
      }
      case 'revenue': {
        const period = parsePeriod(message, today);
        const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1;
        const prevFrom = addDays(period.from, -days);
        const prevTo = addDays(period.from, -1);
        const sumOf = (from: string, to: string) => this.dataSource.query(
          `SELECT COALESCE(sum(total), 0)::bigint AS total, count(*)::int AS n FROM invoices
            WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2`, [startOfDay(from), endOfDay(to)]) as Promise<{ total: string; n: number }[]>;
        const [[cur], [prev], best] = await Promise.all([
          sumOf(period.from, period.to), sumOf(prevFrom, prevTo),
          this.dataSource.query(
            `SELECT to_char((closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'DD/MM') AS day, sum(total)::bigint AS total FROM invoices
              WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
            [startOfDay(period.from), endOfDay(period.to)]) as Promise<{ day: string; total: string }[]>,
        ]);
        const total = Number(cur.total);
        const prevTotal = Number(prev.total);
        return {
          revenue: {
            label: period.label, totalText: formatVnd(total), invoices: cur.n, avgText: formatVnd(cur.n ? Math.round(total / cur.n) : 0),
            changePct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
            bestDay: best[0] && days > 1 ? `${best[0].day} (${formatVnd(Number(best[0].total))})` : null,
          },
        };
      }
      case 'stylist_load': {
        const period = parsePeriod(message, today);
        const order = /(nhieu|ban|cham chi)/.test(fold(message)) && !/it/.test(fold(message)) ? 'desc' : 'asc';
        const rows: { full_name: string; done: number; minutes: number }[] = await this.dataSource.query(
          `SELECT st.full_name, count(a.id)::int AS done,
                  COALESCE(sum(EXTRACT(EPOCH FROM (a.end_at - a.start_at)) / 60), 0)::int AS minutes
             FROM stylists st
             LEFT JOIN appointments a ON a.stylist_id = st.id AND a.status = 'completed' AND a.start_at >= $1 AND a.start_at <= $2
            WHERE st.is_active
            GROUP BY st.id, st.full_name
            ORDER BY done ${order === 'asc' ? 'ASC' : 'DESC'}, minutes ${order === 'asc' ? 'ASC' : 'DESC'}, st.full_name`,
          [startOfDay(period.from), endOfDay(period.to)]);
        return { stylistLoad: { label: period.label, order, rows: rows.map((r) => ({ fullName: r.full_name, done: r.done, minutes: r.minutes })) } };
      }
      default:
        return {};
    }
  }

  /** Lịch sử hội thoại gần nhất (tối đa 6 lượt) để mô hình hiểu câu hỏi nối tiếp ("thế còn thứ 7?"). */
  private history(history: ChatTurn[] = []): LlmMessage[] {
    return history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 500) }));
  }

  async chat(message: string, opts: { userName?: string | null; history?: ChatTurn[] } = {}): Promise<AssistantChatResult> {
    const intent = detectIntent(message);
    const [cached, today, workingToday, facts] = await Promise.all([
      this.context(), this.todaySnapshot().catch(() => null), this.workingToday().catch(() => null),
      this.staffFacts(intent, message).catch((e: unknown) => { this.logger.warn(`Tra cứu "${intent}" lỗi: ${(e as Error).message}`); return null; }),
    ]);
    const ctx: AssistantContext = { ...cached, today, workingToday, facts };
    const fallback = ruleAnswer(intent, ctx, { userName: opts.userName, now: new Date() });
    const base = { intent, quickReplies: quickReplies(intent) };
    // Số liệu hôm nay / danh sách thợ đã chính xác → trả thẳng, không để mô hình nhỏ diễn đạt lại (hay sai số, rơi tên)
    if (STAFF_FACT_INTENTS.has(intent)) return { ...base, answer: fallback, source: 'rules', model: null };
    const cfg = await this.resolveLlm();
    if (!cfg) return { ...base, answer: fallback, source: 'rules', model: null };

    const call = await this.gate.run(async () => ({ text: await callLlm(cfg, [
      { role: 'system', content: `${SYSTEM_PROMPT}\nNgười đang trò chuyện: ${opts.userName ?? 'nhân viên tiệm'}.\nDỮ LIỆU:\n${contextForLlm(ctx)}` },
      ...this.history(opts.history),
      { role: 'user', content: `${message.trim()}\n\n(Gợi ý theo luật, dùng nếu phù hợp: ${fallback})` },
    ]) }));
    // Mô hình đang bận phục vụ người khác → trả lời ngay bằng số liệu thật, KHÔNG coi là mô hình hỏng
    if (!call) return { ...base, answer: fallback, source: 'rules', model: null };
    const answer = call.text ? sanitizeLlmAnswer(call.text) : '';
    if (!answer) {
      this.logger.warn(`Mô hình ${cfg.provider}/${cfg.model} không phản hồi kịp — dùng câu trả lời theo luật`);
      this.markLlmDown();
      return { ...base, answer: fallback, source: 'rules', model: null };
    }
    return { ...base, answer, source: 'llm', model: cfg.model };
  }

  // ------------------------------------------------------------- AI tư vấn khách (trang công khai)
  private publicCache: PublicData | null = null;

  private async publicData(): Promise<PublicData> {
    if (this.publicCache && Date.now() - this.publicCache.at < 60_000) return this.publicCache;
    // Hết hạn bộ nhớ đệm lúc đang đông khách: MỘT lần đọc CSDL cho mọi request đang chờ (không 1000 lần)
    return this.publicFlight.do('public', () => this.loadPublicData());
  }

  private async loadPublicData(): Promise<PublicData> {
    const [groups, counts, hours, team, holidays, roster, promos, learned] = await Promise.all([
      this.availability.publicCatalog(),
      // Lượt đặt 90 ngày của MỌI dịch vụ (trước đây LIMIT 8 → nhóm combo bị báo "chưa đủ lượt đặt" dù có khách đặt)
      this.dataSource.query(
        `SELECT x.service_id AS id, count(*)::int AS n
           FROM appointment_services x JOIN appointments a ON a.id = x.appointment_id
          WHERE a.start_at >= now() - interval '90 days' AND a.status <> 'cancelled'
          GROUP BY 1 ORDER BY n DESC`) as Promise<{ id: string; n: number }[]>,
      this.workingHours.list(),
      // Thợ đang làm việc theo giới tính (tên / giới tính vốn công khai ở bước chọn thợ) — "có thợ nữ không"
      this.dataSource.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE gender = 'female')::int AS female,
                count(*) FILTER (WHERE gender = 'male')::int AS male FROM stylists WHERE is_active`) as Promise<{ total: number; female: number; male: number }[]>,
      // Ngày nghỉ toàn tiệm sắp tới — "bây giờ còn mở cửa không" phải biết hôm nay tiệm nghỉ lễ
      this.dataSource.query(
        `SELECT to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate", reason
           FROM salon_holidays WHERE end_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1
          ORDER BY start_date LIMIT 30`) as Promise<{ startDate: string; endDate: string; reason: string }[]>,
      // Thợ + dịch vụ làm được (công khai ở bước "Chọn thợ") — "có những thợ nào làm được gội đầu"
      this.dataSource.query(
        `SELECT s.id, s.full_name AS name, s.gender, COALESCE(array_agg(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL), '{}') AS "serviceIds"
           FROM stylists s LEFT JOIN stylist_services ss ON ss.stylist_id = s.id
          WHERE s.is_active GROUP BY s.id ORDER BY s.full_name`) as Promise<{ id: string; name: string; gender: string | null; serviceIds: string[] }[]>,
      // Ưu đãi ĐANG chạy (còn hạn, còn lượt) — không lấy mã
      this.dataSource.query(
        `SELECT description, discount_type AS type, discount_value::float AS value, min_order_value::float AS "minOrder",
                to_char(end_date, 'YYYY-MM-DD') AS "endDate"
           FROM vouchers
          WHERE is_active AND start_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND end_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            AND (max_usage IS NULL OR used_count < max_usage)
          ORDER BY end_date LIMIT 5`) as Promise<{ description: string | null; type: 'percent' | 'amount'; value: number; minOrder: number | null; endDate: string }[]>,
      this.approvedPhrases(),
    ]);
    const catalog: CatalogItem[] = groups.flatMap((g) => g.services.map((s) => ({
      id: s.id, name: s.name, categoryName: g.categoryName, durationMinutes: s.durationMinutes,
      price: s.price, priceText: s.priceText, description: s.description, imageUrl: s.imageUrl,
    })));
    const c = (k: string): string => this.config.get<string>(`app.${k}`) ?? '';
    const facts: SalonFacts = {
      name: c('salonName'), hotline: c('salonHotline'), address: c('salonAddress'),
      openingHours: hours.map((h) => ({ dayLabel: h.dayLabel, isClosed: h.isClosed, openTime: h.openTime, closeTime: h.closeTime })),
      cancelCutoffMinutes: this.config.get<number>('business.cancelCutoffMinutes') ?? 120,
      maxActiveBookingsPerPhone: this.config.get<number>('business.maxActiveBookingsPerPhone') ?? 3,
      stylists: team[0] ?? { total: 0, female: 0, male: 0 },
      holidays,
      team: roster.map((t) => ({ ...t, serviceIds: Array.isArray(t.serviceIds) ? t.serviceIds : [] })),
      promotions: promos,
    };
    const ids = new Set(catalog.map((x) => x.id));
    const live = counts.filter((h) => ids.has(h.id));
    this.publicCache = {
      at: Date.now(), catalog, facts,
      hotIds: live.slice(0, 8).map((h) => h.id),
      popularity: Object.fromEntries(live.map((h) => [h.id, h.n])),
      learned,
    };
    return this.publicCache;
  }

  /**
   * TASK v3 · NV1 + QA nhập vai 12/10 — tư vấn khách trên trang công khai. NỘI DUNG luôn lấy từ dữ liệu thật (danh mục, lượt đặt,
   * giờ trống, chính sách); mô hình ngôn ngữ (nếu bật) chỉ lo phần trò chuyện: câu dẫn cho gợi ý, giải thích theo mô tả dịch vụ,
   * chào hỏi và câu tự do. Thẻ dịch vụ luôn trùng với dịch vụ có trong câu trả lời.
   */
  /** `record` = false: lượt của bộ chấm điểm (scripts/ai/eval-assistant.mjs) — không ghi vào báo cáo cải tiến / đề xuất học. */
  async customerChat(message: string, history: ChatTurn[] = [], state?: DialogState, record = true): Promise<CustomerChatResult> {
    const inner = await this.customerChatInner(message, history, state, record);
    // Câu cuối cùng (kể cả câu mô hình viết / tra giờ thật) cũng không được lặp nguyên văn câu vừa trả lời
    const lastBot = [...history].reverse().find((h) => h.role === 'assistant')?.content ?? '';
    // (giờ trống được hỏi lại thì vẫn trả đủ giờ — số liệu thật, khách cần xem lại)
    const result = inner.bookDate || inner.intent === 'availability' ? inner : repeatGuard(inner, lastBot, (await this.publicData()).facts);
    // Vòng cải tiến liên tục (kiểu Zendesk / HubSpot "knowledge gaps"): ghi câu trợ lý chưa trả lời được để chủ tiệm bổ sung
    if (record && GAP_INTENTS.has(result.intent)) void this.recordGap(message, result.intent);
    else if (record && result.repeated) void this.recordGap(message, `repeat:${result.intent}`.slice(0, 40));
    return result;
  }

  private async customerChatInner(message: string, history: ChatTurn[], state?: DialogState, record = true): Promise<CustomerChatResult> {
    const { catalog, hotIds, facts, popularity, learned } = await this.publicData();
    const today = todaySalon();
    const ruleOpts = { history, popularity, today, state, learned, nowTime: toSalon(new Date()).toFormat('HH:mm') };
    let { pending, ...rule } = customerRuleReply(message, catalog, hotIds, facts, new Date(), ruleOpts);
    let understoodAs: string | undefined;
    // Luật chưa hiểu (misses > 0) → mô hình VIẾT LẠI câu cho rõ rồi chạy lại luật: nội dung vẫn từ dữ liệu thật
    if ((rule.state?.misses ?? 0) > 0) {
      const fixed = await this.rewriteQuestion(message, history, catalog, learned);
      if (fixed) {
        const again = customerRuleReply(fixed, catalog, hotIds, facts, new Date(), ruleOpts);
        if (!(again.state?.misses ?? 0)) {
          ({ pending, ...rule } = again);
          understoodAs = fixed;
          if (record) void this.suggestPhrase('question', message, fixed, again.intent, 'llm');
        }
      }
    } else if ((state?.misses ?? 0) > 0) {
      // Lượt trước chưa hiểu, khách tự diễn đạt lại và lần này hiểu được → đề xuất học "câu cũ = câu mới"
      const prevUser = [...history].reverse().find((h) => h.role === 'user')?.content;
      if (record && prevUser && prevUser.length <= 200) void this.suggestPhrase('question', prevUser, message, rule.intent, 'rephrase');
    }
    const direct = (r: CustomerReply = rule): CustomerChatResult => ({ ...r, source: 'rules', model: null, ...(understoodAs ? { understoodAs } : {}) });

    // Cả nhóm ("dịch vụ massage nào còn trống ngày kia"): tra từng dịch vụ, báo dịch vụ nào còn giờ
    if (pending?.kind === 'availability_group') {
      const p = pending;
      try {
        const rows = await Promise.all(p.serviceIds.map(async (id) => ({
          service: catalog.find((s) => s.id === id)!,
          data: await this.availability.getAvailability({ date: p.when.date, serviceIds: [id] }),
        })));
        const known = rows.filter((r) => r.service);
        const g = groupAvailabilityAnswer(p.label, known, p.when, today);
        // Cả nhóm kín / tiệm nghỉ: báo đúng dịch vụ + ngày + giờ trống sớm nhất đã tra thật (không chỉ "thử ngày khác")
        const best = g.open.length ? null : await this.nearestGroupSlot(known, p.when);
        if (best) {
          return { ...direct({ ...rule, answer: g.answer + nearestSlotNote(best.slot, today, best.service.name), suggestions: [best.service],
            quickReplies: [best.service.name] }), bookDate: best.slot.date, bookTime: best.slot.time };
        }
        return { ...direct({ ...rule, answer: g.answer, suggestions: g.open.slice(0, 3), quickReplies: g.open.slice(0, 3).map((x) => x.name) }), bookDate: p.when.date };
      } catch (e) {
        this.logger.warn(`Không tra được giờ trống theo nhóm cho trợ lý: ${(e as Error).message}`);
      }
      return direct();
    }
    // Thợ làm được dịch vụ + ai còn giờ trống ngày đang tra
    if (pending?.kind === 'stylists') {
      const p = pending;
      try {
        const capable = await this.availability.capableStylists([p.serviceId]);
        const service = catalog.find((s) => s.id === p.serviceId);
        if (service) {
          let free = '';
          let next: VerifiedSlot | null = null;
          if (p.date && capable.length) {
            const data = await this.availability.getAvailability({ date: p.date, serviceIds: [p.serviceId] });
            const ids = new Set(data.slots.flatMap((x) => x.stylistIds));
            const names = capable.filter((c) => ids.has(c.id)).map((c) => c.fullName);
            const day = toSalon(new Date(`${p.date}T00:00:00+07:00`)).toFormat('dd/MM');
            if (names.length) free = `\nNgày ${day} còn giờ trống với: ${names.join(', ')}.`;
            else {
              // Thợ kín cả ngày: báo đúng giờ trống gần nhất + thợ nào rảnh lúc đó (đã tra thật), không đoán
              next = await this.nearestVerifiedSlot([p.serviceId], data, { part: null, time: null });
              const who = next ? capable.filter((c) => next!.stylistIds.includes(c.id)).map((c) => c.fullName) : [];
              free = `\nNgày ${day} các thợ này đều đã kín lịch.${next ? nearestSlotNote(next, today) : ''}${who.length ? `\nRảnh lúc đó: ${who.join(', ')}.` : ''}`;
            }
          }
          const answer = capable.length
            ? `${capable.length} thợ làm được ${service.name}: ${capable.map((c) => c.fullName).join(', ')}.${free}\nKhi đặt lịch bạn chọn đích danh thợ hoặc "Thợ bất kỳ".`
            : `Hiện chưa có thợ nào nhận ${service.name}; bạn gọi ${facts.hotline} để tiệm sắp xếp nhé.`;
          return next ? { ...direct({ ...rule, answer }), bookDate: next.date, bookTime: next.time } : direct({ ...rule, answer });
        }
      } catch (e) {
        this.logger.warn(`Không tra được thợ cho trợ lý: ${(e as Error).message}`);
      }
      return direct();
    }

    // Giờ trống: tra THẬT bằng bộ tính khung giờ của trang đặt lịch (cùng luật ca làm, ngày nghỉ, giữ chỗ, 60 phút đặt trước)
    if (pending?.kind === 'availability') {
      const p = pending;
      const service = catalog.find((s) => s.id === p.serviceId);
      try {
        const data = await this.availability.getAvailability({ date: p.when.date, serviceIds: [p.serviceId] });
        if (service) {
          const answer = availabilityAnswer(service, p.when, data, today);
          // Ngày kín / tiệm nghỉ → tra THẬT ngày gần nhất còn chỗ và nêu đúng giờ (ưu tiên buổi / giờ khách hỏi)
          const next = pickNearestSlot(data, { part: null, time: null }) ? null : await this.nearestVerifiedSlot([p.serviceId], data, p.when);
          if (next) return { ...direct({ ...rule, answer: answer + nearestSlotNote(next, today) }), bookDate: next.date, bookTime: next.time };
          const bookTime = bookTimeFor(data, p.when);
          return { ...direct({ ...rule, answer }), bookDate: p.when.date, ...(bookTime ? { bookTime } : {}) };
        }
      } catch (e) {
        this.logger.warn(`Không tra được giờ trống cho trợ lý: ${(e as Error).message}`);
      }
      return direct();
    }
    // Số liệu / chính sách (đếm, rẻ nhất, hot, giá, thời lượng, ngân sách, giờ mở cửa, cọc, huỷ…) → trả thẳng, không qua mô hình
    if (DIRECT_INTENTS.has(rule.intent) || understoodAs) return direct();
    const cfg = await this.resolveLlm();
    if (!cfg) return direct();

    // Kiểu LAI cho tư vấn nhu cầu / đặt lịch: mô hình chỉ viết 1–2 câu dẫn, danh sách dịch vụ + giá do dữ liệu quyết định
    // (thử thật: mô hình 4B đọc "toc kho xo" thành gợi ý CẮT tóc, kể dịch vụ khác với thẻ gợi ý bên dưới)
    const hybrid = rule.intent === 'need' || rule.intent === 'book';
    // Câu gõ không dấu: mô hình 4B hay đọc sai ("toc kho xo" → "làm tóc kho xo đẹp") → trả bằng dữ liệu, không câu dẫn
    // Câu dẫn của mô hình chỉ khi bật AI_LLM_LEAD=1 (mặc định: câu dẫn soạn sẵn — mô hình 4B hay viết sai nghĩa)
    if (hybrid && (isUnaccented(message) || !this.config.get<boolean>('ai.llmLead'))) return direct();
    const key = history.length ? null : `${cfg.model}|${rule.intent}|${fold(message)}`;
    const cached = key ? this.answerCache.get(key) : undefined;
    if (cached) return { ...rule, ...cached, source: 'llm', model: cfg.model };

    const hint = hybrid
      ? `(Viết 1–2 câu mở đầu thân thiện, đồng cảm với nhu cầu của khách. KHÔNG liệt kê dịch vụ, KHÔNG nêu giá hay thời lượng — `
        + 'danh sách dịch vụ sẽ được hệ thống gắn ngay sau câu của bạn.)'
      : rule.intent === 'explain'
        // Câu giải thích: chỉ đưa MÔ TẢ dịch vụ liên quan làm dữ liệu (không đưa câu trả lời luật "gọi hotline…")
        ? `(Khách hỏi để hiểu: giải thích ngắn gọn CHỈ dựa trên mô tả dịch vụ của tiệm dưới đây; thiếu thông tin thì nói chuyên viên sẽ `
          + `tư vấn tại tiệm. Mô tả: ${(rule.suggestions.length ? rule.suggestions : matchServices(message, catalog, 3, true))
            .map((s) => `${s.name} (${s.durationMinutes} phút, ${s.priceText}): ${s.description ?? 'chưa có mô tả'}`).join(' | ') || 'không có'})`
        : `(Gợi ý theo luật, dùng nếu phù hợp: ${rule.answer})`;
    const ask = async (): Promise<{ answer: string; suggestions: CatalogItem[] } | 'busy' | 'ungrounded' | null> => {
      const call = await this.gate.run(() => callLlm(cfg, [
        { role: 'system', content: `${CUSTOMER_SYSTEM_PROMPT}\n${customerContextForLlm(catalog, hotIds, facts)}` },
        ...this.history(history),
        { role: 'user', content: `${message.trim()}\n\n${hint}` },
      ]).then((text) => ({ text })));
      if (!call) return 'busy';
      const text = call.text ? sanitizeLlmAnswer(call.text) : '';
      if (!text) return null;
      let out: { answer: string; suggestions: CatalogItem[] };
      if (hybrid) {
        const intro = leadSentence(text);
        const body = rule.answer.replace(/^(?:[^\n]*\n)?Mình gợi ý:|^Với nhu cầu của bạn, mình gợi ý:/, 'Mình gợi ý:');
        out = { answer: intro ? `${intro}\n${body}` : rule.answer, suggestions: rule.suggestions };
      } else {
        // Thẻ = đúng các dịch vụ mô hình nêu tên trong câu trả lời (theo thứ tự xuất hiện) — chỉ cho câu tự do
        // Câu tự do khẳng định giờ trống / giá không có trong dữ liệu → bỏ, trả lời bằng luật (không bao giờ đưa số bịa cho khách)
        if (ungroundedClaim(text, catalog)) return 'ungrounded';
        const folded = fold(text);
        const mentioned = catalog.map((s) => ({ s, at: folded.indexOf(fold(s.name)) })).filter((x) => x.at >= 0 && fold(x.s.name).length >= 4)
          .sort((a, b) => a.at - b.at).map((x) => x.s);
        out = { answer: stripBookingNag(text) || text, suggestions: rule.intent === 'unknown' ? mentioned.slice(0, 3) : [] };
      }
      if (key) this.answerCache.set(key, out);
      return out;
    };
    const res = key ? await this.llmFlight.do(key, ask) : await ask();
    if (res === 'busy') return direct(); // quá tải: trả lời ngay bằng số liệu thật
    if (res === 'ungrounded') {
      this.ungroundedBlocked += 1;
      return direct();
    }
    if (!res) {
      this.markLlmDown();
      return direct();
    }
    return { ...rule, ...res, source: 'llm', model: cfg.model };
  }

  /**
   * Ngày khách hỏi kín / tiệm nghỉ → tra THẬT các ngày gần nhất còn chỗ (`suggestedDates` của AvailabilityService, cùng luật
   * ca làm, ngày nghỉ, giữ chỗ, đặt trước 60 phút) để nêu đúng NGÀY + GIỜ. Không tra được → null: trợ lý không bao giờ đưa giờ đoán.
   */
  private async nearestVerifiedSlot(serviceIds: string[], data: AvailabilityData, when: Pick<WhenQuery, 'part' | 'time'>): Promise<VerifiedSlot | null> {
    for (const date of data.suggestedDates.slice(0, 2)) {
      try {
        const pick = pickNearestSlot(await this.availability.getAvailability({ date, serviceIds }), when);
        if (pick) return { date, ...pick };
      } catch (e) {
        this.logger.warn(`Không tra được giờ trống gần nhất cho trợ lý: ${(e as Error).message}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Cả nhóm kín đúng giờ / buổi khách hỏi. Ngày đó còn dịch vụ trong nhóm có giờ trống → khung gần giờ khách hỏi nhất NGAY
   * NGÀY ĐÓ (cùng luật pickNearestSlot của một dịch vụ, áp trên khung tốt nhất của từng dịch vụ). Chỉ khi cả nhóm kín cả ngày
   * mới lấy dịch vụ có ngày còn chỗ SỚM NHẤT (tối đa 3 dịch vụ cùng ngày đó được tra giờ) → giờ sớm nhất.
   */
  private async nearestGroupSlot(
    rows: { service: CatalogItem; data: AvailabilityData }[], when: Pick<WhenQuery, 'date' | 'part' | 'time'>,
  ): Promise<{ service: CatalogItem; slot: VerifiedSlot } | null> {
    const sameDay = rows.flatMap((r) => {
      const pick = pickNearestSlot(r.data, when);
      return pick ? [{ service: r.service, pick }] : [];
    }).sort((a, b) => a.pick.time.localeCompare(b.pick.time));
    const best = pickNearestSlot({ salonClosed: false, closedReason: null, suggestedDates: [], slots: sameDay.map((x) => x.pick) }, when);
    const hit = sameDay.find((x) => x.pick === best);
    if (hit) return { service: hit.service, slot: { date: when.date, ...hit.pick } };
    const dates = rows.map((r) => r.data.suggestedDates[0]).filter((d): d is string => !!d).sort();
    if (!dates.length) return null;
    const found: { service: CatalogItem; slot: VerifiedSlot }[] = [];
    for (const r of rows.filter((x) => x.data.suggestedDates[0] === dates[0]).slice(0, 3)) {
      const slot = await this.nearestVerifiedSlot([r.service.id], { ...r.data, suggestedDates: [dates[0]] }, when);
      if (slot) found.push({ service: r.service, slot });
    }
    return found.sort((a, b) => a.slot.time.localeCompare(b.slot.time))[0] ?? null;
  }

  // ------------------------------------------------------------- vòng tự cải tiến (viết lại câu + học có người duyệt)
  /** Mô hình viết lại câu khách cho rõ (null nếu không có mô hình / quá tải / mô hình bảo không rõ). */
  private async rewriteQuestion(message: string, history: ChatTurn[], catalog: CatalogItem[], learned: LearnedPhrase[]): Promise<string | null> {
    const cfg = await this.resolveLlm();
    if (!cfg) return null;
    const key = history.length ? null : `${cfg.model}|${fold(message)}`;
    const hit = key ? this.rewriteCache.get(key) : undefined;
    if (hit) return hit.v;
    const run = async (): Promise<string | null> => {
      const examples = learned.filter((x) => x.kind === 'question');
      const call = await this.gate.run(() => callLlm({ ...cfg, timeoutMs: Math.min(cfg.timeoutMs, 12000) },
        buildRewriteMessages(message, history, catalog, examples)).then((text) => ({ text })));
      if (!call) return null; // quá tải: trả lời bằng luật ngay
      const parsed = parseRewrite(call.text, message);
      // Câu viết lại thêm dịch vụ khách không hề nhắc → bỏ (mô hình nhỏ hay "đoán" sai dịch vụ)
      const fixed = parsed && faithfulRewrite(message, parsed, catalog, history) ? parsed : null;
      if (key) this.rewriteCache.set(key, { v: fixed });
      return fixed;
    };
    return key ? this.rewriteFlight.do(key, run) : run();
  }

  private learnedCache: { at: number; rows: LearnedPhrase[] } | null = null;

  /** Câu / cụm từ đã duyệt (bảng chưa có — CSDL cũ chưa migration — thì coi như chưa học gì). */
  private async approvedPhrases(): Promise<LearnedPhrase[]> {
    if (this.learnedCache && Date.now() - this.learnedCache.at < 30_000) return this.learnedCache.rows;
    try {
      const rows = await this.dataSource.query(
        `SELECT kind, phrase, rewrite FROM assistant_learned_phrases WHERE status = 'approved' ORDER BY hits DESC LIMIT 500`) as LearnedPhrase[];
      this.learnedCache = { at: Date.now(), rows };
      return rows;
    } catch {
      return [];
    }
  }

  /** Ghi / cộng dồn một ĐỀ XUẤT học (chưa dùng cho tới khi chủ tiệm duyệt). Đã duyệt / từ chối thì chỉ tăng lượt gặp. */
  private async suggestPhrase(kind: 'question' | 'alias', phrase: string, rewrite: string, intent: string, source: 'llm' | 'rephrase'): Promise<void> {
    const key = fold(redactPersonal(phrase)).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const to = redactPersonal(rewrite).trim().slice(0, 300);
    if (key.length < 3 || !to || fold(to) === key || ['unknown', 'handoff'].includes(intent)) return;
    try {
      await this.dataSource.query(
        `INSERT INTO assistant_learned_phrases (kind, phrase, rewrite, intent, source) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (kind, phrase) DO UPDATE SET hits = assistant_learned_phrases.hits + 1, updated_at = now(),
           rewrite = CASE WHEN assistant_learned_phrases.status = 'suggested' THEN EXCLUDED.rewrite ELSE assistant_learned_phrases.rewrite END,
           intent = CASE WHEN assistant_learned_phrases.status = 'suggested' THEN EXCLUDED.intent ELSE assistant_learned_phrases.intent END`,
        [kind, key, to, intent, source]);
    } catch (e) {
      this.logger.warn(`Không ghi được đề xuất học của trợ lý: ${(e as Error).message}`);
    }
  }

  /** Danh sách đề xuất / câu đã học (mặc định: chờ duyệt, nhiều lượt gặp trước). */
  async learningList(status: 'suggested' | 'approved' | 'rejected' = 'suggested'): Promise<LearnedPhraseRow[]> {
    return this.dataSource.query(
      `SELECT id, kind, phrase, rewrite, intent, status, source, hits, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM assistant_learned_phrases WHERE status = $1 ORDER BY hits DESC, updated_at DESC LIMIT 200`, [status]);
  }

  /**
   * Chủ tiệm duyệt / từ chối / sửa câu viết lại. Trước khi DUYỆT, chạy thử câu viết lại qua luật: luật vẫn chưa hiểu thì
   * không cho duyệt (tránh học một câu vô dụng) — giống cổng chấm điểm trước khi triển khai.
   */
  async learningUpdate(id: string, patch: { status?: 'approved' | 'rejected' | 'suggested'; rewrite?: string }): Promise<LearnedPhraseRow | null> {
    const [row] = await this.dataSource.query(`SELECT kind, phrase, rewrite FROM assistant_learned_phrases WHERE id = $1`, [id]) as LearnedPhrase[];
    if (!row) return null;
    const rewrite = patch.rewrite?.trim() || row.rewrite;
    if (patch.status === 'approved') await this.assertUseful(row.kind, row.phrase, rewrite);
    const intent = row.kind === 'question' ? await this.intentOf(rewrite) : null;
    await this.dataSource.query(
      `UPDATE assistant_learned_phrases SET rewrite = $2, status = COALESCE($3, status), intent = COALESCE($4, intent), updated_at = now() WHERE id = $1`,
      [id, rewrite.slice(0, row.kind === 'answer' ? 1000 : 300), patch.status ?? null, intent]);
    this.learnedCache = null;
    this.publicCache = null;
    this.rewriteCache.clear();
    const [out] = await this.dataSource.query(
      `SELECT id, kind, phrase, rewrite, intent, status, source, hits, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM assistant_learned_phrases WHERE id = $1`, [id]) as LearnedPhraseRow[];
    return out ?? null;
  }

  /** Chủ tiệm tự thêm cụm từ / câu (vd. "mát xoa" → "massage") — được duyệt ngay. */
  async learningAdd(kind: 'question' | 'alias' | 'answer', phrase: string, rewrite: string): Promise<LearnedPhraseRow> {
    const key = fold(phrase).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    const to = kind === 'alias' ? fold(rewrite).trim().slice(0, 300) : rewrite.trim().slice(0, kind === 'answer' ? 1000 : 300);
    await this.assertUseful(kind, key, to);
    const intent = kind === 'question' ? await this.intentOf(to) : null;
    const [row] = await this.dataSource.query(
      `INSERT INTO assistant_learned_phrases (kind, phrase, rewrite, intent, status, source) VALUES ($1, $2, $3, $4, 'approved', 'owner')
       ON CONFLICT (kind, phrase) DO UPDATE SET rewrite = EXCLUDED.rewrite, intent = EXCLUDED.intent, status = 'approved', updated_at = now()
       RETURNING id, kind, phrase, rewrite, intent, status, source, hits, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [kind, key, to, intent]) as LearnedPhraseRow[];
    this.learnedCache = null;
    this.publicCache = null;
    this.rewriteCache.clear();
    return row;
  }

  private async intentOf(text: string): Promise<string> {
    const { catalog, hotIds, facts } = await this.publicData();
    return customerRuleReply(text, catalog, hotIds, facts, new Date(), { today: todaySalon() }).intent;
  }

  private async assertUseful(kind: 'question' | 'alias' | 'answer', phrase: string, rewrite: string): Promise<void> {
    if (phrase.length < 2 || !rewrite.trim()) throw new LearningRejected('Cụm từ và câu viết lại không được để trống.');
    if (kind === 'question' && ['unknown', 'handoff'].includes(await this.intentOf(rewrite))) {
      throw new LearningRejected('Câu viết lại này trợ lý vẫn chưa hiểu — hãy viết rõ hơn (vd. "Ngày mai massage còn giờ trống không?").');
    }
  }

  /** Khách bấm 👍 / 👎 dưới câu trả lời (phân tích lỗi trên dữ liệu thật — Hamel Husain "look at your data"). */
  async customerFeedback(question: string, intent: string, helpful: boolean): Promise<void> {
    this.feedback[helpful ? 'up' : 'down'] += 1;
    if (!helpful) await this.recordGap(question, `dislike:${intent}`.slice(0, 40));
  }

  private readonly feedback = { up: 0, down: 0 };

  /** Báo cáo cải tiến cho chủ tiệm: câu chưa trả lời được + đề xuất học chờ duyệt + phản hồi của khách. */
  async improvementReport(days = 30): Promise<{
    gaps: Awaited<ReturnType<AssistantService['knowledgeGaps']>>; suggestions: LearnedPhraseRow[]; approved: number;
    feedback: { up: number; down: number }; ungroundedBlocked: number;
  }> {
    const [gaps, suggestions, approved] = await Promise.all([
      this.knowledgeGaps(days),
      this.learningList('suggested').catch(() => []),
      this.dataSource.query(`SELECT count(*)::int AS n FROM assistant_learned_phrases WHERE status = 'approved'`)
        .then((r: { n: number }[]) => r[0]?.n ?? 0).catch(() => 0),
    ]);
    return { gaps, suggestions, approved, feedback: { ...this.feedback }, ungroundedBlocked: this.ungroundedBlocked };
  }

  // ------------------------------------------------------------- lỗ hổng kiến thức (câu chưa trả lời được)
  private readonly gaps: GapEntry[] = [];
  /** Số câu trả lời tự do của mô hình bị loại vì khẳng định giờ trống / giá không có trong dữ liệu. */
  private ungroundedBlocked = 0;
  private gapsLoaded = false;

  private get gapFile(): string {
    return process.env.ASSISTANT_GAP_LOG || join(process.cwd(), 'logs', 'assistant-gaps.jsonl');
  }

  /** Ghi câu khách hỏi mà trợ lý chưa trả lời được — đã che SĐT / email / dãy số dài (không lưu dữ liệu cá nhân). */
  private async recordGap(message: string, intent: string): Promise<void> {
    const q = redactPersonal(message).slice(0, 200);
    if (!q.trim()) return;
    const entry: GapEntry = { at: new Date().toISOString(), q, intent };
    this.gaps.push(entry);
    if (this.gaps.length > 2000) this.gaps.splice(0, this.gaps.length - 2000);
    if (process.env.NODE_ENV === 'test') return;
    try {
      await mkdir(join(this.gapFile, '..'), { recursive: true });
      await appendFile(this.gapFile, `${JSON.stringify(entry)}\n`);
    } catch { /* nhật ký không được làm hỏng câu trả lời */ }
  }

  /**
   * Câu trợ lý chưa trả lời được trong `days` ngày, gom theo nội dung (bỏ dấu) — chủ tiệm xem để bổ sung mô tả dịch vụ,
   * chính sách hoặc báo đội kỹ thuật thêm ý định mới (vòng: ghi nhận → bổ sung → kiểm thử lại → triển khai).
   */
  async knowledgeGaps(days = 30): Promise<{ days: number; total: number; items: { question: string; intent: string; count: number; lastAt: string }[] }> {
    if (!this.gapsLoaded && process.env.NODE_ENV !== 'test') {
      this.gapsLoaded = true;
      try {
        const old = (await readFile(this.gapFile, 'utf8')).split('\n').filter(Boolean)
          .map((l) => { try { return JSON.parse(l) as GapEntry; } catch { return null; } }).filter((x): x is GapEntry => !!x);
        this.gaps.unshift(...old.slice(-2000).filter((o) => !this.gaps.some((g) => g.at === o.at && g.q === o.q)));
      } catch { /* chưa có tệp */ }
    }
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const groups = new Map<string, { question: string; intent: string; count: number; lastAt: string }>();
    for (const g of this.gaps.filter((x) => x.at >= since)) {
      const key = fold(g.q).replace(/[^a-z0-9 ]/g, '').trim();
      const cur = groups.get(key);
      if (cur) { cur.count += 1; if (g.at > cur.lastAt) cur.lastAt = g.at; } else groups.set(key, { question: g.q, intent: g.intent, count: 1, lastAt: g.at });
    }
    const items = Array.from(groups.values()).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, 30);
    return { days, total: this.gaps.filter((x) => x.at >= since).length, items };
  }

  /** Số liệu chịu tải của trợ lý (cho /health chi tiết và kiểm thử tải). */
  loadStats(): { llmActive: number; llmQueued: number; cachedAnswers: number; ungroundedBlocked: number } {
    const g = this.gate.stats;
    return { llmActive: g.active, llmQueued: g.queued, cachedAnswers: this.answerCache.size, ungroundedBlocked: this.ungroundedBlocked };
  }
}
