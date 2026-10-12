/**
 * TASK v3 · NV1 — "AI tư vấn khách" trên trang công khai: hàm THUẦN để kiểm thử và để trợ lý vẫn tư vấn được khi chưa
 * cấu hình mô hình ngôn ngữ. Chỉ dùng DANH MỤC CÔNG KHAI (tên, thời lượng, giá) + giờ mở cửa + hotline — không có dữ liệu
 * cá nhân nào. Câu trả lời luôn kèm dịch vụ gợi ý để khách bấm một chạm điền vào wizard đặt lịch.
 */
import { fold, partOfDay, smallTalkIntent } from './assistant-rules';
import { formatVnd } from '../../common/utils/currency.util';
import {
  AVAILABILITY_RE, BudgetQuery, DayPart, PART_LABEL, PART_RANGE, parseBudget, parseWhen, plusDays, WhenQuery,
} from './customer-intent-parsers';

export interface CatalogItem {
  id: string;
  name: string;
  categoryName: string;
  durationMinutes: number;
  price: number;
  priceText: string;
  description: string | null;
  /** TASK v4: ảnh riêng của dịch vụ để thẻ gợi ý trong khung chat có hình. */
  imageUrl?: string | null;
}

export interface SalonFacts {
  name: string;
  hotline: string;
  address: string;
  openingHours: { dayLabel: string; isClosed: boolean; openTime: string; closeTime: string }[];
  /** Khách tự huỷ trên trang tra cứu khi còn ít nhất ngần này phút trước giờ hẹn (CANCEL_CUTOFF_MINUTES). */
  cancelCutoffMinutes?: number;
  /** Một SĐT giữ tối đa ngần này lịch chưa hoàn tất (MAX_ACTIVE_BOOKINGS_PER_PHONE). */
  maxActiveBookingsPerPhone?: number;
  /** Thợ đang làm việc (tên / giới tính vốn công khai ở bước chọn thợ). */
  stylists?: { total: number; female: number; male: number };
  /** Ngày nghỉ toàn tiệm sắp tới (yyyy-MM-dd) — "bây giờ còn mở cửa không", giờ mở cửa theo ngày. */
  holidays?: { startDate: string; endDate: string; reason: string }[];
  /** Danh sách thợ đang làm việc (tên / giới tính / dịch vụ làm được — vốn công khai ở bước "Chọn thợ"). */
  team?: { id: string; name: string; gender: string | null; serviceIds: string[] }[];
  /** Chương trình giảm giá ĐANG chạy (không gồm mã: mã do lễ tân áp khi thanh toán, không phát công khai qua chat). */
  promotions?: { description: string | null; type: 'percent' | 'amount'; value: number; minOrder: number | null; endDate: string }[];
}

/**
 * Câu / cụm từ trợ lý ĐÃ HỌC (chủ tiệm duyệt từ đề xuất tự động): `question` = cả câu khách gõ → câu viết lại rõ nghĩa;
 * `alias` = cụm từ khách hay gõ (sai chính tả, tiếng lóng) → cụm chuẩn. Đều ở dạng bỏ dấu, chữ thường.
 */
export interface LearnedPhrase { kind: 'question' | 'alias' | 'answer'; phrase: string; rewrite: string }

/**
 * Câu trả lời CHỦ TIỆM SOẠN cho câu hỏi ngoài dữ liệu ("chỗ để xe", "có wifi không") — kiểu "snippets" của Intercom Fin.
 * Khớp khi MỌI từ có nghĩa của câu mẫu đều có trong câu khách (bỏ dấu); nhiều mẫu khớp thì lấy mẫu nhiều từ nhất.
 */
export function ownerAnswer(message: string, learned: LearnedPhrase[] = []): string | null {
  const words = new Set(fold(message).split(/[^a-z0-9]+/).filter(Boolean));
  let best: { n: number; text: string } | null = null;
  for (const a of learned) {
    if (a.kind !== 'answer') continue;
    const need = a.phrase.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
    if (need.length && need.every((t) => words.has(t)) && (!best || need.length > best.n)) best = { n: need.length, text: a.rewrite };
  }
  return best?.text ?? null;
}

/** Lỗi gõ / cách viết hay gặp (dạng bỏ dấu) → từ chuẩn. Thử thật 12/10: "mát xoa" không được hiểu. */
const TYPOS: [RegExp, string][] = [
  [/\b(mat|mac|mas) ?-? ?(xoa|xa|xage|sage)\b|\bmas+a?ge?\b|\bmassa\b|\bmatxa\b|\bmatxoa\b/g, 'massage'],
  [/\b(make ?up|makeup|trang diem)\b/g, 'trang diem'],
  [/\b(nai|neo|nal)\b(?= (tay|chan|gel|mong))/g, 'nail'],
  [/\bca(c)? tho\b/g, 'cac tho'],
  // Tiếng lóng / viết tắt khi nhắn tin (thử thật 12/10: "bn tiền gội đầu z", "có ai rảnh làm nail k")
  [/\bbn\b/g, 'bao nhieu'], [/(?<!\d ?)\b(k|ko|kh|khg|hok|hem|hk)\b/g, 'khong'], [/\b(dc|dk|đc)\b/g, 'duoc'],
  [/\bj\b/g, 'gi'], [/\bmay ?h\b/g, 'may gio'], [/\bbao (nhiu|nheu|nhieuu)\b/g, 'bao nhieu'], [/\b(dich du|dic vu|dv)\b/g, 'dich vu'],
  // Gõ không dấu "mun" = muốn hay mụn? Theo từ đứng cạnh: "tui mun đi spa" (muốn) ≠ "bị mụn", "da mụn", "trị mụn"
  [/\b(tui|toi|minh|em|e|anh|chi|ban|t|m) mun\b/g, '$1 muon'], [/\bmun (di|lam|dat|hoi|cat|goi|nhuom|uon|duoi|xem|biet|tim|book|thu)\b/g, 'muon $1'],
  [/\bthu (dan|zan|giang)\b/g, 'thu gian'], [/\btia (lai|toc|ngon|bot|gon)\b/g, 'cat toc'], [/\bntn\b/g, 'nhu the nao'], [/\b(z|zay|dzay)\s*([?!.]*)$/g, 'vay$2'], [/\bsdt\b/g, 'so dien thoai'],
];

/** Câu khách → dạng bỏ dấu đã sửa lỗi gõ + áp cụm đã học. Câu đã học nguyên văn → thay bằng câu viết lại. */
export function correctMessage(message: string, learned: LearnedPhrase[] = []): string {
  const key = fold(message).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const whole = learned.find((x) => x.kind === 'question' && x.phrase === key);
  const raw = whole ? whole.rewrite : message.replace(/\bmún\b/gi, 'muốn').replace(/\bhok\b/gi, 'không');
  let m = fold(raw);
  for (const a of learned) {
    if (a.kind !== 'alias' || !a.phrase.trim()) continue;
    m = m.replace(new RegExp(`\\b${a.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), a.rewrite);
  }
  return TYPOS.reduce((acc, [re, to]) => acc.replace(re, to), m);
}

/**
 * Trạng thái hội thoại (dialogue state tracking) — việc trợ lý đang làm dở, TÁCH khỏi lịch sử chat (cách các trợ lý CSKH
 * hàng đầu làm "procedure" nhiều bước): khách hỏi "sáng mai còn giờ nào?" → trợ lý hỏi dịch vụ → khách đáp "cắt tóc nữ"
 * thì vẫn tra SÁNG MAI; "thế chiều thì sao" chỉ đổi buổi, giữ ngày và dịch vụ.
 */
export interface DialogState {
  task?: 'availability';
  date?: string;
  part?: DayPart;
  time?: string;
  serviceId?: string;
  /** Trợ lý vừa hỏi "dịch vụ nào?" — câu tiếp theo nêu tên dịch vụ là câu trả lời cho câu hỏi đó. */
  awaitingService?: boolean;
  /** Số lượt liên tiếp chưa hiểu; lượt thứ hai chuyển khách sang nhân viên (human handoff). */
  misses?: number;
}

/** Chính sách cọc chống bùng lịch — khớp frontend/src/utils/opsHelpers.ts (DEPOSIT_THRESHOLD, depositAmount). */
export const DEPOSIT_THRESHOLD = 500_000;
export const DEPOSIT_PERCENT = 30;

export type CustomerIntent =
  | 'greeting' | 'identity' | 'help' | 'thanks' | 'bye' | 'price_list' | 'hot' | 'book' | 'hours' | 'contact' | 'need' | 'unknown'
  | 'combo_info' | 'explain' | 'service_price' | 'availability' | 'service_duration' | 'service_detail' | 'budget' | 'deposit'
  | 'not_offered' | 'group_booking' | 'stylists' | 'open_now' | 'handoff' | 'cancel_policy' | 'payment' | 'promotion' | 'faq'
  | CatalogFactIntent;

/**
 * Câu hỏi THỐNG KÊ / SO SÁNH trên danh mục ("có bao nhiêu dịch vụ", "dịch vụ rẻ nhất", "làm nhanh nhất"…): trả lời bằng
 * phép tính trên danh mục thật, KHÔNG chuyển cho mô hình ngôn ngữ (mô hình nhỏ đếm / so sánh hay bịa: "60 dịch vụ").
 */
export type CatalogFactIntent =
  | 'count_services' | 'cheapest_service' | 'priciest_service' | 'fastest_service' | 'longest_service' | 'filter_by_group';

export const CATALOG_FACT_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  'count_services', 'cheapest_service', 'priciest_service', 'fastest_service', 'longest_service', 'filter_by_group',
]);

/**
 * QA 12/10 — CHỈ những câu khách đang CHỌN dịch vụ mới kèm thẻ dịch vụ. Câu hỏi thông tin ("combo khác gì đặt lẻ",
 * cọc, huỷ lịch, giờ mở cửa, bảng giá, câu chưa hiểu…) được trả lời bình thường, không chèn thẻ gợi ý "ăn theo".
 */
/**
 * QA 12/10 (thử trên AI local thật): câu trả lời là SỐ LIỆU / CHÍNH SÁCH của tiệm (đếm, so sánh, xếp hạng hot, bảng giá, giờ mở
 * cửa, liên hệ, cọc, huỷ, thanh toán, khuyến mãi) trả thẳng từ dữ liệu — mô hình 4B diễn đạt lại từng làm mất thứ hạng "hot"
 * và chèn câu mời đặt lịch thừa. Mô hình chỉ lo phần hội thoại: chào hỏi, tư vấn nhu cầu, giải thích combo, câu tự do.
 */
export const DIRECT_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  ...CATALOG_FACT_INTENTS, 'hot', 'price_list', 'service_price', 'availability', 'service_duration', 'service_detail', 'budget', 'hours',
  // Giới thiệu bản thân / hướng dẫn trả thẳng: mô hình từng nói "Mình không phải bot" — sai sự thật
  'identity', 'help', 'not_offered', 'group_booking', 'stylists', 'open_now', 'handoff', 'contact', 'deposit', 'cancel_policy', 'payment', 'promotion', 'faq',
]);

export const CARD_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  'need', 'book', 'hot', 'service_price', 'availability', 'service_duration', 'service_detail', 'budget', 'cheapest_service', 'priciest_service', 'fastest_service', 'longest_service', 'filter_by_group',
]);

export interface CustomerReply {
  intent: CustomerIntent;
  answer: string;
  suggestions: CatalogItem[];
  quickReplies: string[];
  /** Việc máy chủ phải làm tiếp để có câu trả lời thật (tra giờ trống) — không gửi ra giao diện. */
  pending?:
    | { kind: 'availability'; serviceId: string; when: WhenQuery }
    /** "ngày kia có dịch vụ massage nào trống lịch" → tra cả nhóm, báo dịch vụ nào còn giờ */
    | { kind: 'availability_group'; serviceIds: string[]; label: string; when: WhenQuery }
    /** "có những thợ nào làm được" → thợ làm được dịch vụ đang nói tới (+ ai còn giờ trống ngày đang tra) */
    | { kind: 'stylists'; serviceId: string; date?: string };
  /** Trạng thái hội thoại cho lượt sau (widget gửi lại nguyên văn). */
  state?: DialogState;
  /** Câu trả lời trùng câu vừa trả lời (khách hỏi lại) — ghi vào báo cáo cải tiến. */
  repeated?: boolean;
}

/** Nhu cầu → từ khoá (không dấu). Khớp với tên / nhóm / mô tả dịch vụ trong danh mục THẬT của tiệm. */
const NEEDS: { label: string; ask: RegExp; words: string[]; cat?: RegExp }[] = [
  { label: 'tóc', ask: /\b(toc|cat|goi dau|nhuom|uon|duoi|phuc hoi|hu ton|xoan|tay toc|highlight|balayage|ombre|phu bac|toc bac|keratin|olaplex|rung toc|barber|rau)\b/, words: ['toc', 'cat', 'goi', 'nhuom', 'uon', 'duoi', 'phuc hoi', 'hap', 'barber', 'rau'] },
  { label: 'da', ask: /\b(da(?! nong)|da mat|mat na|mun|tham mun|lam sang|duong da|facial|cham soc da|lo chan long|kho da|da dau|cap am|dien di|peel|tre hoa|vitamin c)\b/, words: ['da', 'mat', 'facial', 'mun', 'duong', 'sang', 'cap am', 'peel', 'collagen'], cat: /\bcham soc da\b|\bskin\b/ },
  { label: 'massage', ask: /\b(massage|mat xa|matxa|thu gian|dau lung|moi vai|co vai gay|vai gay|body|xong hoi|da nong|bam huyet|tam trang|phi thuyen|ngam chan)\b/, words: ['massage', 'mat xa', 'thu gian', 'body', 'vai gay', 'xong', 'da nong', 'bam huyet', 'tam trang'], cat: /\b(massage|body)\b/ },
  { label: 'móng', ask: /\b(nail|mong|son gel|son mong|ve mong|mong tay|mong chan|dap bot|up mong|manicure|pedicure)\b/, words: ['nail', 'mong', 'son', 'manicure', 'pedicure'], cat: /\b(nail|mong)\b/ },
  { label: 'gội dưỡng', ask: /\b(goi duong|goi thao duoc|u toc|hap dau|duong toc|gau|da dau)\b/, words: ['goi', 'duong', 'u toc', 'hap', 'da dau'] },
  { label: 'trang điểm', ask: /\b(trang diem|make ?up|co dau|ky yeu|noi mi|long mi)\b/, words: ['trang diem', 'co dau', 'ky yeu', 'mi'] },
];

/** Triệu chứng cụ thể → dịch vụ chuyên trị (trọng số cao hơn nhu cầu chung "tóc" / "da"). */
const SYMPTOMS: { ask: RegExp; words: string[] }[] = [
  { ask: /\b(kho xo|xo roi|hu ton|che ngon|gay rung|toc yeu|toc kho|phuc hoi|nhuom nhieu|tay nhieu|toc xo|xo qua|bi xo|mem muot|suon muot|bong muot|muot ma|xo cung)\b/, words: ['phuc hoi', 'hap', 'u', 'duong'] },
  { ask: /\b(mun|tham mun|da dau|lo chan long)\b/, words: ['mun', 'tri mun', 'lam sach'] }, // không dùng "tri" trơn: khớp nhầm "trị gàu"
  { ask: /\b(moi|dau lung|co vai gay|vai gay|met moi|cang thang|stress|mat ngu|thu gian)\b/, words: ['massage', 'vai gay', 'bam huyet', 'body'] }, // không dùng 'dưỡng sinh': kéo 'Gội đầu dưỡng sinh' vào câu đau lưng
  { ask: /\b(du tiec|di tiec|dam cuoi|chup anh|su kien)\b/, words: ['trang diem', 'tiec'] },
  { ask: /\b(da kho|bong troc|thieu am|cang da|nut ne|kho rap)\b/, words: ['cap am', 'duong am', 'ha', 'vitamin'] },
  { ask: /\b(co dau|cuoi|ngay cuoi|dam hoi)\b/, words: ['co dau'] },
];

const STOP = new Set(['toi', 'minh', 'em', 'anh', 'chi', 'ban', 'muon', 'can', 'cho', 'voi', 'la', 'co', 'khong', 'gi', 'nao',
  'bao', 'nhieu', 'tien', 'gia', 'lam', 'dich', 'vu', 'shop', 'tiem', 'oi', 'a', 'nhe', 'di', 'duoc', 'va', 'hay', 'thi', 'mot', 'cai',
  // QA 12/10: tính từ / từ nối chung không được khớp tên dịch vụ ("uốn NÓNG" từng kéo theo "Combo ... đá NÓNG")
  'nong', 'lanh', 'dep', 'tot', 'xau', 'nhanh', 'lau', 'moi', 'cu', 'nho', 'lon', 'khac', 'nhau', 'nen', 'hon', 'nhat', 'kieu', 'loai',
  // từ chỉ thời gian: "THÁNG sau mình cưới" (thang) từng khớp "Duỗi THẲNG"
  'thang', 'tuan', 'ngay', 'sau', 'truoc', 'nay', 'mai', 'qua', 'gio', 'buoi', 'luc', 'chieu', 'sang', 'trua']);

const textOf = (s: CatalogItem): string => fold(`${s.name} ${s.categoryName} ${s.description ?? ''}`);

/** Chấm điểm dịch vụ theo câu khách hỏi: khớp nhu cầu + khớp chữ trong tên. */
/**
 * `strict`: chỉ lấy dịch vụ khớp THEO TÊN (đúng tên / cụm từ / từ trong tên) — dùng cho câu giải thích, không kéo theo
 * cả nhóm "tóc" chỉ vì câu có nhắc tới tóc.
 */
/**
 * Câu dẫn đồng cảm SOẠN SẴN theo nhu cầu / triệu chứng. Thử thật 12/10: câu dẫn do mô hình 4B viết sai nghĩa 3/6 lượt
 * ("tái trang tức năng", "mình hiểu rõ nhu cầu tẩy da chết là gì nhé") — câu soạn sẵn luôn đúng, không tốn lượt mô hình.
 */
export function needLead(m: string): string | null {
  if (/\b(co dau|cuoi|dam hoi)\b/.test(m)) return 'Chúc mừng bạn sắp đến ngày trọng đại 💐';
  if (/\b(du tiec|di tiec|chup anh|su kien|ky yeu)\b/.test(m)) return 'Để bạn thật rạng rỡ trong buổi tiệc ✨';
  if (/\b(kho xo|xo|hu ton|che ngon|gay rung|toc yeu|toc kho|mem muot|suon muot)\b/.test(m)) return 'Tóc khô xơ, hư tổn cần được phục hồi và dưỡng ẩm từ bên trong.';
  if (/\b(mun|tham|lo chan long|da dau)\b/.test(m)) return 'Da mụn cần được làm sạch sâu và chăm đúng cách.';
  if (/\b(met|moi|dau lung|vai gay|cang thang|stress|mat ngu|thu gian)\b/.test(m)) return 'Sau những giờ làm việc căng thẳng, được thư giãn một chút là điều rất nên 🌿';
  if (/\b(da|da mat|lam dep da|duong da|cap am)\b/.test(m)) return 'Làn da cần được chăm sóc đúng cách để luôn tươi sáng.';
  if (/\b(nail|mong)\b/.test(m)) return 'Một bộ móng xinh sẽ giúp bạn tự tin hơn 💅';
  if (/\b(toc|cat|nhuom|uon|duoi)\b/.test(m)) return 'Mái tóc hợp với bạn sẽ giúp bạn tự tin hơn mỗi ngày.';
  return null;
}

/** Bỏ cụm ngày trong tuần trước khi khớp tên dịch vụ: "thứ năm" (thu nam) từng khớp "Cắt tóc NAM", "thứ tư" khớp "tư vấn". */
const stripDays = (m: string): string => m.replace(/\bthu (2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)\b|\bchu nhat\b/g, ' ');

export function matchServices(message: string, catalog: CatalogItem[], limit = 4, strict = false, ratio = 0.6): CatalogItem[] {
  const m = stripDays(normalize(message));
  const needs = NEEDS.filter((n) => n.ask.test(m));
  const symptoms = SYMPTOMS.filter((x) => x.ask.test(m));
  const all = m.split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = all.filter((t) => t.length >= 2 && !STOP.has(t));
  // Cụm 2 từ liền nhau ("da nong", "vai gay") khớp tên dịch vụ: chính xác hơn từ đơn, kể cả khi từng từ là từ chung
  const bigrams = all.slice(0, -1).map((t, i) => [t, all[i + 1]]).filter(([a, b]) => !(STOP.has(a) && STOP.has(b))).map(([a, b]) => `${a} ${b}`);
  const scored = catalog.map((s) => {
    const t = textOf(s);
    const name = fold(s.name);
    const words = new Set(name.split(/[^a-z0-9]+/));
    // Điểm THEO TÊN: đúng tên 10 · cụm 2 từ 4 · từ đặc trưng ≥ 5 chữ ("keratin", "massage") 4 · từ ngắn 3–4 chữ 2.
    // Bỏ dấu làm nhiều từ ngắn trùng nhau ("mất"/"mặt" = mat, "thứ"/"thư" = thu, "gói"/"gội" = goi) → một từ ngắn KHÔNG đủ.
    let byName = name.length >= 4 && m.includes(name) ? 10 : 0;
    for (const tok of tokens) {
      if (tok.length >= 3 && words.has(tok)) byName += tok.length >= 5 ? 4 : 2; // trọn từ: "ai" không khớp "vai"
      // gõ thiếu chữ: "massag" → "massage" (chỉ tiền tố, từ ≥ 5 ký tự)
      else if (tok.length >= 5 && [...words].some((w) => w.length > tok.length && w.startsWith(tok))) byName += 3;
    }
    for (const bg of bigrams) if (new RegExp(`\\b${bg}\\b`).test(name)) byName += 4;
    // Combo chỉ đứng đầu khi khách hỏi combo / gói / cưới ("làm tóc cho nam" từng ra "Combo Cô dâu ... làm tóc")
    // "Cắt tóc trẻ em" từng đứng trong mọi câu "cắt tóc" chung (rẻ nhất) — chỉ gợi ý khi khách nhắc tới trẻ em
    if (byName > 0 && /\btre em\b/.test(name) && !/\btre em\b/.test(m)) byName -= 6;
    if (byName > 0 && COMBO_RE.test(name) && !/\b(combo|goi|tron goi|co dau|cuoi|tiet kiem|vip)\b/.test(m)) byName -= 5;
    // Giới tính khách nêu trùng tên dịch vụ: "tóc cho nam" → "Cắt tóc NAM"
    for (const g of ['nam', 'nu']) if (byName > 0 && new RegExp(`\\b${g}\\b`).test(m) && words.has(g)) byName += 4;
    if (strict) return { s, score: byName };
    let score = byName;
    const has = (w: string) => new RegExp(`\\b${w}\\b`).test(t);
    for (const n of needs) if (n.words.some(has)) score += 3;
    // Dịch vụ THUỘC nhóm đúng nhu cầu ("làm đẹp da mặt" → nhóm Chăm sóc da, không phải "Cạo MẶT & tỉa râu")
    for (const n of needs) if (n.cat?.test(fold(s.categoryName))) score += 4;
    if (byName <= 0 && COMBO_RE.test(name) && !/\b(combo|goi|tron goi|co dau|cuoi|tiet kiem|vip)\b/.test(m)) score -= 5;
    if (byName <= 0 && /\btre em\b/.test(name) && !/\btre em\b/.test(m)) score -= 3;
    const inName = (w: string) => new RegExp(`\\b${w}\\b`).test(name);
    for (const sy of symptoms) if (sy.words.some(inName)) score += 10; else if (sy.words.some(has)) score += 4;
    return { s, score };
    // Một chữ chung trùng tên không đủ để gợi ý: "THỜI tiết" từng kéo theo "Nhuộm Balayage THỜI trang"
  }).filter((x) => x.score >= (strict ? 4 : 3));
  scored.sort((a, b) => b.score - a.score || a.s.price - b.s.price);
  // Bỏ gợi ý "ăn theo" yếu khi đã có dịch vụ khớp rõ ràng
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score >= top * ratio).slice(0, limit).map((x) => x.s);
}

/** Bỏ dấu + từ đồng nghĩa khách hay dùng → chữ có trong tên dịch vụ ("bé 5 tuổi" → "trẻ em", "haircut" → "cắt tóc"). */
export const normalize = (message: string): string => SYNONYMS.reduce((acc, [re, to]) => acc.replace(re, to), fold(message));

/** Cách gọi của khách → chữ trong tên dịch vụ. */
const SYNONYMS: [RegExp, string][] = [
  [/\b(be|em be|be gai|be trai|tre con|con nit|nhoc|chau be|tre nho)\b/g, 'tre em'],
  [/\b(dan ong|nam gioi|con trai|cac anh)\b/g, 'nam'],
  [/\b(phu nu|con gai|cac chi)\b/g, 'nu'],
  [/\b(mat xa|matxa|massa|masage)\b/g, 'massage'],
  [/\b(lam mong|lam nail|nails)\b/g, 'nail mong'],
  // "gói cô dâu", "gói cưới", "trọn gói" = combo ("gói" bỏ dấu trùng "gội" nên phải đổi trước khi khớp)
  [/\bgoi (co dau|cuoi|dam cuoi|tiet kiem|vip)\b/g, 'combo $1'], [/\btron goi\b/g, 'combo tron goi'],
  // Khách nước ngoài: vài từ tiếng Anh cơ bản
  [/\bhair ?cut\b/g, 'cat toc'], [/\bhow much\b/g, 'bao nhieu tien'], [/\bfacial\b/g, 'cham soc da'], [/\bmanicure\b/g, 'manicure mong'],
  [/\bhair\b/g, 'toc'], [/\bdo you have\b/g, 'co'],
];

/** Nhóm dịch vụ khách hay hỏi → nhận diện trong câu hỏi (`ask`) và trong tên danh mục / tên dịch vụ (`cat`). */
const GROUPS: { label: string; ask: RegExp; cat: RegExp }[] = [
  { label: 'combo', ask: /\b(combo|goi combo|lieu trinh|goi tiet kiem|tron goi)\b/, cat: /\b(combo|lieu trinh)\b/ },
  { label: 'gội đầu', ask: /\b(goi dau|goi duong|duong sinh)\b/, cat: /\bgoi dau\b/ },
  { label: 'tóc', ask: /\b(toc|cat toc|uon|nhuom|duoi toc)\b/, cat: /\b(toc|uon|nhuom)\b/ },
  { label: 'chăm sóc da', ask: /\b(cham soc da|da mat|dich vu da|lam da|skin ?care|facial)\b/, cat: /\bcham soc da\b/ },
  { label: 'massage', ask: /\b(massage|mat xa|matxa|body)\b/, cat: /\b(massage|body)\b/ },
  { label: 'móng', ask: /\b(nail|mong|mong tay|mong chan|manicure|pedicure)\b/, cat: /\b(nail|mong)\b/ },
  { label: 'trang điểm', ask: /\b(trang diem|make ?up|noi mi)\b/, cat: /\b(trang diem|noi mi)\b/ },
];

// QA nhập vai 12/10: MỌI mẫu có ranh giới từ \b — "cô dâu" (co dau) từng khớp "ở đâu" (o dau) → trả địa chỉ tiệm,
// "giá cắt" (gia cat) khớp "giá cả" → cả bảng giá, "những giờ" (nhung gio) khớp "những gì" → liệt kê nhóm.
const FACT_RE: { intent: Exclude<CatalogFactIntent, 'filter_by_group'>; re: RegExp }[] = [
  { intent: 'count_services', re: /\b((bao nhieu|may|tong (cong|so)|so luong)( loai| cai| goi)? (dich vu|danh muc|nhom)|(dich vu|danh muc)( \w+){0,3} (co )?(bao nhieu|may)|co (tat ca|tong cong) bao nhieu)\b/ },
  { intent: 'cheapest_service', re: /\b(re nhat|gia (thap|mem|re) nhat|thap nhat|it tien nhat|binh dan nhat|tiet kiem nhat|re hon|it tien hon)\b/ },
  // "được đặt nhất" (= nhiều người đặt) cũng gập thành "dat nhat" → không phải hỏi giá đắt nhất
  { intent: 'priciest_service', re: /((?<!(duoc|hay|khach|nguoi|chon) )\bdat nhat\b|\b(gia cao nhat|mac nhat|dat tien nhat|cao cap nhat|vip nhat|xin nhat|sang nhat|dat hon|mac hon)\b)/ },
  { intent: 'fastest_service', re: /\b(nhanh nhat|it thoi gian nhat|ngan nhat|lam nhanh nhat|mat it thoi gian|nhanh hon)\b/ },
  { intent: 'longest_service', re: /\b(lau nhat|dai nhat|ton (nhieu )?thoi gian nhat|nhieu thoi gian nhat|mat nhieu thoi gian nhat|lau hon)\b/ },
];
const LIST_RE = /\b(co (nhung |cac )?(dich vu|gi|combo|goi)|(nhung|cac) (combo|goi)( \w+)? nao|nhung dich vu|cac dich vu|liet ke|danh sach|co nhung gi|xem (cac )?dich vu)\b/;
const HOT_RE = /\b(hot|noi bat|pho bien|ban chay|nhieu nguoi|dat nhieu|duoc (yeu thich|chuong|dat nhieu|dat nhat)|best ?seller|nen thu|hay dat|dat nhieu nhat)\b/;
const COMBO_RE = /\b(combo|goi combo|goi tiet kiem|lieu trinh)\b/;
/** "combo có gì khác so với bình thường", "combo lợi gì hơn đặt lẻ", "combo là gì"… → giải thích, không liệt kê thẻ. */
const COMBO_INFO_RE = /\b(khac (gi|nhau|biet)|khac so voi|so voi|loi (ich|gi|hon)|co loi|tiet kiem (hon|duoc|bao nhieu)|la gi|nghia la|nen chon|hon (gi|khong)|dat le|lam le|binh thuong|co gi (hay|dac biet|khac))\b/;
const PRICE_RE = /\b(gia (bao nhieu|the nao|sao|nhieu|bn|ca)|bao nhieu tien|bao tien|het bao nhieu|ton bao nhieu|bao nhieu vay|bao nhieu a|bao nhieu (z|ha|v|nhi)|bao nhieu$)\b/;
/** Câu hỏi so sánh / giải thích ("uốn lạnh với uốn nóng khác gì", "keratin là gì", "có hại tóc không") → trả lời bình thường. */
const EXPLAIN_RE = /\b(khac (gi|nhau|biet|cho nao)|khac so voi|so voi|giong (nhau|gi)|la gi|nghia la|co hai|hai (toc|da) khong|an toan khong|giu (duoc )?bao lau|duoc bao lau|bao lau thi|co tot khong|tot khong|hieu qua khong)\b/;
const DURATION_RE = /\b(bao lau|may tieng|thoi gian lam|het bao lau|mat may (tieng|phut)|bao nhieu phut|bao nhieu tieng|lau khong)\b/;
const DETAIL_RE = /\b(gom (nhung )?gi|bao gom|gom nhung gi|co nhung buoc|lam nhung gi|quy trinh|chi tiet|cu the (la )?gi|mo ta)\b/;
const BOOK_RE = /\b(dat lich|dat cho|dat hen|book|giu cho|hen gio|muon den|dat ngay|dat giup)\b/;
const HOURS_RE = /\b(gio mo cua|mo cua|dong cua|lam viec den|gio lam viec|may gio (mo|dong|nghi)|co lam (khong|ko)|nghi (khong|ko)|(lam|mo|mo cua|nhan khach) (den|toi) may gio)\b/;
const CONTACT_RE = /\b(dia chi|o dau|cho nao|duong nao|hotline|so dien thoai|sdt|lien he|ban do|zalo|fanpage|facebook)\b/;
const POLICY_RE: { intent: 'deposit' | 'cancel_policy' | 'payment' | 'promotion'; re: RegExp }[] = [
  { intent: 'deposit', re: /\b(coc|dat coc|tien coc|giu cho bang tien|tra truoc)\b/ },
  { intent: 'cancel_policy', re: /\b(huy (lich|hen|dat)|muon huy|doi (lich|gio|ngay|hen)|doi sang|hoan lich|tra cuu|xem lai lich|kiem tra lich)\b/ },
  { intent: 'payment', re: /\b(thanh toan|chuyen khoan|tien mat|quet ma|qr|the (ngan hang|tin dung|atm)|ca the|quet the|momo|vnpay|zalopay|tra tien)\b/ },
  { intent: 'promotion', re: /\b(khuyen mai|giam gia|voucher|ma giam|uu dai|sale|coupon)\b/ },
];

/** Nhóm dịch vụ khách nhắc tới trong câu hỏi (vd. "dịch vụ móng rẻ nhất") — null nếu không nhắc / nhóm không có dịch vụ. */
export function groupScope(message: string, catalog: CatalogItem[]): { label: string; items: CatalogItem[] } | null {
  const m = fold(message);
  for (const g of GROUPS) {
    if (!g.ask.test(m)) continue;
    let items = catalog.filter((s) => g.cat.test(fold(s.categoryName)) || (g.label === 'combo' && g.cat.test(fold(s.name))));
    // Tiệm không có danh mục riêng (massage nằm rải ở "Gội đầu", "Chăm sóc da") → gom theo TÊN dịch vụ
    if (!items.length) items = catalog.filter((s) => g.cat.test(fold(s.name)));
    if (items.length) return { label: g.label, items };
  }
  return null;
}

export function catalogFactIntent(message: string, catalog: CatalogItem[]): CatalogFactIntent | null {
  const m = fold(message);
  const fact = FACT_RE.find((f) => f.re.test(m));
  if (fact) return fact.intent;
  // "combo có gì HOT" là hỏi phổ biến, "combo có gì KHÁC đặt lẻ" là hỏi giải thích — không phải lệnh liệt kê
  if (LIST_RE.test(m) && !HOT_RE.test(m) && !AVAILABILITY_RE.test(m) && !(COMBO_RE.test(m) && COMBO_INFO_RE.test(m))
    && groupScope(message, catalog)) {
    return 'filter_by_group';
  }
  return null;
}

/** Một lượt hội thoại trước đó (widget gửi kèm). */
export interface ChatLine { role: 'user' | 'assistant'; content: string }

/** Tuỳ chọn khi trả lời: lịch sử hội thoại (hiểu "cái đó", "bao lâu"), lượt đặt 90 ngày theo dịch vụ, ngày hôm nay. */
export interface ReplyOptions {
  history?: ChatLine[];
  /** serviceId → số lượt đặt 90 ngày qua (xếp hạng "hot" theo nhóm). */
  popularity?: Record<string, number>;
  /** yyyy-MM-dd theo giờ tiệm (mặc định ngày của `now`). */
  today?: string;
  /** Trạng thái hội thoại của lượt trước. */
  state?: DialogState;
  /** Giờ hiện tại theo giờ tiệm "HH:mm" (mặc định tính từ `now`). */
  nowTime?: string;
  /** Câu / cụm từ đã học (chủ tiệm duyệt). */
  learned?: LearnedPhrase[];
}

/**
 * Dịch vụ / nhóm khách ĐANG nói tới trong các lượt trước (câu gần nhất có nhắc rõ tên dịch vụ, hoặc dịch vụ trợ lý vừa nêu).
 * Dùng khi câu hiện tại không tự nêu dịch vụ: "cái đó giá bao nhiêu", "làm mất bao lâu", "chiều nay còn giờ không".
 */
export function focusFromHistory(history: ChatLine[] = [], catalog: CatalogItem[]): { services: CatalogItem[]; group: { label: string; items: CatalogItem[] } | null } {
  const recent = history.slice(-8).reverse();
  for (const h of recent) {
    if (h.role !== 'user') continue;
    const services = namedServices(h.content, catalog).services;
    const group = groupScope(h.content, catalog);
    if (services.length || group) return { services, group };
  }
  // Khách chỉ nêu nhu cầu ("tóc khô xơ") → dịch vụ trợ lý vừa gợi ý (theo thứ tự xuất hiện trong câu trả lời)
  const lastBot = recent.find((h) => h.role === 'assistant');
  if (lastBot) {
    const text = fold(lastBot.content);
    const named = catalog.map((s) => ({ s, at: text.indexOf(fold(s.name)) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at).map((x) => x.s);
    if (named.length) return { services: named.slice(0, 3), group: null };
  }
  return { services: [], group: null };
}

/**
 * Dịch vụ được NÊU TÊN — tách câu theo "và / với / cộng / kèm / hay / hoặc / +" để nhận NHIỀU dịch vụ một lúc
 * ("gội đầu và cắt tóc nữ", "keratin hay hấp dầu"); mỗi vế lấy dịch vụ khớp tên nhất.
 */
export function namedServices(message: string, catalog: CatalogItem[]): { services: CatalogItem[]; parts: number } {
  const m = fold(message);
  const parts = m.split(/\b(?:va|voi|cong|kem|hay|hoac|ket hop)\b|[+,&]/).map((x) => x.trim()).filter((x) => x.split(' ').length >= 1 && x.length >= 3);
  if (parts.length >= 2) {
    const picks = parts.map((x) => matchServices(x, catalog, 1, true, 0.8)[0]).filter((x): x is CatalogItem => !!x);
    const uniq = picks.filter((x, i) => picks.findIndex((y) => y.id === x.id) === i);
    if (uniq.length >= 2) return { services: uniq.slice(0, 4), parts: uniq.length };
  }
  return { services: matchServices(message, catalog, 3, true, 0.8), parts: 1 };
}

/** Dịch vụ khách hay hỏi mà tiệm có thể KHÔNG làm — chỉ báo "chưa có" khi danh mục thật không chứa cụm này. */
const NOT_OFFERED: [RegExp, string][] = [
  [/\bnoi toc\b/, 'nối tóc'], [/\bcay toc\b/, 'cấy tóc'], [/\b(xam (may|moi|chan may|mi|mat|hinh)|phun xam|dieu khac)\b/, 'phun xăm'], // "xam" trơn = "xám" (nhuộm xám) [/\bphun (moi|may|chan may)\b/, 'phun môi / mày'],
  [/\b(triet long|tay long|wax|waxing)\b/, 'triệt / tẩy lông'], [/\b(tiem (filler|botox|meso|tan mo|chat lam day)|filler|botox)\b/, 'tiêm thẩm mỹ'], // "tiem" trơn = "tiệm" [/\bgiam beo\b/, 'giảm béo'],
  [/\b(lam rang|tay trang rang|bam khuyen|xo khuyen)\b/, 'dịch vụ này'], [/\b(tam bun|xong hoi uot)\b/, 'tắm bùn'],
];

/** Từ chỉ NHÓM dịch vụ — câu chỉ có những từ này ("làm nail", "massage", "cắt tóc") là hỏi chung cả nhóm. */
const GENERIC_WORDS = new Set(['toc', 'cat', 'mong', 'nail', 'massage', 'da', 'combo', 'goi', 'dau', 'lam', 'body', 'mat', 'cham', 'soc', 'thu', 'gian', 'tri', 'lieu']);

/** Câu nêu chữ ĐẶC TRƯNG của dịch vụ (ngoài các từ chỉ nhóm): "cắt tóc NAM", "phục hồi KERATIN". */
function isSpecific(input: string, s: CatalogItem): boolean {
  const m = stripDays(input);
  const folded = fold(s.name);
  const name = new Set(folded.split(/[^a-z0-9]+/));
  const toks = m.split(/[^a-z0-9]+/).filter(Boolean);
  if (toks.some((t) => t.length >= 2 && !STOP.has(t) && !GENERIC_WORDS.has(t) && name.has(t))) return true;
  // cụm 2 từ khớp tên mà không phải toàn từ chỉ nhóm: "đá nóng", "vai gáy"
  return toks.slice(0, -1).some((t, i) => !(GENERIC_WORDS.has(t) && GENERIC_WORDS.has(toks[i + 1]))
    && new RegExp(`\\b${t} ${toks[i + 1]}\\b`).test(folded));
}

export interface Detection {
  intent: CustomerIntent;
  matches: CatalogItem[];
  /** Nhóm áp dụng cho câu hỏi (của câu hiện tại hoặc kế thừa từ ngữ cảnh). */
  scope?: { label: string; items: CatalogItem[] } | null;
  when?: WhenQuery;
  budget?: BudgetQuery;
  /** Tên dịch vụ tiệm không làm (not_offered). */
  label?: string;
  /** Tra giờ mà dịch vụ chỉ suy ra từ ngữ cảnh và có ≥ 2 khả năng → hỏi lại khách, không tự chọn bừa. */
  ambiguous?: boolean;
  /** Tra giờ cho CẢ NHÓM ("dịch vụ massage nào còn trống") — khách chưa nêu dịch vụ cụ thể. */
  groupWide?: boolean;
}

export function detectCustomerIntent(message: string, catalog: CatalogItem[], opts: ReplyOptions = {}): Detection {
  const m = normalize(message);
  const today = opts.today ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const named = namedServices(message, catalog);
  const own = named.services; // dịch vụ được NÊU TÊN trong câu (có thể nhiều: "gội đầu và cắt tóc nữ")
  const ownGroup = groupScope(message, catalog);
  const ctx = own.length || ownGroup ? { services: [] as CatalogItem[], group: null } : focusFromHistory(opts.history, catalog);
  const focus = own.length ? own : ctx.services;
  const scope = ownGroup ?? (own.length ? null : ctx.group);
  // Chỉ nêu NHÓM ("massage nào", "làm nail") chứ không nêu dịch vụ cụ thể → tra giờ cả nhóm thay vì tự chọn một dịch vụ
  const groupOnly = !!ownGroup && ownGroup.items.length >= 2 && !own.some((s) => isSpecific(m, s));

  // Trạng thái hội thoại: việc "tra giờ trống" đang dở → câu sau chỉ cần nêu dịch vụ / đổi ngày giờ
  const st = opts.state?.task === 'availability' && opts.state.date && opts.state.date >= today ? opts.state : null;
  const stateService = st?.serviceId ? catalog.find((x) => x.id === st.serviceId) ?? null : null;
  const parsed = parseWhen(m, today);
  // Gộp: phần khách vừa nói (ngày / buổi / giờ) ghi đè, phần không nhắc giữ nguyên ("thế chiều thì sao" → giữ ngày)
  const when: WhenQuery = st && !parsed.explicitDate
    ? { date: st.date!, explicitDate: true, part: parsed.part ?? (parsed.time ? null : st.part ?? null), time: parsed.time ?? (parsed.part ? null : st.time ?? null) }
    : parsed;
  if (st) {
    const words = m.split(' ').filter(Boolean).length;
    const otherTopic = PRICE_RE.test(m) || DURATION_RE.test(m) || EXPLAIN_RE.test(m) || DETAIL_RE.test(m) || POLICY_RE.some((x) => x.re.test(m))
      || parseBudget(m) !== null || CONTACT_RE.test(m);
    const answersService = st.awaitingService && own.length > 0 && words <= 8 && !otherTopic;
    const refinesTime = (parsed.explicitDate || parsed.part || parsed.time) && !otherTopic
      && (words <= 6 || /\b(thi sao|the con|con|duoc khong|khong|ko|nhe|di|sao|vay)\b/.test(m));
    if (answersService || refinesTime || (AVAILABILITY_RE.test(m) && !otherTopic)) {
      if (groupOnly) return { intent: 'availability', matches: ownGroup!.items, scope: ownGroup, when, groupWide: true };
      const svc = own.length ? own : stateService ? [stateService] : focus;
      return { intent: 'availability', matches: svc, scope, when, ambiguous: !own.length && !stateService && focus.length >= 2 };
    }
  }
  // "bây giờ còn mở cửa không", "giờ này tiệm mở chưa", "đã đóng cửa chưa"
  if (/\b(bay gio|hien tai|luc nay|gio nay|con mo|dang mo|da dong|dong cua chua|mo cua chua|con lam (khong|ko)|con nhan khach)\b/.test(m)
    && /\b(mo|dong|lam|nhan)\b/.test(m) && !AVAILABILITY_RE.test(m)) {
    return { intent: 'open_now', matches: [] };
  }
  // "sđt tiệm là gì", "địa chỉ ở đâu" — trước câu giải thích ("là gì") và trước dịch vụ
  if (CONTACT_RE.test(m) && !own.length && !AVAILABILITY_RE.test(m)) return { intent: 'contact', matches: [] };
  // 0. Dịch vụ tiệm KHÔNG làm ("có nối tóc không") — nói thật, không gợi ý dịch vụ "na ná" như thể tiệm có làm
  const notOffered = NOT_OFFERED.find(([re]) => re.test(m) && !catalog.some((s) => re.test(fold(`${s.name} ${s.description ?? ''}`))));
  if (notOffered) return { intent: 'not_offered', matches: [], label: notOffered[1] };
  // 1. Giờ trống (tra thật ở máy chủ) — trước mọi thứ khác: "massage chân hôm nay còn những giờ nào" không phải liệt kê nhóm
  if (AVAILABILITY_RE.test(m) || (BOOK_RE.test(m) && (parsed.time || parsed.explicitDate || parsed.part))
    // "chủ nhật này 10h sáng cắt tóc nữ được không"
    || ((parsed.time || parsed.part) && parsed.explicitDate && focus.length && /\b(duoc|khong|ko|chua|nhe|a)\b/.test(m))) {
    if (groupOnly) return { intent: 'availability', matches: ownGroup!.items, scope: ownGroup, when, groupWide: true };
    return { intent: 'availability', matches: own.length ? own : stateService ? [stateService] : focus, scope, when,
      ambiguous: !own.length && !stateService && focus.length >= 2 };
  }
  // Đi nhóm / nhiều người
  // (không gồm "nhiều người": "dịch vụ nhiều người đặt" là hỏi dịch vụ hot)
  if (/\b(2|3|4|hai|ba|bon) (nguoi|ban|khach|dua)\b|\b(di cung|dat chung|di chung|di nhom|ca nha|gia dinh|ban be)\b/.test(m)) {
    return { intent: 'group_booking', matches: [] };
  }
  // Thợ: "có thợ nữ không", "thợ nào cắt đẹp", "muốn chọn thợ quen"
  if (/\b(tho|ky thuat vien|stylist)\b/.test(m) && !/\b(thieu tho)\b/.test(m)) return { intent: 'stylists', matches: [] };
  // So sánh / phân vân giữa 2 dịch vụ nêu tên: "keratin với phục hồi liên kết khác gì", "nên làm keratin hay hấp dầu"
  if (named.parts >= 2 && /\b(hay|hoac|khac|so voi|nen|tot hon|chon)\b/.test(m) && !PRICE_RE.test(m) && !DURATION_RE.test(m)) {
    return { intent: 'explain', matches: own, scope };
  }
  // 2. Chi tiết / thời lượng của dịch vụ đang nói tới ("trọn gói gồm những gì" không có ngữ cảnh → liệt kê nhóm combo)
  if (DETAIL_RE.test(m)) {
    // tên CỤ THỂ trong câu → dịch vụ đó; chỉ từ chỉ nhóm ("trọn gói", "combo") → dịch vụ đang nói tới thuộc nhóm đó
    const specificOwn = own.filter((x) => isSpecific(m, x));
    if (specificOwn.length) return { intent: 'service_detail', matches: specificOwn, scope };
    const hist = focusFromHistory(opts.history, catalog).services;
    const pick = ownGroup ? hist.filter((x) => ownGroup.items.some((g) => g.id === x.id)) : hist;
    if (pick.length) return { intent: 'service_detail', matches: pick, scope };
    if (scope) return { intent: 'filter_by_group', matches: [], scope };
    if (focus.length) return { intent: 'service_detail', matches: focus, scope };
  }
  const fact = catalogFactIntent(message, catalog);
  // "dịch vụ tẩy da chết bao nhiêu" nêu tên dịch vụ cụ thể → hỏi GIÁ, không phải "có bao nhiêu dịch vụ"
  if (fact && !(fact === 'count_services' && own.some((s) => isSpecific(m, s)))) {
    // "cái nào rẻ nhất" ngay sau danh sách gợi ý → so trong danh sách đó; "dịch vụ rẻ nhất" (nói chung) → cả tiệm
    // chỉ khi khách dùng từ CHỈ ĐỊNH ("cái nào", "loại nào", "trong đó") hoặc so sánh hơn ("rẻ hơn") — "làm cái gì nhanh nhất" là hỏi chung
    const referential = /\b(cai nao|loai nao|goi nao|trong (do|so do|nay)|cai do|hai cai|2 cai|hon)\b/.test(m);
    const listed = !scope && referential && ctx.services.length >= 2 ? { label: 'vừa nói tới', items: ctx.services } : null;
    return { intent: fact, matches: [], scope: scope ?? listed };
  }
  if (COMBO_RE.test(m) && COMBO_INFO_RE.test(m)) return { intent: 'combo_info', matches: [] };
  const policy = POLICY_RE.find((x) => x.re.test(m));
  if (policy) return { intent: policy.intent, matches: [] };
  if (EXPLAIN_RE.test(m)) return { intent: 'explain', matches: focus, scope };
  if (DURATION_RE.test(m) && (focus.length || scope)) return { intent: 'service_duration', matches: focus, scope };
  // 3. Ngân sách: "dưới 200k", "tầm 300 nghìn thì làm được gì"
  const budget = parseBudget(m);
  if (budget) return { intent: 'budget', matches: [], scope: ownGroup, budget };
  if (/\b(bang gia|xem gia|price|menu|danh sach dich vu|tat ca dich vu)\b/.test(m)) return { intent: 'price_list', matches: [] };
  if (HOT_RE.test(m)) return { intent: 'hot', matches: [], scope: ownGroup };
  // 4. Giá: tên CỤ THỂ ("cắt tóc nam", "keratin") → đúng dịch vụ; chỉ từ chỉ nhóm ("làm nail", "massage") → giá cả nhóm;
  //    không nêu gì → dịch vụ đang nói tới trong hội thoại
  if ((PRICE_RE.test(m) || (/\bgia\b/.test(m) && own.length)) && (focus.length || scope)) {
    const specific = own.length > 0 && (!ownGroup || isSpecific(m, own[0]));
    return { intent: 'service_price', matches: specific ? own : own.length ? [] : ownGroup ? [] : focus, scope: specific ? null : scope ?? ownGroup };
  }
  if (HOURS_RE.test(m) || (when.explicitDate && /\b(co lam|mo|nghi|lam viec)\b/.test(m))) return { intent: 'hours', matches: [], when };
  if (CONTACT_RE.test(m)) return { intent: 'contact', matches: [] };
  const ranked = matchServices(message, catalog, 4, false, own.some((x) => isSpecific(m, x)) ? 0.8 : 0.6);
  const matches = named.parts >= 2 ? own : [...own.filter((x) => isSpecific(m, x)), ...ranked].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 3);
  if (BOOK_RE.test(m)) return { intent: 'book', matches: matches.length ? matches : focus };
  const small = smallTalkIntent(message);
  // "chào shop, tư vấn da mụn" → nhu cầu thắng câu chào; "bạn là ai" không có nhu cầu → xã giao
  if (small && !NEEDS.some((n) => n.ask.test(m)) && !SYMPTOMS.some((x) => x.ask.test(m))) return { intent: small, matches: [] };
  if (matches.length) return { intent: 'need', matches };
  return { intent: 'unknown', matches: [] };
}

const QUICK = ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay'];
const line = (s: CatalogItem): string => `• ${s.name} — ${s.durationMinutes} phút · ${s.priceText}`;

/** Thống kê danh mục dùng chung cho câu trả lời theo luật và cho khối tóm tắt gửi mô hình ngôn ngữ. */
export function catalogStats(catalog: CatalogItem[]) {
  const byPrice = [...catalog].sort((a, b) => a.price - b.price || a.durationMinutes - b.durationMinutes || a.name.localeCompare(b.name));
  const byTime = [...catalog].sort((a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price || a.name.localeCompare(b.name));
  const groups = new Map<string, number>();
  for (const s of catalog) groups.set(s.categoryName, (groups.get(s.categoryName) ?? 0) + 1);
  return {
    total: catalog.length, groups, byPrice, byTime,
    cheapest: byPrice[0] ?? null, priciest: byPrice[byPrice.length - 1] ?? null,
    fastest: byTime[0] ?? null, longest: byTime[byTime.length - 1] ?? null,
  };
}

/** Câu trả lời cho câu hỏi thống kê / so sánh — tính trên danh mục thật, gợi ý đúng dịch vụ được nói tới. */
function catalogFactReply(
  intent: CatalogFactIntent, message: string, catalog: CatalogItem[], shop: string,
  scopeOverride: { label: string; items: CatalogItem[] } | null = null,
): { answer: string; suggestions: CatalogItem[] } {
  const scope = scopeOverride ?? groupScope(message, catalog);
  const items = scope?.items ?? catalog;
  const where = scope ? ` trong nhóm ${scope.label}` : '';
  if (!items.length) return { answer: 'Hiện tiệm chưa mở dịch vụ nào để đặt online, bạn gọi hotline giúp mình nhé.', suggestions: [] };
  const st = catalogStats(items);
  /** Phần tử đứng đầu theo tiêu chí + các dịch vụ BẰNG nó (cùng giá / cùng thời lượng) + 2 lựa chọn kế tiếp. */
  const pick = (sorted: CatalogItem[], key: (s: CatalogItem) => number) => {
    const ties = sorted.filter((s) => key(s) === key(sorted[0]));
    return { ties, next: sorted.slice(ties.length, ties.length + 2) };
  };
  const extremes = (sorted: CatalogItem[], key: (s: CatalogItem) => number, title: string) => {
    const { ties, next } = pick(sorted, key);
    const head = ties.length > 1 && ties.length < sorted.length
      ? `Có ${ties.length} dịch vụ ${title}${where}:\n${ties.slice(0, 4).map(line).join('\n')}`
      : `Dịch vụ ${title}${where} là ${ties[0].name} — ${ties[0].priceText}, ${ties[0].durationMinutes} phút.`;
    const more = next.length ? `\nTiếp theo:\n${next.map(line).join('\n')}` : '';
    return { answer: `${head}${more}\nBấm "Chọn" rồi "Đặt lịch" nếu bạn muốn làm dịch vụ này nhé.`, suggestions: [...ties.slice(0, 3), ...next].slice(0, 3) };
  };
  switch (intent) {
    case 'count_services': {
      if (scope) {
        return {
          answer: `Nhóm ${scope.label} hiện có ${items.length} dịch vụ:\n${st.byPrice.slice(0, 8).map(line).join('\n')}${items.length > 8 ? `\n…và ${items.length - 8} dịch vụ khác` : ''}`,
          suggestions: st.byPrice.slice(0, 3),
        };
      }
      const groups = Array.from(st.groups.entries()).map(([name, n]) => `• ${name}: ${n} dịch vụ`);
      return {
        answer: `Hiện ${shop} có ${st.total} dịch vụ đặt online, chia thành ${st.groups.size} danh mục:\n${groups.join('\n')}\n`
          + `Giá từ ${st.cheapest!.priceText} (${st.cheapest!.name}) đến ${st.priciest!.priceText} (${st.priciest!.name}).`,
        suggestions: [],
      };
    }
    case 'cheapest_service': return extremes(st.byPrice, (s) => s.price, 'có giá thấp nhất');
    case 'priciest_service': return extremes([...st.byPrice].reverse(), (s) => s.price, 'có giá cao nhất');
    case 'fastest_service': return extremes(st.byTime, (s) => s.durationMinutes, 'làm nhanh nhất');
    case 'longest_service': return extremes([...st.byTime].reverse(), (s) => s.durationMinutes, 'lâu nhất');
    case 'filter_by_group':
    default:
      return {
        answer: `Các dịch vụ${where} (${items.length} dịch vụ, xếp theo giá):\n${st.byPrice.slice(0, 10).map(line).join('\n')}`
          + `${items.length > 10 ? `\n…và ${items.length - 10} dịch vụ khác` : ''}`,
        suggestions: st.byPrice.slice(0, 3),
      };
  }
}

const DOW_LABEL = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
/** "Thứ bảy 17/10", "hôm nay (Thứ hai 12/10)". */
export function dayText(date: string, today?: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const label = `${DOW_LABEL[d.getUTCDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
  if (today && date === today) return `hôm nay (${label})`;
  if (today && date === plusDays(today, 1)) return `ngày mai (${label})`;
  return label;
}

const hhmm = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface AvailabilityData {
  salonClosed: boolean;
  closedReason: string | null;
  slots: { time: string; stylistIds: string[] }[];
  suggestedDates: string[];
}

/**
 * Câu trả lời giờ trống từ kết quả tra THẬT (AvailabilityService). Lọc theo buổi / giờ khách hỏi, gom theo buổi cho dễ đọc,
 * giờ khách hỏi đã kín thì đưa các giờ gần nhất; ngày kín / tiệm nghỉ thì gợi ý ngày gần nhất còn chỗ.
 */
export function availabilityAnswer(service: CatalogItem, when: WhenQuery, data: AvailabilityData, today: string): string {
  const day = dayText(when.date, today);
  const head = `${service.name} (${service.durationMinutes} phút · ${service.priceText})`;
  if (data.salonClosed) {
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} tiệm nghỉ${data.closedReason ? ` (${data.closedReason})` : ''}.`
      + (data.suggestedDates.length ? ` Ngày gần nhất còn chỗ cho ${service.name}: ${data.suggestedDates.map((d) => dayText(d, today)).join(', ')}.` : '');
  }
  let slots = data.slots.filter((s) => s.stylistIds.length > 0).map((s) => s.time);
  const partNote = when.part ? ` ${PART_LABEL[when.part]}` : '';
  if (when.part) {
    const [from, to] = PART_RANGE[when.part];
    slots = slots.filter((t) => hhmm(t) >= from && hhmm(t) < to);
  }
  const next = data.suggestedDates.length ? ` Ngày gần nhất còn chỗ: ${data.suggestedDates.map((d) => dayText(d, today)).join(', ')}.` : '';
  if (when.time) {
    if (slots.includes(when.time) || data.slots.some((s) => s.time === when.time && s.stylistIds.length)) {
      return `Còn trống ✅ ${head} lúc ${when.time} ${day}. Bấm "Đặt" để giữ chỗ — khung giờ được giữ cho bạn trong lúc điền thông tin.`;
    }
    const all = data.slots.filter((s) => s.stylistIds.length).map((s) => s.time);
    const near = [...all].sort((a, b) => Math.abs(hhmm(a) - hhmm(when.time!)) - Math.abs(hhmm(b) - hhmm(when.time!))).slice(0, 4).sort();
    return near.length
      ? `${when.time} ${day} đã kín cho ${head}. Giờ gần nhất còn trống: ${near.join(', ')}.`
      : `${day.charAt(0).toUpperCase()}${day.slice(1)} đã kín lịch cho ${head}.${next}`;
  }
  if (!slots.length) {
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}${partNote} không còn giờ trống cho ${head}.`
      + (when.part && data.slots.length ? ` Các buổi khác trong ngày vẫn còn: ${data.slots.filter((s) => s.stylistIds.length).slice(0, 6).map((s) => s.time).join(', ')}.` : next);
  }
  const groups: [string, string[]][] = (['sang', 'chieu', 'toi'] as DayPart[])
    .map((p): [string, string[]] => [PART_LABEL[p], slots.filter((t) => hhmm(t) >= PART_RANGE[p][0] && hhmm(t) < (p === 'sang' ? 12 * 60 : p === 'chieu' ? 17 * 60 : 24 * 60))])
    .filter(([, list]) => list.length);
  const show = (list: string[]) => (list.length > 8 ? `${list.slice(0, 8).join(', ')} … (+${list.length - 8})` : list.join(', '));
  return `${head} ${day}${partNote} còn ${slots.length} khung giờ trống:\n${groups.map(([label, list]) => `• ${label.charAt(0).toUpperCase()}${label.slice(1)}: ${show(list)}`).join('\n')}\n`
    + 'Bấm "Đặt" rồi chọn giờ — khung giờ được giữ cho bạn trong lúc điền thông tin.';
}

/** Giờ mở cửa của ngày khách hỏi ("chủ nhật có làm không") — null nếu không biết ngày đó. */
function dayHours(facts: SalonFacts, date: string): string | null {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const label = fold(DOW_LABEL[dow]);
  const h = facts.openingHours.find((x) => fold(x.dayLabel) === label);
  if (!h) return null;
  return h.isClosed ? `${DOW_LABEL[dow]} tiệm nghỉ.` : `${DOW_LABEL[dow]} tiệm mở cửa ${h.openTime.slice(0, 5)}–${h.closeTime.slice(0, 5)}.`;
}

export function customerRuleReply(
  message: string, catalog: CatalogItem[], hotIds: string[], facts: SalonFacts, now?: Date, opts: ReplyOptions = {},
): CustomerReply {
  const today = opts.today ?? new Date((now?.getTime() ?? Date.now()) + 7 * 3600_000).toISOString().slice(0, 10);
  const original = message;
  message = correctMessage(message, opts.learned);
  const det = detectCustomerIntent(message, catalog, { ...opts, today });
  const lastBot = [...(opts.history ?? [])].reverse().find((h) => h.role === 'assistant')?.content.trim() ?? '';
  const faq = det.intent === 'unknown' ? ownerAnswer(message, opts.learned) : null;
  if (faq) {
    return { intent: 'faq', answer: faq, suggestions: [], quickReplies: ['Xem bảng giá', 'Đặt lịch ngay'], state: { ...(opts.state ?? {}), misses: 0 } };
  }
  const out = customerRuleReplyInner(det, message, original, catalog, hotIds, facts, now, opts, today);
  return out.pending ? out : repeatGuard(out, lastBot, facts);
}

/**
 * Không bao giờ lặp NGUYÊN VĂN câu vừa trả lời: khách hỏi lại tức là câu trước chưa đủ ("không nêu tên thợ à?" — log 12/10
 * trợ lý lặp y hệt). Thay bằng lời thừa nhận + chuyển người thật; câu này cũng được ghi vào "lỗ hổng kiến thức".
 */
export function repeatGuard<T extends { intent: string; answer: string; quickReplies: string[]; repeated?: boolean }>(out: T, lastBot: string, facts: SalonFacts): T {
  if (!lastBot || out.answer.trim() !== lastBot.trim()) return out;
  return { ...out, repeated: true, quickReplies: ['Xem bảng giá', 'Đặt lịch ngay'],
    answer: `Dạ, như mình vừa nêu ở trên:\n${out.answer.trim()}\nNếu vẫn chưa đúng ý bạn, bạn gọi / nhắn Zalo ${facts.hotline || 'hotline của tiệm'} `
      + 'để nhân viên tiệm trả lời trực tiếp nhé 🙏' };
}

/** Giờ trống của MỘT dịch vụ sau khi lọc buổi / giờ khách hỏi. */
function openSlots(data: AvailabilityData, when: WhenQuery): string[] {
  let slots = data.slots.filter((s) => s.stylistIds.length > 0).map((s) => s.time);
  if (when.part) {
    const [from, to] = PART_RANGE[when.part];
    slots = slots.filter((t) => hhmm(t) >= from && hhmm(t) < to);
  }
  if (when.time) slots = slots.filter((t) => t === when.time);
  return slots;
}

/**
 * "Ngày kia có dịch vụ massage nào trống lịch không" — tra THẬT từng dịch vụ trong nhóm, báo dịch vụ nào còn giờ
 * (nhiều giờ trước) và dịch vụ nào đã kín. Trả cả danh sách dịch vụ còn giờ để làm thẻ "Đặt".
 */
export function groupAvailabilityAnswer(
  label: string, rows: { service: CatalogItem; data: AvailabilityData }[], when: WhenQuery, today: string,
): { answer: string; open: CatalogItem[] } {
  const day = dayText(when.date, today);
  const Day = `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
  const partNote = when.time ? ` lúc ${when.time}` : when.part ? ` ${PART_LABEL[when.part]}` : '';
  const closed = rows.find((r) => r.data.salonClosed);
  if (closed) return { answer: `${Day} tiệm nghỉ${closed.data.closedReason ? ` (${closed.data.closedReason})` : ''}.`, open: [] };
  const withSlots = rows.map((r) => ({ ...r, slots: openSlots(r.data, when) })).filter((r) => r.slots.length)
    .sort((a, b) => b.slots.length - a.slots.length);
  const full = rows.filter((r) => !withSlots.some((w) => w.service.id === r.service.id)).map((r) => r.service.name);
  if (!withSlots.length) return { answer: `${Day}${partNote} các dịch vụ nhóm ${label} đều đã kín lịch. Bạn thử ngày khác giúp mình nhé.`, open: [] };
  const lines = withSlots.slice(0, 6).map((r) => `• ${r.service.name} (${r.service.durationMinutes} phút · ${r.service.priceText}) — `
    + `${when.time ? 'còn trống' : `${r.slots.length} khung giờ, sớm nhất ${r.slots[0]}`}`);
  return {
    answer: `${Day}${partNote} nhóm ${label} còn trống:\n${lines.join('\n')}${full.length ? `\nĐã kín: ${full.slice(0, 4).join(', ')}${full.length > 4 ? '…' : ''}.` : ''}\n`
      + 'Bạn chọn dịch vụ để mình liệt kê giờ cụ thể, hoặc bấm "Đặt".',
    open: withSlots.map((r) => r.service),
  };
}

/**
 * Viết lại câu hỏi (query rewriting — "Rewrite-Retrieve-Read", EMNLP 2023): khi luật chưa hiểu, mô hình CHỈ chuẩn hoá câu
 * khách (sửa chính tả, tiếng lóng, viết tắt, nối ngữ cảnh) thành một câu rõ nghĩa; câu trả lời vẫn do luật + dữ liệu thật lo.
 * Ví dụ mẫu = câu chủ tiệm đã duyệt (giống "bootstrap few-shot" của DSPy): càng duyệt nhiều, mô hình viết lại càng chuẩn.
 */
export const REWRITE_SYSTEM_PROMPT = 'Bạn chuẩn hoá câu khách nhắn cho trợ lý của một salon tóc / spa. Viết lại thành MỘT câu hỏi tiếng Việt có dấu, '
  + 'ngắn, rõ nghĩa: sửa lỗi chính tả, tiếng lóng, viết tắt (k = không, đc = được, bn = bao nhiêu, mai = ngày mai); thay "cái đó / dịch vụ đó" '
  + 'bằng tên dịch vụ trong hội thoại; GIỮ NGUYÊN ngày, giờ, buổi, tên dịch vụ, số tiền. KHÔNG trả lời câu hỏi, KHÔNG thêm thông tin. '
  + 'Câu không liên quan tới salon / dịch vụ / đặt lịch / giá / giờ / thợ / chính sách thì trả đúng một chữ: KHONG_RO.';

const REWRITE_EXAMPLES: [string, string][] = [
  ['ngay kia co dv mat xoa nao trong lich k', 'Ngày kia dịch vụ massage nào còn giờ trống?'],
  ['bn tiền cắt tóc nữ z', 'Cắt tóc nữ giá bao nhiêu?'],
  ['tiệm mấy h đóng', 'Mấy giờ tiệm đóng cửa?'],
  ['có ai làm móng cho e đc ko', 'Có thợ nào làm nail không?'],
  ['thời tiết mai sao', 'KHONG_RO'],
];

export function buildRewriteMessages(
  message: string, history: ChatLine[], catalog: CatalogItem[], approved: { phrase: string; rewrite: string }[] = [],
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const examples = [...approved.slice(0, 8).map((x): [string, string] => [x.phrase, x.rewrite]), ...REWRITE_EXAMPLES];
  const ctx = history.slice(-4).map((h) => `${h.role === 'user' ? 'Khách' : 'Trợ lý'}: ${h.content.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  return [
    { role: 'system', content: `${REWRITE_SYSTEM_PROMPT}\nDịch vụ của tiệm: ${catalog.map((x) => x.name).join('; ').slice(0, 1500)}` },
    ...examples.flatMap(([q, a]) => [{ role: 'user' as const, content: q }, { role: 'assistant' as const, content: a }]),
    { role: 'user', content: ctx ? `Hội thoại trước:\n${ctx}\n\nCâu cần viết lại: ${message.trim()}` : message.trim() },
  ];
}

/**
 * Kiểm tra TRUNG THỰC của câu viết lại (faithfulness check): mọi từ đặc trưng của tên dịch vụ xuất hiện trong câu viết lại
 * phải có trong câu khách (đã sửa chính tả + từ đồng nghĩa) hoặc trong hội thoại gần nhất. Thử thật 12/10: mô hình 4B viết
 * "mát xoa giá bao nhiêu" thành "Chăm sóc da chuyên sâu Vitamin C giá bao nhiêu?" → bị loại.
 */
export function faithfulRewrite(original: string, rewrite: string, catalog: CatalogItem[], history: ChatLine[] = []): boolean {
  const vocab = new Set(catalog.flatMap((x) => fold(x.name).split(/[^a-z0-9]+/)).filter((t) => t.length >= 3 && !STOP.has(t)));
  const source = new Set([normalize(correctMessage(original)), ...history.slice(-4).map((h) => normalize(h.content))]
    .join(' ').split(/[^a-z0-9]+/).filter(Boolean));
  return normalize(rewrite).split(/[^a-z0-9]+/).filter((t) => vocab.has(t)).every((t) => source.has(t));
}

/** Lấy câu viết lại hợp lệ (một dòng, 4–200 ký tự) từ đầu ra mô hình; null nếu mô hình bảo không rõ hoặc trả lời lạc đề. */
export function parseRewrite(text: string | null, original: string): string | null {
  if (!text) return null;
  const line = text.replace(/<\/?think>[\s\S]*?(<\/think>|$)/g, '').split('\n').map((x) => x.trim()).find(Boolean) ?? '';
  const q = line.replace(/^(câu viết lại|viết lại|trả lời)\s*:\s*/i, '').replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
  if (!q || /KHONG_RO|không rõ/i.test(q) || q.length < 4 || q.length > 200) return null;
  if (fold(q) === fold(original)) return null; // không đổi gì → luật vẫn chưa hiểu
  return q;
}

function customerRuleReplyInner(
  det: Detection, message: string, original: string, catalog: CatalogItem[], hotIds: string[], facts: SalonFacts, now: Date | undefined,
  opts: ReplyOptions, today: string,
): CustomerReply {
  void original;
  const { intent, matches } = det;
  const m = fold(message);
  // Lượt đặt thật (máy chủ truyền vào); không có thì suy thứ hạng từ hotIds — khi đó KHÔNG in số lượt (không bịa con số)
  const realCounts = !!opts.popularity;
  const pop: Record<string, number> = opts.popularity ?? Object.fromEntries(hotIds.map((id, i) => [id, hotIds.length - i]));
  const hot = hotIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
  const popular = (hot.length ? hot : catalog).slice(0, 4);
  const shop = facts.name || 'tiệm';
  // Trạng thái cho lượt sau: giữ việc "tra giờ trống" đang dở; đếm số lượt chưa hiểu liên tiếp
  const prev = opts.state ?? {};
  const misses = intent === 'unknown' ? (prev.misses ?? 0) + 1 : 0;
  const carry: DialogState = prev.task === 'availability' && prev.date && prev.date >= today
    ? { task: 'availability', date: prev.date, part: prev.part, time: prev.time, serviceId: prev.serviceId, misses }
    : { misses };
  const reply = (answer: string, suggestions: CatalogItem[] = [], quickReplies = QUICK, extra: Partial<CustomerReply> = {}): CustomerReply =>
    ({ intent, answer, suggestions, quickReplies, state: carry, ...extra });

  if (CATALOG_FACT_INTENTS.has(intent)) {
    const fact = catalogFactReply(intent as CatalogFactIntent, message, catalog, shop, det.scope ?? null);
    return reply(fact.answer, fact.suggestions, ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay']);
  }

  switch (intent) {
    case 'availability': {
      // Câu trả lời thật do máy chủ điền sau khi tra giờ trống (pending); đây là câu dự phòng khi không tra được
      const service = matches[0] ?? null;
      const w = det.when!;
      const next: DialogState = { task: 'availability', date: w.date, part: w.part ?? undefined, time: w.time ?? undefined };
      if (det.groupWide && det.scope) {
        const items = [...det.scope.items].sort((a, b) => (pop[b.id] ?? 0) - (pop[a.id] ?? 0)).slice(0, 8);
        return reply(`Nhóm ${det.scope.label} có ${det.scope.items.length} dịch vụ — bạn chọn một dịch vụ bên dưới để mình xem giờ trống `
          + `${dayText(w.date, today)} nhé.`, items.slice(0, 3), items.slice(0, 3).map((x) => x.name),
        { pending: { kind: 'availability_group', serviceIds: items.map((x) => x.id), label: det.scope.label, when: w }, state: { ...next, awaitingService: true } });
      }
      if (!service) {
        const options = det.scope ? catalogStats(det.scope.items).byPrice.slice(0, 3) : popular.slice(0, 3);
        return reply(`Bạn muốn xem giờ trống ${dayText(w.date, today)}${w.part ? ` ${PART_LABEL[w.part]}` : ''}${w.time ? ` lúc ${w.time}` : ''} cho dịch vụ nào? `
          + `Chọn một dịch vụ${det.scope ? ` trong nhóm ${det.scope.label}` : ''} bên dưới hoặc gõ tên dịch vụ nhé.`, options, ['Cắt tóc nữ', 'Gội đầu dưỡng sinh', 'Xem bảng giá'],
        { state: { ...next, awaitingService: true } });
      }
      // "massage cổ vai gáy giá bao nhiêu" (2 dịch vụ) → "mai còn giờ không": hỏi lại dịch vụ nào thay vì tự chọn cái đầu
      if (det.ambiguous) {
        const options = matches.slice(0, 3);
        return reply(`Bạn muốn xem giờ trống ${dayText(w.date, today)}${w.part ? ` ${PART_LABEL[w.part]}` : ''}${w.time ? ` lúc ${w.time}` : ''} cho dịch vụ nào: `
          + `${options.map((x) => x.name).join(' hay ')}? Bấm chọn bên dưới hoặc gõ tên nhé.`, options, options.map((x) => x.name),
        { state: { ...next, awaitingService: true } });
      }
      const later = w.part === 'sang' ? 'Buổi chiều thì sao?' : w.date === today ? 'Ngày mai thì sao?' : 'Buổi tối thì sao?';
      return reply(`Bạn bấm "Đặt" ở ${service.name} rồi chọn ngày ${dayText(w.date)} để xem giờ trống nhé.`, [service],
        [later, 'Giá bao nhiêu?'], { pending: { kind: 'availability', serviceId: service.id, when: w }, state: { ...next, serviceId: service.id } });
    }
    case 'service_duration': {
      const list = matches.length ? matches.slice(0, 4) : catalogStats(det.scope!.items).byTime.slice(0, 4);
      const sum = list.reduce((a, s) => a + s.durationMinutes, 0);
      const total = list.length >= 2 && (matches.length >= 2 || /\b(tong|ca hai|het|tat ca)\b/.test(m))
        ? `\nTổng cộng khoảng ${sum} phút (${Math.floor(sum / 60)} giờ${sum % 60 ? ` ${sum % 60} phút` : ''}) nếu làm liền trong một lượt, tạm tính ${formatVnd(list.reduce((a, s) => a + s.price, 0))}.`
        : '';
      const text = list.length === 1
        ? `${list[0].name} mất khoảng ${list[0].durationMinutes} phút (${list[0].priceText}).`
        : `Thời lượng tham khảo:\n${list.map(line).join('\n')}${total}`;
      return reply(`${text}\nThời gian thực tế có thể thay đổi một chút theo tình trạng tóc / da của bạn.`, list.slice(0, 3), ['Hôm nay còn giờ nào?', 'Xem bảng giá']);
    }
    case 'service_detail': {
      // "trọn gói gồm những gì" → ưu tiên combo trong các dịch vụ đang nói tới
      const s = (/\b(tron goi|combo|goi)\b/.test(m) && matches.find((x) => COMBO_RE.test(fold(x.name)))) || matches[0];
      return reply(`${s.name} — ${s.durationMinutes} phút · ${s.priceText}:\n${s.description ?? 'Tiệm chưa có mô tả chi tiết cho dịch vụ này, chuyên viên sẽ tư vấn khi bạn đến.'}`,
        [s], ['Hôm nay còn giờ nào?', 'Có cần cọc không?']);
    }
    case 'budget': {
      const b = det.budget!;
      const items = (det.scope?.items ?? catalog).filter((s) => (b.min === null || s.price >= b.min) && (b.max === null || s.price <= b.max));
      const target = b.max ?? b.min ?? 0;
      // "tầm X": gần ngân sách nhất trước; "dưới X": phổ biến rồi giá tăng dần
      const sorted = b.min !== null && b.max !== null
        ? [...items].sort((x, y) => Math.abs(x.price - target) - Math.abs(y.price - target))
        : [...items].sort((x, y) => (pop[y.id] ?? 0) - (pop[x.id] ?? 0) || x.price - y.price);
      if (!sorted.length) {
        return reply(`Tiệm chưa có dịch vụ ${b.label}${det.scope ? ` trong nhóm ${det.scope.label}` : ''}. Dịch vụ giá thấp nhất là `
          + `${catalogStats(det.scope?.items ?? catalog).cheapest?.name} (${catalogStats(det.scope?.items ?? catalog).cheapest?.priceText}).`);
      }
      return reply(`Dịch vụ ${b.label}${det.scope ? ` trong nhóm ${det.scope.label}` : ''} (${items.length} dịch vụ):\n`
        + `${sorted.slice(0, 6).map(line).join('\n')}${items.length > 6 ? `\n…và ${items.length - 6} dịch vụ khác` : ''}`, sorted.slice(0, 3), ['Dịch vụ hot', 'Xem bảng giá']);
    }
    case 'open_now': {
      const clock = opts.nowTime ?? new Date((now?.getTime() ?? Date.now()) + 7 * 3600_000).toISOString().slice(11, 16);
      const holiday = (d: string) => facts.holidays?.find((h) => h.startDate <= d && d <= h.endDate) ?? null;
      const hoursOf = (d: string) => facts.openingHours.find((x) => fold(x.dayLabel) === fold(DOW_LABEL[new Date(`${d}T00:00:00Z`).getUTCDay()]));
      const nextOpen = (): string => {
        for (let i = 1; i <= 14; i += 1) {
          const d = plusDays(today, i);
          const h = hoursOf(d);
          if (h && !h.isClosed && !holiday(d)) return `${dayText(d, today).replace(/^./, (c) => c.toUpperCase())} tiệm mở từ ${h.openTime.slice(0, 5)}.`;
        }
        return '';
      };
      const h = hoursOf(today);
      const off = holiday(today);
      if (off || !h || h.isClosed) return reply(`Hôm nay tiệm nghỉ${off ? ` (${off.reason})` : ''}. ${nextOpen()}`, [], ['Ngày mai còn giờ nào?', 'Giờ mở cửa']);
      const [o, c] = [h.openTime.slice(0, 5), h.closeTime.slice(0, 5)];
      if (clock < o) return reply(`Bây giờ là ${clock}, tiệm chưa mở cửa — hôm nay mở từ ${o} đến ${c}.`, [], ['Hôm nay còn giờ nào?', 'Giờ mở cửa']);
      if (clock >= c) return reply(`Bây giờ là ${clock}, tiệm đã đóng cửa (hôm nay mở ${o}–${c}). ${nextOpen()}`, [], ['Ngày mai còn giờ nào?', 'Giờ mở cửa']);
      const left = hhmm(c) - hhmm(clock);
      return reply(`Tiệm đang mở cửa đến ${c} (còn khoảng ${left >= 60 ? `${Math.floor(left / 60)} giờ ${left % 60} phút` : `${left} phút`}). `
        + 'Đặt online cần trước giờ hẹn ít nhất 60 phút; đến thẳng tiệm thì lễ tân xếp khách vãng lai nếu còn thợ rảnh.', [], ['Hôm nay còn giờ nào?', 'Giờ mở cửa']);
    }
    case 'not_offered': {
      const near = det.scope ? ` Các dịch vụ nhóm ${det.scope.label} đang có: ${catalogStats(det.scope.items).byPrice.slice(0, 3).map((x) => x.name).join(', ')}.` : '';
      return reply(`Hiện ${shop} chưa có dịch vụ ${det.label}, mình không muốn bạn đến rồi phải về 😊${near} `
        + `Bạn cần gì khác cứ hỏi mình, hoặc gọi ${facts.hotline || 'hotline của tiệm'} để được tư vấn thêm.`, [], ['Xem bảng giá', 'Dịch vụ hot']);
    }
    case 'group_booking': {
      const max = facts.maxActiveBookingsPerPhone ?? 3;
      return reply('Mỗi lịch hẹn dành cho một khách. Đi cùng bạn bè / người nhà, bạn đặt mỗi người một lịch cùng khung giờ '
        + '(chọn thợ khác nhau hoặc để tiệm tự xếp thợ rảnh) — nhập cùng số điện thoại cũng được, '
        + `một số giữ tối đa ${max} lịch chưa hoàn tất. Muốn chắc chắn có đủ thợ cùng lúc, bạn hỏi mình "<dịch vụ> <ngày> còn giờ nào" nhé.`,
      [], ['Hôm nay còn giờ nào?', 'Xem bảng giá']);
    }
    case 'stylists': {
      const st = facts.stylists;
      const count = st && st.total ? `Tiệm hiện có ${st.total} thợ${st.female || st.male ? ` (${st.female} nữ, ${st.male} nam)` : ''}. ` : '';
      // Dịch vụ đang nói tới (câu này / trạng thái tra giờ / ngữ cảnh) → thợ làm được dịch vụ đó; máy chủ tra thêm ai còn giờ trống
      const stateSvc = opts.state?.serviceId ? catalog.find((x) => x.id === opts.state!.serviceId) : undefined;
      const svc = matches[0] ?? stateSvc;
      const team = facts.team ?? [];
      const wantsGender = /\btho (nu|nam)\b/.exec(m)?.[1];
      if (svc && team.length) {
        const can = team.filter((t) => t.serviceIds.includes(svc.id));
        const date = opts.state?.task === 'availability' && opts.state.serviceId === svc.id ? opts.state.date : undefined;
        return reply(can.length
          ? `${can.length} thợ làm được ${svc.name}: ${can.map((t) => t.name).join(', ')}. Khi đặt lịch bạn chọn đích danh thợ hoặc "Thợ bất kỳ".`
          : `Hiện chưa có thợ nào nhận ${svc.name}; bạn gọi ${facts.hotline} để tiệm sắp xếp nhé.`, [svc], ['Đặt lịch ngay', 'Có thợ nữ không?'],
        { pending: { kind: 'stylists', serviceId: svc.id, date } });
      }
      if (team.length && (wantsGender || /\b(ten|nhung tho|tho nao|cac tho|tho gi|danh sach)\b/.test(m))) {
        const list = wantsGender ? team.filter((t) => t.gender === (wantsGender === 'nu' ? 'female' : 'male')) : team;
        return reply(`${wantsGender ? `Tiệm có ${list.length} thợ ${wantsGender === 'nu' ? 'nữ' : 'nam'}` : `Tiệm có ${list.length} thợ`}: `
          + `${list.map((t) => t.name).join(', ')}. Bạn nói mình dịch vụ muốn làm, mình báo thợ nào làm được và ai còn giờ trống nhé.`,
        [], ['Cắt tóc nữ có thợ nào?', 'Massage có thợ nào?']);
      }
      return reply(`${count}Ở bước "Chọn thợ" khi đặt lịch, bạn thấy đúng những thợ làm được dịch vụ đã chọn (kèm ảnh và giới thiệu) `
        + 'để chọn đích danh thợ quen, hoặc chọn "Thợ bất kỳ" để tiệm xếp thợ rảnh. Tay nghề từng thợ do tiệm đào tạo, mình không xếp hạng thợ.',
      [], ['Đặt lịch ngay', 'Hôm nay còn giờ nào?']);
    }
    case 'greeting':
      return reply(`Chào bạn!${now ? ` Chúc bạn buổi ${partOfDay(now)} thật thư thái.` : ''} Mình là chuyên viên tư vấn của ${shop} 🌿 `
        + 'Bạn đang muốn chăm sóc tóc, da, massage thư giãn hay làm móng? '
        + 'Kể mình nghe nhu cầu, mình gợi ý dịch vụ kèm giá và thời lượng nhé.', [], ['Tư vấn chăm sóc tóc', 'Tư vấn chăm sóc da', 'Massage thư giãn']);
    case 'bye':
      return reply(`Cảm ơn bạn đã ghé ${shop}! Hẹn gặp bạn tại tiệm — khi cần cứ bấm "Đặt lịch ngay" hoặc nhắn mình nhé 🌸`);
    case 'identity':
      return reply(`Mình là trợ lý tư vấn tự động của ${shop}. Mình giúp bạn chọn dịch vụ hợp nhu cầu, báo giá, thời lượng và giờ còn trống, `
        + 'rồi điền sẵn vào phiếu đặt lịch — bạn chỉ cần chọn giờ và để lại số điện thoại. Mình không cần tài khoản hay thông tin cá nhân của bạn.');
    case 'help':
      return reply('Đặt lịch chỉ 4 bước: (1) chọn dịch vụ → (2) chọn ngày giờ còn trống → (3) chọn thợ hoặc để tiệm xếp → '
        + '(4) nhập tên, số điện thoại. Bạn cứ nói nhu cầu (vd. "tóc khô xơ", "đau mỏi vai gáy") hoặc hỏi "chiều nay còn giờ nào", '
        + 'mình gợi ý dịch vụ và giờ trống ngay.');
    case 'thanks':
      return reply('Không có gì ạ! Khi cần, bạn bấm "Đặt lịch ngay" hoặc hỏi mình thêm nhé.');
    case 'price_list': {
      const byCat = new Map<string, CatalogItem[]>();
      for (const s of catalog) byCat.set(s.categoryName, [...(byCat.get(s.categoryName) ?? []), s]);
      const parts = Array.from(byCat.entries()).map(([cat, list]) => {
        const sorted = [...list].sort((a, b) => a.price - b.price);
        return `• ${cat}: từ ${sorted[0].priceText} (${list.length} dịch vụ)`;
      });
      return reply(parts.length ? `Bảng giá ${shop} theo nhóm (giá tạm tính, tiệm chốt khi thanh toán):\n${parts.join('\n')}\n`
        + 'Bạn hỏi tên nhóm (vd. "có những dịch vụ móng nào") để xem chi tiết từng dịch vụ nhé.'
        : 'Hiện tiệm chưa mở dịch vụ nào để đặt online, bạn gọi hotline giúp mình nhé.', [], ['Dịch vụ hot', 'Combo có gì hot?', 'Có gì dưới 200k?']);
    }
    case 'hot': {
      // Xếp theo LƯỢT ĐẶT THẬT 90 ngày của từng dịch vụ (trước đây chỉ biết top 8 toàn tiệm → nhóm combo bị báo "chưa có dữ liệu")
      const scope = det.scope;
      const items = scope?.items ?? catalog;
      const ranked = [...items].sort((a, b) => (pop[b.id] ?? 0) - (pop[a.id] ?? 0) || a.price - b.price);
      const withData = ranked.filter((s) => (pop[s.id] ?? 0) > 0);
      if (!withData.length && !Object.keys(pop).length && !scope) {
        return reply(popular.length ? `Dịch vụ được đặt nhiều nhất gần đây:\n${popular.slice(0, 3).map(line).join('\n')}`
          : 'Tiệm chưa có dịch vụ nào đang mở đặt online.', popular.slice(0, 3), ['Xem bảng giá', 'Combo có gì hot?', 'Đặt lịch ngay']);
      }
      const where = scope ? `Nhóm ${scope.label}` : 'Dịch vụ';
      if (!withData.length) {
        return reply(`${where} chưa có lượt đặt nào trong 90 ngày qua. Các lựa chọn hiện có:\n${ranked.slice(0, 3).map(line).join('\n')}`, ranked.slice(0, 3));
      }
      const top = withData.slice(0, 3);
      return reply(`${where} được đặt nhiều nhất ${realCounts ? '90 ngày qua' : 'gần đây'}:\n`
        + `${top.map((s) => `${line(s)}${realCounts ? ` (${pop[s.id]} lượt)` : ''}`).join('\n')}`,
        top, ['Xem bảng giá', scope ? 'Dịch vụ hot' : 'Combo có gì hot?', 'Đặt lịch ngay']);
    }
    case 'explain': {
      // Chỉ dựa trên MÔ TẢ DỊCH VỤ do chủ tiệm khai báo; không tự suy kiến thức chuyên môn
      const related = matches.length ? matches : matchServices(message, catalog, 3, true);
      return reply(related.length
        ? `Theo mô tả dịch vụ của tiệm:\n${related.map((s) => `• ${s.name}: ${s.description ?? 'chưa có mô tả'} (${s.durationMinutes} phút · ${s.priceText})`).join('\n')}\n`
          + `Chuyên viên sẽ tư vấn kỹ theo tình trạng tóc / da của bạn tại tiệm hoặc qua ${facts.hotline || 'hotline'}.`
        : `Câu này cần chuyên viên tư vấn kỹ theo tình trạng tóc / da của bạn — bạn gọi ${facts.hotline || 'hotline của tiệm'} `
          + 'hoặc hỏi trực tiếp khi đến tiệm nhé.', [], ['Xem bảng giá', 'Dịch vụ hot']);
    }
    case 'service_price': {
      // Nêu tên dịch vụ → giá dịch vụ đó; nêu nhóm ("làm nail bao nhiêu") → giá các dịch vụ trong nhóm
      const list = matches.length ? matches.slice(0, 3) : catalogStats(det.scope!.items).byPrice.slice(0, 5);
      const intro = !matches.length ? `Giá nhóm ${det.scope!.label} (tạm tính, tiệm chốt khi thanh toán):` : 'Giá tại tiệm (tạm tính, tiệm chốt khi thanh toán):';
      return reply(list.length === 1
        ? `${list[0].name}: ${list[0].priceText}, khoảng ${list[0].durationMinutes} phút (giá tạm tính, tiệm chốt khi thanh toán).`
        : `${intro}\n${list.map(line).join('\n')}`, list.slice(0, 3), ['Hôm nay còn giờ nào?', 'Xem bảng giá']);
    }
    case 'combo_info': {
      const combos = catalog.filter((s) => COMBO_RE.test(fold(s.categoryName)) || COMBO_RE.test(fold(s.name)));
      const list = combos.length ? `\nCombo hiện có:\n${catalogStats(combos).byPrice.map(line).join('\n')}` : '';
      return reply('Combo là gói nhiều dịch vụ làm liền trong MỘT lượt hẹn, giá tính trọn gói:\n'
        + '• Đặt một lần, tiệm xếp thợ và thời gian liền mạch — không phải chờ giữa các dịch vụ hay đặt nhiều lịch\n'
        + '• Giá trọn gói ưu đãi hơn so với đặt lẻ từng dịch vụ (nhóm "Gói combo tiết kiệm")\n'
        + '• Đặt lẻ phù hợp khi bạn chỉ cần một dịch vụ hoặc muốn tự chọn từng bước'
        + list, [], ['Combo có gì hot?', 'Xem bảng giá', 'Đặt lịch ngay']);
    }
    case 'deposit':
      return reply(`Lịch có tổng tạm tính trên ${formatVnd(DEPOSIT_THRESHOLD)} cần đặt cọc ${DEPOSIT_PERCENT}% (làm tròn lên ${formatVnd(10_000)}) `
        + 'để tiệm giữ thợ và khung giờ. Sau khi đặt, bạn quét mã VietQR và chuyển khoản trong 2 giờ với nội dung "COC <SĐT> <MÃ LỊCH>". '
        + `Tiền cọc được trừ thẳng vào hoá đơn; huỷ trước giờ hẹn 24 giờ được hoàn cọc. Lịch từ ${formatVnd(DEPOSIT_THRESHOLD)} trở xuống không cần cọc.`);
    case 'cancel_policy': {
      const hours = Math.round(((facts.cancelCutoffMinutes ?? 120) / 60) * 10) / 10;
      return reply('Bạn xem lại lịch ở mục "Tra cứu lịch" bằng mã lịch 8 ký tự hoặc số điện thoại đã đặt. '
        + `Khi còn ít nhất ${hours} giờ trước giờ hẹn, bạn tự huỷ được ngay tại đó; sát giờ hơn hoặc muốn đổi giờ / đổi thợ, `
        + `bạn gọi ${facts.hotline || 'hotline của tiệm'} để lễ tân hỗ trợ nhé.`, [], ['Đặt lịch ngay', 'Giờ mở cửa']);
    }
    case 'payment':
      return reply('Tiệm nhận tiền mặt hoặc chuyển khoản (quét mã VietQR tại quầy); hiện chưa nhận quẹt thẻ. Bạn thanh toán sau khi làm xong dịch vụ; '
        + `riêng lịch trên ${formatVnd(DEPOSIT_THRESHOLD)} cần cọc trước ${DEPOSIT_PERCENT}% và tiền cọc được trừ vào hoá đơn.`);
    case 'promotion': {
      const promos = facts.promotions ?? [];
      if (facts.promotions && !promos.length) {
        return reply(`Hiện ${shop} chưa có chương trình giảm giá nào đang chạy. Khi có ưu đãi mới, lễ tân sẽ áp dụng ngay lúc thanh toán; `
          + `bạn có mã riêng thì đưa lễ tân là được nhé.`, [], ['Xem bảng giá', 'Dịch vụ hot']);
      }
      if (promos.length) {
        const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
        const off = (p: (typeof promos)[number]) => `giảm ${p.type === 'percent' ? `${p.value}%` : formatVnd(p.value)}`;
        const rows = promos.slice(0, 5).map((p) => `• ${p.description?.trim() ? `${p.description.trim()}${/\bgiam\b/.test(fold(p.description)) ? '' : ` (${off(p)})`}` : `Ưu đãi ${off(p)}`}`
          + `${p.minOrder ? ` cho hoá đơn từ ${formatVnd(p.minOrder)}` : ''}, đến hết ${dd(p.endDate)}`);
        return reply(`Ưu đãi đang chạy tại ${shop}:\n${rows.join('\n')}\nBạn báo lễ tân chương trình khi thanh toán (mỗi hoá đơn áp dụng một ưu đãi).`,
          [], ['Xem bảng giá', 'Đặt lịch ngay']);
      }
      return reply('Nếu có mã giảm giá, bạn đưa mã cho lễ tân khi thanh toán — mỗi hoá đơn áp dụng một mã, có mã yêu cầu giá trị '
        + `đơn tối thiểu. Ưu đãi đang áp dụng bạn hỏi nhanh qua ${facts.hotline || 'hotline của tiệm'} nhé.`);
    }
    case 'book':
      return matches.length
        ? reply(`Mình tìm thấy dịch vụ phù hợp:\n${matches.slice(0, 3).map(line).join('\n')}\nBấm "Đặt" — mình điền sẵn vào phiếu, bạn chỉ cần chọn giờ.`, matches.slice(0, 3),
          ['Hôm nay còn giờ nào?', 'Xem bảng giá'])
        : reply('Bạn muốn đặt dịch vụ nào? Gõ tên dịch vụ hoặc nhu cầu (vd. "cắt tóc nữ", "mỏi vai gáy"), hoặc chọn nhanh một dịch vụ hot bên dưới.',
          popular.slice(0, 3), ['Xem bảng giá', 'Dịch vụ hot']);
    case 'hours': {
      const asked = det.when?.explicitDate ? dayHours(facts, det.when.date) : null;
      if (asked) return reply(`${asked} Muốn biết ngày đó còn giờ trống không, bạn hỏi mình kèm tên dịch vụ (vd. "cắt tóc nữ ngày đó còn giờ nào") nhé.`);
      if (/\b(may gio|den may gio|dong cua|mo cua (den|toi) may|hom nay)\b/.test(m)) {
        const line = (d: string): string => {
          const off = facts.holidays?.find((h) => h.startDate <= d && d <= h.endDate);
          const h = dayHours(facts, d);
          return off ? `${dayText(d, today)} tiệm nghỉ (${off.reason}).` : h ? `${dayText(d, today)}: ${h.replace(/^[^ ]+ [^ ]+ /, '')}` : '';
        };
        const both = [line(today), line(plusDays(today, 1))].filter(Boolean).map((x) => x.replace(/^./, (c) => c.toUpperCase()));
        if (both.length) return reply(both.join('\n'), [], ['Bây giờ còn mở cửa không?', 'Ngày mai còn giờ nào?', 'Giờ mở cửa cả tuần']);
      }
      const hours = facts.openingHours.map((h) => `${h.dayLabel}: ${h.isClosed ? 'nghỉ' : `${h.openTime.slice(0, 5)}–${h.closeTime.slice(0, 5)}`}`);
      return reply(hours.length ? `Giờ mở cửa của ${shop}:\n${hours.join('\n')}` : `Bạn gọi ${facts.hotline} để hỏi giờ mở cửa giúp mình nhé.`);
    }
    case 'contact':
      return reply(`${shop}\n📍 ${facts.address}\n☎ ${facts.hotline}\nBạn có thể đặt lịch online ngay tại đây, không cần gọi điện.`);
    case 'need': {
      const list = matches.slice(0, 3);
      const totalMin = list[0]?.durationMinutes ?? 0;
      const lead = needLead(m);
      return reply(`${lead ? `${lead}\nMình gợi ý:` : 'Với nhu cầu của bạn, mình gợi ý:'}\n${list.map(line).join('\n')}\n`
        + `${totalMin >= 90 ? 'Dịch vụ khá lâu, bạn nên đặt buổi sáng hoặc đầu giờ chiều. ' : ''}Bấm "Đặt" ở dịch vụ ưng ý nhé.`, list,
      ['Hôm nay còn giờ nào?', 'Xem bảng giá']);
    }
    default:
      if (misses >= 2) {
        return reply(`Xin lỗi bạn, câu này mình chưa trả lời chính xác được 🙏 Để không mất thời gian của bạn, bạn gọi hoặc nhắn Zalo `
          + `${facts.hotline || 'hotline của tiệm'} — nhân viên tiệm hỗ trợ trực tiếp ngay. Mình vẫn ở đây nếu bạn cần hỏi giá, giờ trống hay dịch vụ.`,
        [], ['Xem bảng giá', 'Hôm nay còn giờ nào?'], { intent: 'handoff', state: { ...carry, misses: 0 } });
      }
      return reply('Mình chưa rõ ý bạn 😊 Mình trả lời tốt nhất về dịch vụ, giá, giờ còn trống và chính sách của tiệm — bạn thử mô tả nhu cầu '
        + '(vd. "tóc hư tổn", "da mụn", "mỏi vai gáy") hoặc chọn nhanh bên dưới nhé.', [], ['Xem bảng giá', 'Dịch vụ hot', 'Hôm nay còn giờ nào?']);
  }
}

/** Ngữ cảnh cho mô hình ngôn ngữ: danh mục công khai + giờ mở cửa (không có dữ liệu khách). */
export function customerContextForLlm(catalog: CatalogItem[], hotIds: string[], facts: SalonFacts): string {
  const hot = new Set(hotIds.slice(0, 5));
  const st = catalogStats(catalog);
  return [
    `Tiệm: ${facts.name} · ${facts.address} · hotline ${facts.hotline}`,
    // Số liệu đã tính sẵn — mô hình nhỏ đếm / so sánh danh dài hay sai, nên đưa đáp án đúng vào ngữ cảnh
    `Tổng số dịch vụ: ${st.total} dịch vụ, ${st.groups.size} danh mục (${Array.from(st.groups.entries()).map(([n, c]) => `${n} ${c}`).join('; ')})`,
    ...(st.cheapest ? [
      `Dịch vụ giá thấp nhất: ${st.cheapest.name} (${st.cheapest.priceText})`,
      `Dịch vụ giá cao nhất: ${st.priciest!.name} (${st.priciest!.priceText})`,
      `Dịch vụ nhanh nhất: ${st.fastest!.name} (${st.fastest!.durationMinutes} phút); lâu nhất: ${st.longest!.name} (${st.longest!.durationMinutes} phút)`,
    ] : []),
    `Chính sách: lịch trên ${formatVnd(DEPOSIT_THRESHOLD)} cọc ${DEPOSIT_PERCENT}% qua VietQR (trừ vào hoá đơn, huỷ trước 24 giờ được hoàn); `
      + `tự huỷ trên trang Tra cứu khi còn ít nhất ${Math.round(((facts.cancelCutoffMinutes ?? 120) / 60) * 10) / 10} giờ; thanh toán tiền mặt hoặc chuyển khoản`,
    `Giờ mở cửa: ${facts.openingHours.map((h) => `${h.dayLabel} ${h.isClosed ? 'nghỉ' : `${h.openTime.slice(0, 5)}-${h.closeTime.slice(0, 5)}`}`).join('; ')}`,
    'Danh mục (tên | nhóm | phút | giá):',
    ...catalog.slice(0, 80).map((s) => `- ${s.name} | ${s.categoryName} | ${s.durationMinutes} | ${s.priceText}${hot.has(s.id) ? ' | HOT' : ''}`),
  ].join('\n');
}

export const CUSTOMER_SYSTEM_PROMPT = 'Bạn là nhân viên tư vấn thân thiện của một tiệm salon & spa Việt Nam, chat với khách trên website. '
  + 'Xưng "mình", gọi khách là "bạn". Chào hỏi tự nhiên, hỏi nhu cầu (tóc, da, massage, móng), gợi ý 1–3 dịch vụ CÓ TRONG DANH MỤC '
  + 'kèm thời lượng và giá đúng như danh mục. Không bịa dịch vụ, giá, khuyến mãi hay khung giờ trống. Không hỏi số điện thoại — '
  + 'khách tự nhập ở bước đặt lịch. Hỏi số lượng / rẻ nhất / đắt nhất thì CHỈ dùng các dòng "Tổng số dịch vụ", "giá thấp nhất", '
  + '"giá cao nhất" trong DỮ LIỆU, không tự đếm. Câu hỏi thông tin (giải thích, so sánh, chính sách) thì trả lời thẳng vào câu hỏi, KHÔNG liệt kê dịch vụ nếu khách không hỏi. Giải thích kỹ thuật làm tóc / da CHỈ dựa trên mô tả dịch vụ trong DỮ LIỆU; không đủ thông tin thì nói chuyên viên sẽ tư vấn kỹ tại tiệm, KHÔNG tự suy ra kiến thức chuyên môn. Trả lời ngắn (tối đa 5 dòng), văn bản thuần: KHÔNG dùng markdown (**, #, bảng), '
  + 'KHÔNG tự tạo nút hay liên kết kiểu [Đặt lịch], [Book now] — giao diện đã có sẵn nút. Chỉ mời đặt lịch khi khách đang chọn '
  + 'dịch vụ; trả lời câu hỏi thông tin xong là đủ, KHÔNG thêm câu "bấm nút Đặt lịch" vào cuối mọi câu trả lời.';

/** Câu khách gõ hoàn toàn không dấu (có chữ cái nhưng không có ký tự tiếng Việt có dấu). */
export const isUnaccented = (message: string): boolean => /[a-z]/i.test(message) && !/[^\x00-\x7F]/.test(message);

/**
 * Câu dẫn của mô hình cho kiểu trả lời LAI (QA nhập vai 12/10): giữ tối đa 2 câu đầu, bỏ mọi dòng liệt kê và mọi câu có
 * giá / thời lượng (danh sách dịch vụ + giá do dữ liệu quyết định, mô hình không được tự đọc số). Rỗng nếu không còn gì dùng được.
 */
export function leadSentence(text: string): string {
  const prose = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^([•\-*]|\d+[.)])\s/.test(l)).join(' ');
  const sentences = (prose.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [])
    .map((x) => x.trim())
    .filter((x) => x && !/\d[\d.]*\s*(đ|₫|vnd|k\b|nghìn|phút|tiếng)/i.test(x) && !/:\s*$/.test(x) && !/đặt lịch/i.test(x));
  // Một câu, không lặp "Chào bạn" ở mọi lượt (lời chào đã có ở ý định chào hỏi)
  let out = (sentences[0] ?? '').replace(/^(chào bạn|chào chị|chào anh|dạ|vâng)[,!.\s]*/i, '').trim();
  // Câu dẫn dài hay lan man (mô hình 4B: "...khỏe đẹp, sạch bong bóng mỗi ngày đúng không?") → cắt ở dấu phẩy, không được thì bỏ
  if (out.length > 120) {
    const cut = out.lastIndexOf(',', 115);
    out = cut > 40 ? `${out.slice(0, cut).trimEnd()}.` : '';
  }
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

/**
 * Làm sạch câu trả lời của mô hình trước khi trả về giao diện (khung chat hiển thị văn bản thuần): bỏ nút / liên kết giả
 * "**[Đặt lịch]**", "[Book now](…)", markdown (**đậm**, # tiêu đề, ```), token đặc biệt (<|im_end|>) và dòng trống thừa.
 */
/** Câu trả lời thông tin (giải thích, combo, câu tự do) không kết bằng lời mời đặt lịch mô hình bắt chước từ lịch sử. */
export function stripBookingNag(text: string): string {
  return text.split('\n').map((l) => l.replace(/[^.!?\n]*(bấm\s*(nút\s*)?"?(đặt|chọn)|nhấn\s*"?đặt)[^.!?\n]*[.!?]?\s*$/i, '').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Kiểm tra bám dữ liệu (grounding check) cho câu trả lời TỰ DO của mô hình: trả về lý do nếu câu đó khẳng định điều chỉ
 * công cụ tra cứu mới biết — giờ trống / còn chỗ (phải tra lịch thật) hoặc một mức giá không có trong danh mục.
 * Thử thật 12/10: "thế sáng thì sao" rơi vào nhánh tự do, mô hình 4B bịa "còn 12 khung giờ trống: 09:00, 09:15…".
 */
export function ungroundedClaim(text: string, catalog: CatalogItem[]): string | null {
  const t = fold(text);
  if (/\b(khung gio|gio trong|con trong|con cho|con slot|con lich)\b/.test(t) || (t.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length >= 3) return 'availability';
  const prices = new Set(catalog.map((x) => x.price));
  for (const a of catalog) for (const b of catalog) prices.add(a.price + b.price); // tổng 2 dịch vụ khách hỏi cùng lúc
  const money = /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(d|vnd|dong|k|nghin|ngan)\b/g;
  for (let x = money.exec(t); x; x = money.exec(t)) {
    const n = Number(x[1].replace(/[.,]/g, '')) * (/^(k|nghin|ngan)$/.test(x[2]) ? 1000 : 1);
    if (n >= 10_000 && !prices.has(n)) return 'price';
  }
  return null;
}

export function sanitizeLlmAnswer(text: string): string {
  return text
    .replace(/<\|[^|>]{1,40}\|>/g, '') // <|im_end|>, <|eot_id|>…
    .replace(/<\/?(think|answer|response)>/gi, '')
    .replace(/```[a-z]*\n?/gi, '')
    // Nút / liên kết giả: [Đặt lịch], [Đặt lịch ngay](https://…), [Book now] — bỏ hẳn (kể cả dấu ** bao quanh)
    .replace(/\**\[\s*(đặt lịch|dat lich|đặt ngay|đặt hẹn|book( now)?|booking|xem thêm|xem chi tiết|liên hệ|gọi ngay|chọn)[^\]]{0,30}\](\([^)]*\))?\**/gi, '')
    .replace(/\[([^\]\n]{1,80})\]\((?:https?:\/\/|\/)[^)]*\)/g, '$1') // [chữ](url) → chữ
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*{2,}|_{2,}/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
