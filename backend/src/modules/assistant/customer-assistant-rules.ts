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
}

/** Chính sách cọc chống bùng lịch — khớp frontend/src/utils/opsHelpers.ts (DEPOSIT_THRESHOLD, depositAmount). */
export const DEPOSIT_THRESHOLD = 500_000;
export const DEPOSIT_PERCENT = 30;

export type CustomerIntent =
  | 'greeting' | 'identity' | 'help' | 'thanks' | 'bye' | 'price_list' | 'hot' | 'book' | 'hours' | 'contact' | 'need' | 'unknown'
  | 'combo_info' | 'explain' | 'service_price' | 'availability' | 'service_duration' | 'service_detail' | 'budget' | 'deposit'
  | 'not_offered' | 'group_booking' | 'stylists' | 'cancel_policy' | 'payment' | 'promotion'
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
  'identity', 'help', 'not_offered', 'group_booking', 'stylists', 'contact', 'deposit', 'cancel_policy', 'payment', 'promotion',
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
  pending?: { kind: 'availability'; serviceId: string; when: WhenQuery };
}

/** Nhu cầu → từ khoá (không dấu). Khớp với tên / nhóm / mô tả dịch vụ trong danh mục THẬT của tiệm. */
const NEEDS: { label: string; ask: RegExp; words: string[] }[] = [
  { label: 'tóc', ask: /\b(toc|cat|goi dau|nhuom|uon|duoi|phuc hoi|hu ton|xoan|tay toc|highlight|balayage|ombre|phu bac|toc bac|keratin|olaplex|rung toc|barber|rau)\b/, words: ['toc', 'cat', 'goi', 'nhuom', 'uon', 'duoi', 'phuc hoi', 'hap', 'barber', 'rau'] },
  { label: 'da', ask: /\b(da(?! nong)|da mat|mat na|mun|tham mun|lam sang|duong da|facial|cham soc da|lo chan long|kho da|da dau|cap am|dien di|peel|tre hoa|vitamin c)\b/, words: ['da', 'mat', 'facial', 'mun', 'duong', 'sang', 'cap am', 'peel', 'collagen'] },
  { label: 'massage', ask: /\b(massage|mat xa|matxa|thu gian|dau lung|moi vai|co vai gay|vai gay|body|xong hoi|da nong|bam huyet|tam trang|phi thuyen|ngam chan)\b/, words: ['massage', 'mat xa', 'thu gian', 'body', 'vai gay', 'xong', 'da nong', 'bam huyet', 'tam trang'] },
  { label: 'móng', ask: /\b(nail|mong|son gel|son mong|ve mong|mong tay|mong chan|dap bot|up mong|manicure|pedicure)\b/, words: ['nail', 'mong', 'son', 'manicure', 'pedicure'] },
  { label: 'gội dưỡng', ask: /\b(goi duong|goi thao duoc|u toc|hap dau|duong toc|gau|da dau)\b/, words: ['goi', 'duong', 'u toc', 'hap', 'da dau'] },
  { label: 'trang điểm', ask: /\b(trang diem|make ?up|co dau|ky yeu|noi mi|long mi)\b/, words: ['trang diem', 'co dau', 'ky yeu', 'mi'] },
];

/** Triệu chứng cụ thể → dịch vụ chuyên trị (trọng số cao hơn nhu cầu chung "tóc" / "da"). */
const SYMPTOMS: { ask: RegExp; words: string[] }[] = [
  { ask: /\b(kho xo|xo roi|hu ton|che ngon|gay rung|toc yeu|toc kho|phuc hoi|nhuom nhieu|tay nhieu)\b/, words: ['phuc hoi', 'hap', 'u', 'duong'] },
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
export function matchServices(message: string, catalog: CatalogItem[], limit = 4, strict = false, ratio = 0.6): CatalogItem[] {
  const m = normalize(message);
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
    if (strict) return { s, score: byName };
    let score = byName;
    const has = (w: string) => new RegExp(`\\b${w}\\b`).test(t);
    for (const n of needs) if (n.words.some(has)) score += 3;
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
const HOURS_RE = /\b(gio mo cua|mo cua|dong cua|lam viec den|gio lam viec|may gio (mo|dong|nghi)|co lam (khong|ko)|nghi (khong|ko)|lam den may gio)\b/;
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
    const items = catalog.filter((s) => g.cat.test(fold(s.categoryName)) || (g.label === 'combo' && g.cat.test(fold(s.name))));
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
function isSpecific(m: string, s: CatalogItem): boolean {
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

  // 0. Dịch vụ tiệm KHÔNG làm ("có nối tóc không") — nói thật, không gợi ý dịch vụ "na ná" như thể tiệm có làm
  const notOffered = NOT_OFFERED.find(([re]) => re.test(m) && !catalog.some((s) => re.test(fold(`${s.name} ${s.description ?? ''}`))));
  if (notOffered) return { intent: 'not_offered', matches: [], label: notOffered[1] };
  // 1. Giờ trống (tra thật ở máy chủ) — trước mọi thứ khác: "massage chân hôm nay còn những giờ nào" không phải liệt kê nhóm
  const when = parseWhen(m, today);
  if (AVAILABILITY_RE.test(m) || (BOOK_RE.test(m) && (when.time || when.explicitDate || when.part))
    // "chủ nhật này 10h sáng cắt tóc nữ được không"
    || ((when.time || when.part) && when.explicitDate && focus.length && /\b(duoc|khong|ko|chua|nhe|a)\b/.test(m))) {
    return { intent: 'availability', matches: focus, scope, when };
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
  if (fact) {
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
  const det = detectCustomerIntent(message, catalog, { ...opts, today });
  const { intent, matches } = det;
  const m = fold(message);
  // Lượt đặt thật (máy chủ truyền vào); không có thì suy thứ hạng từ hotIds — khi đó KHÔNG in số lượt (không bịa con số)
  const realCounts = !!opts.popularity;
  const pop: Record<string, number> = opts.popularity ?? Object.fromEntries(hotIds.map((id, i) => [id, hotIds.length - i]));
  const hot = hotIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
  const popular = (hot.length ? hot : catalog).slice(0, 4);
  const shop = facts.name || 'tiệm';
  const reply = (answer: string, suggestions: CatalogItem[] = [], quickReplies = QUICK, extra: Partial<CustomerReply> = {}): CustomerReply =>
    ({ intent, answer, suggestions, quickReplies, ...extra });

  if (CATALOG_FACT_INTENTS.has(intent)) {
    const fact = catalogFactReply(intent as CatalogFactIntent, message, catalog, shop, det.scope ?? null);
    return reply(fact.answer, fact.suggestions, ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay']);
  }

  switch (intent) {
    case 'availability': {
      // Câu trả lời thật do máy chủ điền sau khi tra giờ trống (pending); đây là câu dự phòng khi không tra được
      const service = matches[0] ?? null;
      if (!service) {
        const options = det.scope ? catalogStats(det.scope.items).byPrice.slice(0, 3) : popular.slice(0, 3);
        return reply(`Bạn muốn xem giờ trống ${dayText(det.when!.date, today)} cho dịch vụ nào? `
          + `Chọn một dịch vụ${det.scope ? ` trong nhóm ${det.scope.label}` : ''} bên dưới hoặc gõ tên dịch vụ nhé.`, options, ['Xem bảng giá', 'Dịch vụ hot']);
      }
      return reply(`Bạn bấm "Đặt" ở ${service.name} rồi chọn ngày ${dayText(det.when!.date)} để xem giờ trống nhé.`, [service],
        ['Ngày mai còn giờ nào?', 'Xem bảng giá'], { pending: { kind: 'availability', serviceId: service.id, when: det.when! } });
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
    case 'promotion':
      return reply('Nếu có mã giảm giá, bạn đưa mã cho lễ tân khi thanh toán — mỗi hoá đơn áp dụng một mã, có mã yêu cầu giá trị '
        + `đơn tối thiểu. Ưu đãi đang áp dụng bạn hỏi nhanh qua ${facts.hotline || 'hotline của tiệm'} nhé.`);
    case 'book':
      return matches.length
        ? reply(`Mình tìm thấy dịch vụ phù hợp:\n${matches.slice(0, 3).map(line).join('\n')}\nBấm "Đặt" — mình điền sẵn vào phiếu, bạn chỉ cần chọn giờ.`, matches.slice(0, 3),
          ['Hôm nay còn giờ nào?', 'Xem bảng giá'])
        : reply('Bạn muốn đặt dịch vụ nào? Gõ tên dịch vụ hoặc nhu cầu (vd. "cắt tóc nữ", "mỏi vai gáy"), hoặc chọn nhanh một dịch vụ hot bên dưới.',
          popular.slice(0, 3), ['Xem bảng giá', 'Dịch vụ hot']);
    case 'hours': {
      const asked = det.when?.explicitDate ? dayHours(facts, det.when.date) : null;
      if (asked) return reply(`${asked} Muốn biết ngày đó còn giờ trống không, bạn hỏi mình kèm tên dịch vụ (vd. "cắt tóc nữ ngày đó còn giờ nào") nhé.`);
      const hours = facts.openingHours.map((h) => `${h.dayLabel}: ${h.isClosed ? 'nghỉ' : `${h.openTime.slice(0, 5)}–${h.closeTime.slice(0, 5)}`}`);
      return reply(hours.length ? `Giờ mở cửa của ${shop}:\n${hours.join('\n')}` : `Bạn gọi ${facts.hotline} để hỏi giờ mở cửa giúp mình nhé.`);
    }
    case 'contact':
      return reply(`${shop}\n📍 ${facts.address}\n☎ ${facts.hotline}\nBạn có thể đặt lịch online ngay tại đây, không cần gọi điện.`);
    case 'need': {
      const list = matches.slice(0, 3);
      const totalMin = list[0]?.durationMinutes ?? 0;
      return reply(`Với nhu cầu của bạn, mình gợi ý:\n${list.map(line).join('\n')}\n`
        + `${totalMin >= 90 ? 'Dịch vụ khá lâu, bạn nên đặt buổi sáng hoặc đầu giờ chiều. ' : ''}Bấm "Đặt" ở dịch vụ ưng ý nhé.`, list,
      ['Hôm nay còn giờ nào?', 'Xem bảng giá']);
    }
    default:
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
  if (out.length > 170) {
    const cut = out.lastIndexOf(',', 165);
    out = `${out.slice(0, cut > 60 ? cut : 165).trimEnd()}.`;
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
