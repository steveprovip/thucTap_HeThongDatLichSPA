import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatVnd } from '../../common/utils/currency.util';
import { addDays, dayOfWeek, endOfDay, startOfDay, todaySalon, toSalon } from '../../common/utils/time.util';
import { StylistsService } from '../stylists/stylists.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { AvailabilityService } from '../booking-engine/availability.service';
import {
  AssistantContext, AssistantIntent, ComboInsight, contextForLlm, detectIntent, DOW_VI, fold, GoldenHour, hourLabel,
  HolidayLite, quickReplies, ruleAnswer, ShiftGapSuggestion, SYSTEM_PROMPT, TodaySnapshot, WorkingStylist,
} from './assistant-rules';
import { findLocalAiDir, isLoopbackUrl, launchLocalAi } from './local-ai-launcher';
import { LlmGate, SingleFlight, TtlCache } from './llm-gate';
import { EventsService } from '../events/events.service';
import {
  CatalogItem, CUSTOMER_SYSTEM_PROMPT, customerContextForLlm, CustomerReply, customerRuleReply, SalonFacts,
  DIRECT_INTENTS, availabilityAnswer, isUnaccented, leadSentence, matchServices, sanitizeLlmAnswer, stripBookingNag,
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

interface PublicData {
  at: number;
  catalog: CatalogItem[];
  hotIds: string[];
  facts: SalonFacts;
  /** serviceId → lượt đặt 90 ngày. */
  popularity: Record<string, number>;
}

export interface CustomerChatResult extends CustomerReply {
  source: 'llm' | 'rules';
  model: string | null;
  /** Ngày vừa tra giờ trống (yyyy-MM-dd) — nút "Đặt" mở phiếu đặt lịch đúng ngày này. */
  bookDate?: string;
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
const STAFF_FACT_INTENTS: ReadonlySet<AssistantIntent> = new Set<AssistantIntent>(['today', 'working_stylists']);
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
      if (['services', 'service-categories', 'stylists', 'working-hours', 'holidays'].includes(e.scope)) {
        this.publicCache = null;
        this.answerCache.clear();
      }
    });
  }

  /** Chịu tải: số câu gọi mô hình cùng lúc / hàng chờ / bộ nhớ đệm câu trả lời (xem llm-gate.ts). */
  private readonly gate: LlmGate;
  private readonly answerCache: TtlCache<{ answer: string; suggestions: CatalogItem[] }>;
  private readonly llmFlight = new SingleFlight<{ answer: string; suggestions: CatalogItem[] } | 'busy' | null>();
  private readonly publicFlight = new SingleFlight<PublicData>();
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

  /** Lịch sử hội thoại gần nhất (tối đa 6 lượt) để mô hình hiểu câu hỏi nối tiếp ("thế còn thứ 7?"). */
  private history(history: ChatTurn[] = []): LlmMessage[] {
    return history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 500) }));
  }

  async chat(message: string, opts: { userName?: string | null; history?: ChatTurn[] } = {}): Promise<AssistantChatResult> {
    const intent = detectIntent(message);
    const [cached, today, workingToday] = await Promise.all([
      this.context(), this.todaySnapshot().catch(() => null), this.workingToday().catch(() => null),
    ]);
    const ctx: AssistantContext = { ...cached, today, workingToday };
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
    const [groups, counts, hours, team] = await Promise.all([
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
    };
    const ids = new Set(catalog.map((x) => x.id));
    const live = counts.filter((h) => ids.has(h.id));
    this.publicCache = {
      at: Date.now(), catalog, facts,
      hotIds: live.slice(0, 8).map((h) => h.id),
      popularity: Object.fromEntries(live.map((h) => [h.id, h.n])),
    };
    return this.publicCache;
  }

  /**
   * TASK v3 · NV1 + QA nhập vai 12/10 — tư vấn khách trên trang công khai. NỘI DUNG luôn lấy từ dữ liệu thật (danh mục, lượt đặt,
   * giờ trống, chính sách); mô hình ngôn ngữ (nếu bật) chỉ lo phần trò chuyện: câu dẫn cho gợi ý, giải thích theo mô tả dịch vụ,
   * chào hỏi và câu tự do. Thẻ dịch vụ luôn trùng với dịch vụ có trong câu trả lời.
   */
  async customerChat(message: string, history: ChatTurn[] = []): Promise<CustomerChatResult> {
    const { catalog, hotIds, facts, popularity } = await this.publicData();
    const today = todaySalon();
    const { pending, ...rule } = customerRuleReply(message, catalog, hotIds, facts, new Date(), { history, popularity, today });
    const direct = (r: CustomerReply = rule): CustomerChatResult => ({ ...r, source: 'rules', model: null });

    // Giờ trống: tra THẬT bằng bộ tính khung giờ của trang đặt lịch (cùng luật ca làm, ngày nghỉ, giữ chỗ, 60 phút đặt trước)
    if (pending?.kind === 'availability') {
      const service = catalog.find((s) => s.id === pending.serviceId);
      try {
        const data = await this.availability.getAvailability({ date: pending.when.date, serviceIds: [pending.serviceId] });
        if (service) return { ...direct({ ...rule, answer: availabilityAnswer(service, pending.when, data, today) }), bookDate: pending.when.date };
      } catch (e) {
        this.logger.warn(`Không tra được giờ trống cho trợ lý: ${(e as Error).message}`);
      }
      return direct();
    }
    // Số liệu / chính sách (đếm, rẻ nhất, hot, giá, thời lượng, ngân sách, giờ mở cửa, cọc, huỷ…) → trả thẳng, không qua mô hình
    if (DIRECT_INTENTS.has(rule.intent)) return direct();
    const cfg = await this.resolveLlm();
    if (!cfg) return direct();

    // Kiểu LAI cho tư vấn nhu cầu / đặt lịch: mô hình chỉ viết 1–2 câu dẫn, danh sách dịch vụ + giá do dữ liệu quyết định
    // (thử thật: mô hình 4B đọc "toc kho xo" thành gợi ý CẮT tóc, kể dịch vụ khác với thẻ gợi ý bên dưới)
    const hybrid = rule.intent === 'need' || rule.intent === 'book';
    // Câu gõ không dấu: mô hình 4B hay đọc sai ("toc kho xo" → "làm tóc kho xo đẹp") → trả bằng dữ liệu, không câu dẫn
    if (hybrid && isUnaccented(message)) return direct();
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
    const ask = async (): Promise<{ answer: string; suggestions: CatalogItem[] } | 'busy' | null> => {
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
        out = { answer: intro ? `${intro}\n${rule.answer.replace(/^Với nhu cầu của bạn, mình gợi ý:/, 'Mình gợi ý:')}` : rule.answer, suggestions: rule.suggestions };
      } else {
        // Thẻ = đúng các dịch vụ mô hình nêu tên trong câu trả lời (theo thứ tự xuất hiện) — chỉ cho câu tự do
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
    if (!res) {
      this.markLlmDown();
      return direct();
    }
    return { ...rule, ...res, source: 'llm', model: cfg.model };
  }

  /** Số liệu chịu tải của trợ lý (cho /health chi tiết và kiểm thử tải). */
  loadStats(): { llmActive: number; llmQueued: number; cachedAnswers: number } {
    const g = this.gate.stats;
    return { llmActive: g.active, llmQueued: g.queued, cachedAnswers: this.answerCache.size };
  }
}
