/**
 * Part 5 — phần "luật" của Trợ lý AI: hàm THUẦN (không DB, không mạng) để kiểm thử đơn vị và để trợ lý vẫn trả lời
 * được khi KHÔNG cấu hình mô hình ngôn ngữ (AI_PROVIDER trống) hoặc mô hình cục bộ (Ollama) đang tắt / quá chậm.
 */

export type AssistantIntent =
  | 'shifts' | 'working_stylists' | 'holidays' | 'golden' | 'combo' | 'today' | 'greeting' | 'identity' | 'help' | 'thanks' | 'bye'
  // QA Sprint 3 · mục 6 — các câu trợ lý từng trả "chưa hiểu": khách dùng nhiều nhất, lịch gần nhất, tiệm nghỉ ngày nào,
  // tiệm có bao nhiêu dịch vụ, báo cáo doanh thu theo kỳ, thợ làm ít / nhiều nhất
  | 'top_customers' | 'next_appointment' | 'closed_days' | 'service_count' | 'revenue' | 'stylist_load'
  | 'general';

/** Số liệu tra cứu theo câu hỏi (tươi mỗi lần hỏi) cho các ý định ở QA Sprint 3 · mục 6. */
export interface StaffFacts {
  topCustomers?: { fullName: string; visits: number; spentText: string }[];
  upcoming?: { fullName: string; whenText: string; services: string; stylist: string; statusLabel: string; minutesUntil: number }[];
  closed?: { weeklyClosed: string[]; upcoming: { reason: string; startDate: string; endDate: string }[] };
  services?: { total: number; byCategory: { name: string; count: number }[]; minPriceText: string; maxPriceText: string };
  revenue?: { label: string; totalText: string; invoices: number; avgText: string; changePct: number | null; bestDay: string | null };
  stylistLoad?: { label: string; order: 'asc' | 'desc'; rows: { fullName: string; done: number; minutes: number }[] };
}

/** TASK v4 · NV1 — số liệu TỔNG HỢP của hôm nay (không tên / SĐT khách) cho câu "tình hình hôm nay thế nào?". */
export interface TodaySnapshot {
  date: string;
  dayText: string;
  total: number;
  byStatus: Record<string, number>;
  /** Doanh thu đã thu hôm nay (phiếu đã đóng). */
  revenue: number;
  revenueText: string;
  /** Lịch online chờ xác nhận (mọi ngày) và số lịch đã chờ quá 12 giờ. */
  pendingTotal: number;
  pendingOverdue: number;
}

/** QA 12/10 — thợ có ca hôm nay (tên NHÂN SỰ, không phải dữ liệu khách) cho câu "đang có thợ nào làm việc?". */
export interface WorkingStylist {
  fullName: string;
  /** Các ca trong ngày, ví dụ "09:00–18:00 (nghỉ 12:00–13:00)". */
  shiftsText: string;
  /** Đang trong giờ ca (không tính giờ nghỉ giữa ca / giờ xin nghỉ). */
  onShiftNow: boolean;
  /** Đang phục vụ khách (lịch đang làm hoặc lịch đã xác nhận trùng giờ hiện tại). */
  busyNow: boolean;
  /** Giờ xin nghỉ đã duyệt trong ngày, ví dụ "cả ngày" / "14:00–16:00". */
  timeOff: string | null;
}

export interface GoldenHour { dow: number; dayLabel: string; hour: number; label: string; bookings: number }
export interface ComboInsight { names: string[]; count: number; totalDuration: number; totalPrice: number; priceText: string }
export interface ShiftGapSuggestion {
  date: string; dayText: string; startTime: string; endTime: string; minCount: number; hint: string | null;
  candidates: { stylistId: string; fullName: string; weekMinutes: number }[];
}
export interface HolidayLite { name: string; startDate: string; endDate: string; days: number; status: string }

export interface AssistantContext {
  goldenHours: GoldenHour[];
  quietHours: GoldenHour[];
  combos: ComboInsight[];
  topServices: { name: string; count: number }[];
  gaps: ShiftGapSuggestion[];
  holidays: HolidayLite[];
  today?: TodaySnapshot | null;
  /** Thợ có ca hôm nay; null = chưa đọc được bảng ca, undefined = không nạp. */
  workingToday?: WorkingStylist[] | null;
  /** Số liệu tra cứu riêng cho câu đang hỏi (top khách, doanh thu theo kỳ…); undefined = không nạp. */
  facts?: StaffFacts | null;
}

export interface Period { from: string; to: string; label: string }

const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Kỳ báo cáo trong câu hỏi: hôm qua / tuần này / tuần trước / tháng này / tháng trước / N ngày qua (mặc định 7 ngày qua). */
export function parsePeriod(message: string, today: string): Period {
  const m = fold(message);
  const span = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)}–${fmtDate(b)}`);
  const monday = shiftDay(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  if (/hom qua/.test(m)) { const d = shiftDay(today, -1); return { from: d, to: d, label: `hôm qua (${fmtDate(d)})` }; }
  if (/hom nay/.test(m)) return { from: today, to: today, label: `hôm nay (${fmtDate(today)})` };
  if (/tuan (vua roi|vua qua|truoc|roi|qua)/.test(m)) {
    const from = shiftDay(monday, -7);
    const to = shiftDay(monday, -1);
    return { from, to, label: `tuần trước (${span(from, to)})` };
  }
  if (/tuan nay/.test(m)) return { from: monday, to: today, label: `tuần này (${span(monday, today)})` };
  if (/thang (vua roi|vua qua|truoc|roi)/.test(m)) {
    const to = shiftDay(`${today.slice(0, 8)}01`, -1);
    const from = `${to.slice(0, 8)}01`;
    return { from, to, label: `tháng ${Number(to.slice(5, 7))}/${to.slice(0, 4)}` };
  }
  if (/thang nay/.test(m)) { const from = `${today.slice(0, 8)}01`; return { from, to: today, label: `tháng này (${span(from, today)})` }; }
  const n = m.match(/(\d{1,3}) ngay (qua|gan day|vua roi|truoc)/);
  const k = n ? Math.min(366, Math.max(1, Number(n[1]))) : 7;
  const from = shiftDay(today, -(k - 1));
  return { from, to: today, label: `${k} ngày qua (${span(from, today)})` };
}

/** "liệt kê 5 khách…", "top 10 khách" → 5 / 10 (mặc định 5, tối đa 20). */
export function topN(message: string): number {
  const m = fold(message).match(/(\d{1,2})\s*(?:khach|nguoi|vi khach)/);
  return Math.min(20, Math.max(1, m ? Number(m[1]) : 5));
}

export const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Buổi trong ngày theo giờ tiệm (Asia/Ho_Chi_Minh) — để lời chào tự nhiên như người thật. */
export function partOfDay(now: Date): 'sáng' | 'trưa' | 'chiều' | 'tối' {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(now)) % 24;
  if (h >= 4 && h < 11) return 'sáng';
  if (h >= 11 && h < 13) return 'trưa';
  if (h >= 13 && h < 18) return 'chiều';
  return 'tối';
}

export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
    .replace(/\s+/g, ' ').trim();

export type SmallTalkIntent = 'greeting' | 'identity' | 'help' | 'thanks' | 'bye';

/**
 * Câu xã giao chung cho cả trợ lý nhân sự lẫn trợ lý khách (TASK v3 · NV1, mở rộng TASK v4 · NV1): "bạn là ai",
 * "bạn giúp được gì", "hướng dẫn tôi", "chào bạn", "alo", "khỏe không", "cảm ơn", "tạm biệt"… luôn được đáp như người thật.
 */
export const SMALL_TALK: { intent: SmallTalkIntent; re: RegExp }[] = [
  { intent: 'identity', re: /(ban la ai|may la ai|em la ai|ai (dang )?(tra loi|nhan tin)|ban ten (la )?gi|ten (cua )?ban|ban (lam|giup) (duoc )?(nhung )?gi|ban co the (lam|giup) (duoc )?gi|chuc nang|tro ly (nay )?(la )?gi|la bot|robot|nguoi that|la nguoi hay)/ },
  { intent: 'help', re: /(huong dan|chi (cho )?(toi|minh|em|tui|anh|chi)|giup (toi|minh|em|tui|voi|anh|chi)|tro giup|lam sao|lam the nao|cach (dung|su dung|lam)|dung (the nao|ra sao)|bat dau tu dau|\bhelp\b)/ },
  { intent: 'bye', re: /(tam biet|\bbye\b|bai bai|hen gap lai|chao tam biet|nghi day|out day)/ },
  { intent: 'thanks', re: /^(ok+|oke|okay|cam on|cam ta|thanks?|thank you|tks|tuyet voi|hay qua|duoc roi|ngon|great)\b/ },
  { intent: 'greeting', re: /^(alo+|a lo|a lô|hello|helo|hi+|hey|chao|xin chao|chao ban|chao em|chao shop|e oi|em oi|shop oi|ad oi|ban oi|good (morning|afternoon|evening))\b|(khoe khong|co ai (o day|khong)|co do khong)/ },
];

export function smallTalkIntent(message: string): SmallTalkIntent | null {
  const m = fold(message);
  for (const t of SMALL_TALK) if (t.re.test(m)) return t.intent;
  return null;
}

/** QA 12/10 — câu hỏi nhân sự đang trực: "Đang có thợ nào làm việc vậy?", "Ai đang rảnh?", "Hôm nay ai đi làm?"… */
const WORKING_RE = new RegExp([
  'tho nao', 'ai dang (lam|truc|ranh|o tiem|co mat)', 'tho (dang )?truc', 'dang truc', 'ai lam viec', 'ai (di )?lam (hom nay|bua nay)',
  'danh sach tho', 'co ai (dang )?lam', 'ai (dang |con )?ranh', 'tho (dang |con )?ranh', 'tho dang lam', 'co (may|bao nhieu) tho',
  'nhan vien (nao|dang (lam|truc))', 'hom nay ai', 'ai di lam', 'tho (lam|di lam) hom nay', 'tho hom nay',
].map((p) => `(${p})`).join('|'));

const STYLIST_LOAD_RE = new RegExp([
  '(tho|nhan vien|ky thuat vien|ai) (nao )?(da )?(lam (viec )?|phuc vu |nhan )?(it|nhieu|ranh|ban|cham chi) (viec |khach |lich )?nhat',
  '(it|nhieu) (viec|khach|lich|luot) nhat', 'nang suat (cua )?(tho|nhan vien)', 'hieu suat (cua )?(tho|nhan vien)', 'xep hang (tho|nhan vien)',
  'tho (lam|phuc vu) (duoc )?(bao nhieu|may) (khach|luot|lich)', 'khoi luong (cong )?viec (cua )?tho',
].map((p) => `(${p})`).join('|'));
const TOP_CUSTOMERS_RE = /(khach( hang)?\b[a-z0-9 ]*(nhieu nhat|thuong xuyen( nhat)?|than thiet|vip|ruot|trung thanh|quay lai nhieu))|((top|liet ke) ?\d* ?(khach|vi khach))/;
const NEXT_APPT_RE = /((lich( hen)?|khach|cuoc hen)\b[a-z0-9 ]*(gan nhat|sap toi|tiep theo|ke tiep|sap den))|((ai|khach nao) (se )?(den|toi) (tiep|ke tiep|sau))/;
const CLOSED_DAYS_RE = /((tiem|cua hang|salon|spa|shop) (se |co )?(nghi|dong cua|off))|ngay nghi|nghi (vao )?(ngay|thu) (nao|may)|dong cua (vao )?(ngay|thu|khi) nao|khi nao (tiem )?nghi|lich nghi/;
const SERVICE_COUNT_RE = /((bao nhieu|may|so luong|tong so|tong cong) (loai )?(dich vu|dv))|((dich vu|dv) (co )?(bao nhieu|may))|danh sach dich vu|(nhung|cac) dich vu (nao|gi)|bang gia/;
const REVENUE_RE = /(doanh thu|doanh so|thu duoc|tien thu|bao cao (tai chinh|thu chi|ban hang|kinh doanh)|kiem duoc)/;

/** Nhận diện ý định từ câu hỏi tiếng Việt (có hoặc không dấu). Chủ đề nghiệp vụ thắng câu xã giao ("chào, tuần này thiếu thợ không?"). */
export function detectIntent(message: string): AssistantIntent {
  const m = fold(message);
  // "thiếu thợ ca nào" là câu XẾP CA → xét trước câu "thợ nào đang làm" để "thieu tho nao" không bị hiểu nhầm
  if (/(thieu tho|thieu nguoi|xep ca|phan ca|do phu)/.test(m)) return 'shifts';
  // "thợ nào làm ít nhất tuần vừa rồi" phải xét TRƯỚC câu "thợ nào đang làm"
  if (STYLIST_LOAD_RE.test(m)) return 'stylist_load';
  if (TOP_CUSTOMERS_RE.test(m)) return 'top_customers';
  if (NEXT_APPT_RE.test(m) && !/(nghi|dong cua|\ble\b)/.test(m)) return 'next_appointment';
  if (WORKING_RE.test(m)) return 'working_stylists';
  if (/(ca lam|lich lam|ca truc)/.test(m)) return 'shifts';
  if (/(nghi le|ngay le|\ble\b|tet|quoc khanh|30\/4|2\/9|gio to)/.test(m)) return 'holidays';
  if (CLOSED_DAYS_RE.test(m)) return 'closed_days';
  if (SERVICE_COUNT_RE.test(m)) return 'service_count';
  if (/(combo|goi dich vu|ban kem|lam them|dich vu kem|up ?sell|goi y dich vu)/.test(m)) return 'combo';
  if (/(gio vang|cao diem|dong khach|gio nao|khung gio|vang khach|thap diem|gio dep|gio vang)/.test(m)) return 'golden';
  if (/(tinh hinh|tong quan|bao nhieu lich|lich (hen )?hom nay|hom nay (co )?(bao nhieu|may)|doanh thu hom nay|hom nay (the nao|ra sao|sao roi)|cho xac nhan)/.test(m)) return 'today';
  if (REVENUE_RE.test(m)) return 'revenue';
  return smallTalkIntent(message) ?? 'general';
}

/** Gợi ý câu hỏi tiếp theo (nút bấm nhanh) theo ngữ cảnh vừa trả lời. */
export function quickReplies(intent: AssistantIntent): string[] {
  const all: Record<string, string> = {
    today: 'Tình hình hôm nay thế nào?', working_stylists: 'Đang có thợ nào làm việc?', golden: 'Giờ vàng tuần này?',
    revenue: 'Doanh thu tuần trước?', top_customers: 'Top 5 khách thân thiết', next_appointment: 'Lịch hẹn sắp tới?',
    shifts: '7 ngày tới thiếu thợ ca nào?',
    combo: 'Gợi ý combo cho khách', holidays: 'Ngày lễ sắp tới?',
  };
  return Object.entries(all).filter(([k]) => k !== intent).map(([, v]) => v).slice(0, 3);
}

export const hourLabel = (dow: number, hour: number): string =>
  `${DOW_VI[dow]} ${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;

const fmtDate = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const firstName = (full?: string | null): string => (full ?? '').trim().split(/\s+/).pop() ?? '';

/**
 * Câu trả lời khi không có (hoặc lỗi) mô hình ngôn ngữ — bộ quản lý hội thoại theo luật: hiểu chào hỏi, hỏi "bạn là ai",
 * xin hướng dẫn, cảm ơn; câu nghiệp vụ trả lời bằng số liệu thật; câu chưa hiểu thì hỏi lại thay vì đổ số liệu.
 */
export function ruleAnswer(
  intent: AssistantIntent, ctx: AssistantContext, opts: { userName?: string | null; now?: Date } = {},
): string {
  const name = firstName(opts.userName);
  switch (intent) {
    case 'greeting': {
      const wish = opts.now ? ` Chúc bạn buổi ${partOfDay(opts.now)} làm việc thật suôn sẻ.` : '';
      const pending = ctx.today?.pendingTotal ? ` Hiện có ${ctx.today.pendingTotal} lịch online đang chờ xác nhận.` : '';
      const alert = ctx.gaps.length ? ` Tuần này có ${ctx.gaps.length} khung giờ thiếu thợ, bạn muốn xem không?` : '';
      return `Chào ${name || 'bạn'}!${wish} Mình là trợ lý vận hành của tiệm, luôn sẵn sàng hỗ trợ bạn.${pending}${alert}`
        + ' Bạn cần mình giúp gì: tình hình hôm nay, giờ vàng, combo dịch vụ, xếp ca hay ngày lễ?';
    }
    case 'identity':
      return 'Mình là Trợ lý vận hành của tiệm — một trợ lý ảo đọc số liệu lịch hẹn thật để giúp bạn:\n'
        + '• Nắm nhanh tình hình hôm nay: số lịch, lịch chờ xác nhận, doanh thu đã thu\n'
        + '• Cho biết thợ nào có ca hôm nay, ai đang làm khách, ai đang rảnh\n'
        + '• Tư vấn khung giờ vàng / giờ vắng khi khách gọi đặt lịch\n• Gợi ý combo dịch vụ khách hay đặt cùng\n'
        + '• Phát hiện khung giờ thiếu thợ và gợi ý ai nên xếp\n• Sinh ngày lễ trong năm để thêm vào lịch nghỉ\n'
        + 'Mình không xem được thông tin cá nhân của khách. Cứ hỏi tự nhiên như nói chuyện với đồng nghiệp nhé!';
    case 'help':
      return 'Mình hướng dẫn nhanh nhé:\n'
        + '1. Lịch ngày: xem lịch từng thợ theo lưới 15 phút, bấm vào lịch để xác nhận / check-in / hoàn tất.\n'
        + '2. Chờ xác nhận: xử lý lịch khách đặt online (lịch chờ quá 12 giờ luôn nằm đầu danh sách).\n'
        + '3. Khách vãng lai: tạo lịch cho khách gọi điện hoặc ghé thẳng tiệm.\n'
        + '4. Bảng ca làm: bấm ô trống để thêm ca sáng / chiều / cả ngày chỉ một chạm.\n'
        + 'Bạn có thể hỏi tự nhiên, ví dụ: "Hôm nay có bao nhiêu lịch?", "Đang có thợ nào làm việc?", "Khách muốn cắt tóc chiều thứ 7, giờ nào đẹp?", '
        + '"Tuần sau thiếu thợ ca nào?". Hoặc chuyển sang chế độ "Phân tích & số liệu" để xem bảng tổng hợp.';
    case 'thanks':
      return `Không có gì${name ? ` ${name}` : ''}! Rất vui được giúp bạn — cần gì cứ hỏi mình nhé.`;
    case 'bye':
      return `Tạm biệt${name ? ` ${name}` : ''}! Chúc bạn một ca làm việc thật suôn sẻ, cần gì cứ gọi mình nhé.`;
    case 'today': {
      const t = ctx.today;
      if (!t) return 'Mình chưa đọc được số liệu hôm nay, bạn mở mục "Lịch ngày" để xem trực tiếp nhé.';
      const label: Record<string, string> = {
        pending: 'chờ xác nhận', confirmed: 'đã xác nhận', arrived: 'đã đến', in_progress: 'đang làm', completed: 'hoàn tất',
        cancelled: 'đã huỷ', no_show: 'không đến',
      };
      const parts = Object.entries(t.byStatus).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${label[k] ?? k}`);
      const pending = t.pendingTotal
        ? `\nCòn ${t.pendingTotal} lịch online chờ xác nhận${t.pendingOverdue ? ` (${t.pendingOverdue} lịch đã chờ quá 12 giờ)` : ''} — mở mục "Chờ xác nhận" để xử lý.`
        : '\nKhông còn lịch online nào chờ xác nhận.';
      return t.total
        ? `Hôm nay (${t.dayText}) tiệm có ${t.total} lịch hẹn: ${parts.join(', ')}. Doanh thu đã thu: ${t.revenueText}.${pending}`
        : `Hôm nay (${t.dayText}) chưa có lịch hẹn nào.${pending}`;
    }
    case 'working_stylists': {
      const w = ctx.workingToday;
      if (!w) return 'Mình chưa đọc được bảng ca hôm nay, bạn mở mục "Bảng ca làm" để xem trực tiếp nhé.';
      if (!w.length) {
        return 'Hôm nay chưa có thợ nào được xếp ca. Mở "Bảng ca làm" để thêm ca hoặc duyệt yêu cầu đăng ký ca của thợ nhé.';
      }
      const onShift = w.filter((x) => x.onShiftNow);
      const free = onShift.filter((x) => !x.busyNow);
      const lines = w.slice(0, 12).map((x) => {
        const state = x.onShiftNow ? (x.busyNow ? ' — đang làm khách' : ' — đang rảnh') : '';
        return `• ${x.fullName}: ${x.shiftsText}${x.timeOff ? ` · xin nghỉ ${x.timeOff}` : ''}${state}`;
      });
      const now = onShift.length
        ? `Lúc này ${onShift.length} thợ đang trong ca${free.length ? `, đang rảnh: ${free.map((x) => x.fullName).join(', ')}` : ', tất cả đều đang làm khách'}.`
        : 'Lúc này chưa có thợ nào trong giờ ca.';
      return `Hôm nay có ${w.length} thợ có ca làm:\n${lines.join('\n')}${w.length > 12 ? '\n…' : ''}\n${now}`;
    }
    case 'shifts': {
      if (!ctx.gaps.length) return 'Tuần tới mọi khung giờ mở cửa đều đủ thợ trực. Không cần xếp thêm ca.';
      const lines = ctx.gaps.slice(0, 5).map((g) => {
        const who = g.candidates[0] ? ` → gợi ý xếp ${g.candidates[0].fullName} (đang ${Math.round(g.candidates[0].weekMinutes / 60)}h/tuần)` : '';
        return `• ${g.dayText} ${g.startTime}–${g.endTime}: ${g.minCount === 0 ? 'KHÔNG có thợ' : `chỉ ${g.minCount} thợ`}${who}`;
      });
      return `Có ${ctx.gaps.length} khung giờ thiếu thợ trong 7 ngày tới:\n${lines.join('\n')}\nMở tab "Ca thiếu thợ" để xếp bằng một chạm.`;
    }
    case 'holidays': {
      const ready = ctx.holidays.filter((h) => h.status === 'ready');
      if (!ctx.holidays.length) return 'Chưa tải được danh sách ngày lễ năm nay.';
      if (!ready.length) return 'Các ngày lễ còn lại trong năm đã được thêm vào lịch nghỉ của tiệm.';
      return `Còn ${ready.length} ngày lễ chưa đưa vào lịch nghỉ: ${ready.slice(0, 4).map((h) => `${h.name} (${fmtDate(h.startDate)}${h.days > 1 ? `–${fmtDate(h.endDate)}` : ''})`).join(', ')}`
        + `${ready.length > 4 ? '…' : ''}. Mở tab "Ngày lễ" để thêm tất cả bằng một chạm.`;
    }
    case 'combo': {
      if (!ctx.combos.length) {
        const top = ctx.topServices.slice(0, 3).map((s) => s.name).join(', ');
        return top ? `Chưa đủ dữ liệu combo. Dịch vụ được đặt nhiều nhất: ${top} — có thể mời khách thêm dịch vụ chăm sóc đi kèm.`
          : 'Chưa đủ dữ liệu lịch hẹn để gợi ý combo.';
      }
      return `Combo khách hay đặt cùng nhau:\n${ctx.combos.slice(0, 3).map((c) =>
        `• ${c.names.join(' + ')} — ${c.count} lượt, ${c.totalDuration} phút, ${c.priceText}`).join('\n')}\nKhi khách gọi đặt dịch vụ đầu, gợi ý thêm dịch vụ còn lại của combo.`;
    }
    case 'golden': {
      if (!ctx.goldenHours.length) return 'Chưa đủ dữ liệu lịch hẹn 90 ngày để xác định giờ vàng.';
      const gold = ctx.goldenHours.slice(0, 3).map((g) => g.label).join(', ');
      const quiet = ctx.quietHours.slice(0, 3).map((g) => g.label).join(', ');
      return `Giờ vàng (đông khách nhất 90 ngày qua): ${gold}. Khách linh hoạt giờ giấc nên mời sang giờ vắng: ${quiet || 'chưa xác định'}`
        + ' — giữ giờ vàng cho khách chỉ rảnh khung đó.';
    }
    case 'top_customers': {
      const rows = ctx.facts?.topCustomers;
      if (!rows) return 'Mình chưa đọc được dữ liệu khách, bạn mở mục "Hồ sơ khách" để xem trực tiếp nhé.';
      if (!rows.length) return 'Chưa có khách nào hoàn tất dịch vụ để xếp hạng.';
      return `Top ${rows.length} khách dùng dịch vụ nhiều nhất (tính lượt đã hoàn tất):\n`
        + rows.map((r, i) => `${i + 1}. ${r.fullName} — ${r.visits} lượt · đã chi ${r.spentText}`).join('\n')
        + '\nMở "Hồ sơ khách" để xem lịch sử & ghi chú kỹ thuật của từng khách.';
    }
    case 'next_appointment': {
      const rows = ctx.facts?.upcoming;
      if (!rows) return 'Mình chưa đọc được lịch hẹn, bạn mở mục "Lịch ngày" để xem trực tiếp nhé.';
      if (!rows.length) return 'Từ giờ trở đi chưa có lịch hẹn nào đang chờ khách đến.';
      const mins = (n: number) => (n < 60 ? `${n} phút` : `${Math.floor(n / 60)} giờ${n % 60 ? ` ${n % 60} phút` : ''}`);
      return `Lịch hẹn gần nhất tính từ bây giờ:\n${rows.map((r) =>
        `• ${r.whenText} — ${r.fullName} (${r.services}) · thợ ${r.stylist} · ${r.statusLabel} · còn ${mins(r.minutesUntil)}`).join('\n')}`;
    }
    case 'closed_days': {
      const c = ctx.facts?.closed;
      if (!c) return 'Mình chưa đọc được lịch mở cửa, bạn mở "Giờ mở cửa & ngày nghỉ" để xem nhé.';
      const weekly = c.weeklyClosed.length ? `Tiệm nghỉ cố định hằng tuần: ${c.weeklyClosed.join(', ')}.` : 'Tiệm mở cửa tất cả các ngày trong tuần.';
      const next = c.upcoming.length
        ? ` Ngày nghỉ sắp tới: ${c.upcoming.slice(0, 5).map((h) => `${h.reason} (${fmtDate(h.startDate)}${h.endDate !== h.startDate ? `–${fmtDate(h.endDate)}` : ''})`).join(', ')}.`
        : ' Chưa khai báo ngày nghỉ đột xuất / nghỉ lễ nào sắp tới.';
      const ready = ctx.holidays.filter((h) => h.status === 'ready');
      const hint = ready.length ? ` Còn ${ready.length} ngày lễ chưa đưa vào lịch nghỉ (gần nhất: ${ready[0].name} ${fmtDate(ready[0].startDate)}) — mở tab "Ngày lễ" để thêm.` : '';
      return weekly + next + hint;
    }
    case 'service_count': {
      const sv = ctx.facts?.services;
      if (!sv) return 'Mình chưa đọc được danh mục dịch vụ, bạn mở "Dịch vụ & bảng giá" nhé.';
      return `Tiệm đang kinh doanh ${sv.total} dịch vụ trong ${sv.byCategory.length} nhóm: `
        + `${sv.byCategory.map((g) => `${g.name} (${g.count})`).join(', ')}. Giá từ ${sv.minPriceText} đến ${sv.maxPriceText}.`;
    }
    case 'revenue': {
      const r = ctx.facts?.revenue;
      if (!r) return 'Mình chưa đọc được số liệu doanh thu, bạn mở mục "Doanh thu" để xem nhé.';
      if (!r.invoices) return `Doanh thu ${r.label}: chưa có phiếu nào được đóng.`;
      const change = r.changePct === null ? '' : ` So với kỳ liền trước: ${r.changePct >= 0 ? '+' : ''}${r.changePct}%.`;
      return `Doanh thu ${r.label}: ${r.totalText} từ ${r.invoices} phiếu đã đóng (trung bình ${r.avgText}/phiếu).${change}`
        + `${r.bestDay ? ` Ngày cao nhất: ${r.bestDay}.` : ''} Mở mục "Doanh thu" để xem theo thợ / dịch vụ.`;
    }
    case 'stylist_load': {
      const l = ctx.facts?.stylistLoad;
      if (!l) return 'Mình chưa đọc được số liệu của thợ, bạn mở mục "Doanh thu" (theo thợ) nhé.';
      if (!l.rows.length) return 'Chưa có thợ nào đang hoạt động.';
      const hm = (n: number) => `${Math.floor(n / 60)}h${n % 60 ? String(n % 60).padStart(2, '0') : ''}`;
      return `Thợ ${l.order === 'asc' ? 'ít việc nhất' : 'nhiều việc nhất'} ${l.label} (theo lượt đã hoàn tất):\n`
        + l.rows.slice(0, 5).map((r) => `• ${r.fullName}: ${r.done} lượt · ${hm(r.minutes)} phục vụ`).join('\n')
        + (l.order === 'asc' ? '\nCó thể ưu tiên xếp khách vãng lai / ca thiếu thợ cho các bạn này để cân bằng tải.' : '');
    }
    default:
      return 'Mình chưa chắc đã hiểu đúng ý bạn 😊 Mình trả lời tốt nhất các câu về tình hình hôm nay, thợ đang trực, doanh thu theo tuần / tháng,'
        + ' khách thân thiết, lịch hẹn sắp tới, ngày tiệm nghỉ, số dịch vụ, giờ vàng, combo, ca thiếu thợ và ngày lễ — bạn thử hỏi lại, hoặc bấm gợi ý bên dưới nhé.';
  }
}

/** Ngữ cảnh gửi cho mô hình ngôn ngữ — CHỈ số liệu tổng hợp, không có tên / SĐT / email khách (bảo mật dữ liệu). */
export function contextForLlm(ctx: AssistantContext): string {
  const t = ctx.today;
  return [
    ...(t ? [`Hôm nay ${t.dayText}: ${t.total} lịch (${Object.entries(t.byStatus).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'chưa có'}), `
      + `đã thu ${t.revenueText}, chờ xác nhận ${t.pendingTotal} (quá 12 giờ ${t.pendingOverdue})`] : []),
    ...(ctx.workingToday === undefined ? [] : [`Thợ có ca hôm nay: ${ctx.workingToday === null ? 'chưa đọc được bảng ca'
      : ctx.workingToday.map((x) => `${x.fullName} ${x.shiftsText}${x.timeOff ? ` (xin nghỉ ${x.timeOff})` : ''}`
        + `${x.onShiftNow ? (x.busyNow ? ' — đang làm khách' : ' — đang rảnh') : ''}`).join('; ') || 'chưa có ai được xếp ca'}`]),
    `Giờ vàng: ${ctx.goldenHours.map((g) => `${g.label} (${g.bookings} lượt)`).join('; ') || 'chưa có'}`,
    `Giờ vắng: ${ctx.quietHours.map((g) => g.label).join('; ') || 'chưa có'}`,
    `Combo hay đặt cùng: ${ctx.combos.map((c) => `${c.names.join(' + ')} (${c.count} lượt, ${c.totalDuration}′, ${c.priceText})`).join('; ') || 'chưa có'}`,
    `Dịch vụ phổ biến: ${ctx.topServices.map((s) => `${s.name} (${s.count})`).join('; ') || 'chưa có'}`,
    `Khung thiếu thợ 7 ngày tới: ${ctx.gaps.slice(0, 8).map((g) => `${g.dayText} ${g.startTime}–${g.endTime}${g.candidates[0] ? ` gợi ý ${g.candidates[0].fullName}` : ''}`).join('; ') || 'không có'}`,
    `Ngày lễ chưa thêm: ${ctx.holidays.filter((h) => h.status === 'ready').map((h) => `${h.name} ${h.startDate}`).join('; ') || 'không có'}`,
  ].join('\n');
}

export const SYSTEM_PROMPT = 'Bạn là trợ lý vận hành thân thiện của một tiệm salon/spa Việt Nam, trò chuyện với lễ tân và chủ tiệm. '
  + 'Xưng "mình", gọi người dùng là "bạn", lịch sự và ấm áp. Trả lời tự nhiên như đồng nghiệp: chào hỏi thì chào lại, hỏi bạn là ai '
  + 'thì giới thiệu ngắn, xin hướng dẫn thì chỉ từng bước; KHÔNG đưa bảng số liệu khi người dùng chỉ chào hỏi. Với câu nghiệp vụ, CHỈ dùng số liệu '
  + 'trong phần DỮ LIỆU, không bịa. Tiếng Việt, ngắn gọn (tối đa 6 dòng), có hành động cụ thể. '
  + 'Không hứa giờ trống cụ thể — nhắc lễ tân kiểm tra trên màn hình đặt lịch. '
  + 'Viết văn bản thuần: KHÔNG dùng markdown (**, #, bảng) và KHÔNG tự tạo nút / liên kết kiểu [Mở lịch ngày].';
