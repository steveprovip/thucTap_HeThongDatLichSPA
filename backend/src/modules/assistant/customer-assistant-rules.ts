/**
 * TASK v3 · NV1 — "AI tư vấn khách" trên trang công khai: hàm THUẦN để kiểm thử và để trợ lý vẫn tư vấn được khi chưa
 * cấu hình mô hình ngôn ngữ. Chỉ dùng DANH MỤC CÔNG KHAI (tên, thời lượng, giá) + giờ mở cửa + hotline — không có dữ liệu
 * cá nhân nào. Câu trả lời luôn kèm dịch vụ gợi ý để khách bấm một chạm điền vào wizard đặt lịch.
 */
import { fold, partOfDay, smallTalkIntent } from './assistant-rules';
import { formatVnd } from '../../common/utils/currency.util';

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
}

/** Chính sách cọc chống bùng lịch — khớp frontend/src/utils/opsHelpers.ts (DEPOSIT_THRESHOLD, depositAmount). */
export const DEPOSIT_THRESHOLD = 500_000;
export const DEPOSIT_PERCENT = 30;

export type CustomerIntent =
  | 'greeting' | 'identity' | 'help' | 'thanks' | 'bye' | 'price_list' | 'hot' | 'book' | 'hours' | 'contact' | 'need' | 'unknown'
  | 'combo_info' | 'explain' | 'service_price' | 'deposit' | 'cancel_policy' | 'payment' | 'promotion'
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
  ...CATALOG_FACT_INTENTS, 'hot', 'price_list', 'service_price', 'hours', 'contact', 'deposit', 'cancel_policy', 'payment', 'promotion',
]);

export const CARD_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  'need', 'book', 'hot', 'service_price', 'cheapest_service', 'priciest_service', 'fastest_service', 'longest_service', 'filter_by_group',
]);

export interface CustomerReply {
  intent: CustomerIntent;
  answer: string;
  suggestions: CatalogItem[];
  quickReplies: string[];
}

/** Nhu cầu → từ khoá (không dấu). Khớp với tên / nhóm / mô tả dịch vụ trong danh mục THẬT của tiệm. */
const NEEDS: { label: string; ask: RegExp; words: string[] }[] = [
  { label: 'tóc', ask: /\b(toc|cat|goi dau|goi|nhuom|uon|duoi|phuc hoi|hu ton|xoan|tay toc|highlight|balayage|ombre|phu bac|toc bac|keratin|olaplex|rung toc|barber|rau)\b/, words: ['toc', 'cat', 'goi', 'nhuom', 'uon', 'duoi', 'phuc hoi', 'hap', 'barber', 'rau'] },
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
  { ask: /\b(moi|dau lung|co vai gay|vai gay|met moi|cang thang|stress|mat ngu|thu gian)\b/, words: ['massage', 'vai gay', 'duong sinh', 'thu gian'] },
  { ask: /\b(du tiec|di tiec|dam cuoi|chup anh|su kien)\b/, words: ['trang diem', 'tiec'] },
];

const STOP = new Set(['toi', 'minh', 'em', 'anh', 'chi', 'ban', 'muon', 'can', 'cho', 'voi', 'la', 'co', 'khong', 'gi', 'nao',
  'bao', 'nhieu', 'tien', 'gia', 'lam', 'dich', 'vu', 'shop', 'tiem', 'oi', 'a', 'nhe', 'di', 'duoc', 'va', 'hay', 'thi', 'mot', 'cai',
  // QA 12/10: tính từ / từ nối chung không được khớp tên dịch vụ ("uốn NÓNG" từng kéo theo "Combo ... đá NÓNG")
  'nong', 'lanh', 'dep', 'tot', 'xau', 'nhanh', 'lau', 'moi', 'cu', 'nho', 'lon', 'khac', 'nhau', 'nen', 'hon', 'nhat', 'kieu', 'loai']);

const textOf = (s: CatalogItem): string => fold(`${s.name} ${s.categoryName} ${s.description ?? ''}`);

/** Chấm điểm dịch vụ theo câu khách hỏi: khớp nhu cầu + khớp chữ trong tên. */
/**
 * `strict`: chỉ lấy dịch vụ khớp THEO TÊN (đúng tên / cụm từ / từ trong tên) — dùng cho câu giải thích, không kéo theo
 * cả nhóm "tóc" chỉ vì câu có nhắc tới tóc.
 */
export function matchServices(message: string, catalog: CatalogItem[], limit = 4, strict = false): CatalogItem[] {
  const m = fold(message);
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
    let score = 0;
    if (name.length >= 4 && m.includes(name)) score += 10; // gọi đúng tên dịch vụ
    const has = (w: string) => new RegExp(`\\b${w}\\b`).test(t);
    for (const n of needs) if (n.words.some(has)) score += 3;
    const inName = (w: string) => new RegExp(`\\b${w}\\b`).test(name);
    for (const sy of symptoms) if (sy.words.some(inName)) score += 10; else if (sy.words.some(has)) score += 4;
    let byName = name.length >= 4 && m.includes(name) ? 1 : 0;
    for (const tok of tokens) if (tok.length >= 3 && words.has(tok)) { score += 2; byName += 1; } // trọn từ: "ai" không khớp "vai"
    for (const bg of bigrams) if (new RegExp(`\\b${bg}\\b`).test(name)) { score += 4; byName += 1; }
    return { s, score: strict && !byName ? 0 : score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.s.price - b.s.price);
  // Bỏ gợi ý "ăn theo" yếu (chỉ khớp một chữ chung) khi đã có dịch vụ khớp rõ ràng
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score >= top * 0.6).slice(0, limit).map((x) => x.s);
}

/** Nhóm dịch vụ khách hay hỏi → nhận diện trong câu hỏi (`ask`) và trong tên danh mục / tên dịch vụ (`cat`). */
const GROUPS: { label: string; ask: RegExp; cat: RegExp }[] = [
  { label: 'combo', ask: /\b(combo|goi combo|lieu trinh|goi tiet kiem)\b/, cat: /\b(combo|lieu trinh)\b/ },
  { label: 'gội đầu', ask: /\b(goi dau|goi duong|duong sinh)\b/, cat: /\bgoi dau\b/ },
  { label: 'tóc', ask: /\b(toc|cat toc|uon|nhuom|duoi toc)\b/, cat: /\b(toc|uon|nhuom)\b/ },
  { label: 'chăm sóc da', ask: /\b(cham soc da|da mat|dich vu da|lam da|skin ?care|facial)\b/, cat: /\bcham soc da\b/ },
  { label: 'massage', ask: /\b(massage|mat xa|matxa|body)\b/, cat: /\b(massage|body)\b/ },
  { label: 'móng', ask: /\b(nail|mong|mong tay|mong chan|manicure|pedicure)\b/, cat: /\b(nail|mong)\b/ },
  { label: 'trang điểm', ask: /\b(trang diem|make ?up|noi mi)\b/, cat: /\b(trang diem|noi mi)\b/ },
];

const FACT_RE: { intent: Exclude<CatalogFactIntent, 'filter_by_group'>; re: RegExp }[] = [
  { intent: 'count_services', re: /(bao nhieu|may|tong (cong|so)|so luong)( loai| cai| goi)? (dich vu|danh muc|nhom)|(dich vu|danh muc)( \w+){0,3} (co )?(bao nhieu|may)\b|co (tat ca|tong cong) bao nhieu/ },
  { intent: 'cheapest_service', re: /(re nhat|gia (thap|mem|re) nhat|thap nhat|it tien nhat|binh dan nhat|tiet kiem nhat)/ },
  // "được đặt nhất" (= nhiều người đặt) cũng gập thành "dat nhat" → không phải hỏi giá đắt nhất
  { intent: 'priciest_service', re: /((?<!(duoc|hay|khach|nguoi|chon) )dat nhat|gia cao nhat|mac nhat|dat tien nhat|cao cap nhat|vip nhat|xin nhat|sang nhat)/ },
  { intent: 'fastest_service', re: /(nhanh nhat|it thoi gian nhat|ngan nhat|lam nhanh nhat|mat it thoi gian)/ },
  { intent: 'longest_service', re: /(lau nhat|dai nhat|ton (nhieu )?thoi gian nhat|nhieu thoi gian nhat|mat nhieu thoi gian nhat)/ },
];
const LIST_RE = /(co (nhung |cac )?(dich vu|gi|combo|goi)|(nhung|cac) (combo|goi)( \w+)? nao|nhung dich vu|cac dich vu|liet ke|danh sach|gom (nhung )?gi|bao gom|co nhung gi|xem (cac )?dich vu)/;
const HOT_RE = /(\bhot\b|noi bat|pho bien|ban chay|nhieu nguoi|dat nhieu|duoc (yeu thich|chuong|dat nhieu|dat nhat)|best ?seller|nen thu|hay dat|dat nhieu nhat)/;
const COMBO_RE = /\b(combo|goi combo|goi tiet kiem|lieu trinh)\b/;
/** "combo có gì khác so với bình thường", "combo lợi gì hơn đặt lẻ", "combo là gì"… → giải thích, không liệt kê thẻ. */
const COMBO_INFO_RE = /(khac (gi|nhau|biet)|khac so voi|so voi|loi (ich|gi|hon)|co loi|tiet kiem (hon|duoc|bao nhieu)|\bla gi\b|nghia la|nen chon|hon (gi|khong)|dat le|lam le|binh thuong|co gi (hay|dac biet|khac))/;
/** Câu hỏi so sánh / giải thích ("uốn lạnh với uốn nóng khác gì", "keratin là gì", "có hại tóc không") → trả lời bình thường. */
const PRICE_RE = /(gia (bao nhieu|the nao|sao|nhieu|bn)|bao nhieu tien|bao tien|het bao nhieu|ton bao nhieu|gia ca|bao nhieu vay|bao nhieu a)/;
const EXPLAIN_RE = /(khac (gi|nhau|biet|cho nao)|khac so voi|so voi|giong (nhau|gi)|\bla gi\b|nghia la|co hai|hai (toc|da) khong|an toan khong|giu (duoc )?bao lau|duoc bao lau|bao lau thi)/;
const POLICY_RE: { intent: 'deposit' | 'cancel_policy' | 'payment' | 'promotion'; re: RegExp }[] = [
  { intent: 'deposit', re: /\b(coc|dat coc|tien coc|giu cho bang tien|tra truoc)\b/ },
  { intent: 'cancel_policy', re: /\b(huy (lich|hen|dat)|muon huy|doi (lich|gio|ngay|hen)|doi sang|hoan lich|tra cuu|xem lai lich|kiem tra lich)\b/ },
  { intent: 'payment', re: /\b(thanh toan|chuyen khoan|tien mat|quet ma|qr|the (ngan hang|tin dung)|momo|vnpay|tra tien)\b/ },
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
  if (LIST_RE.test(m) && !HOT_RE.test(m) && !(COMBO_RE.test(m) && COMBO_INFO_RE.test(m)) && groupScope(message, catalog)) {
    return 'filter_by_group';
  }
  return null;
}

export function detectCustomerIntent(message: string, catalog: CatalogItem[]): { intent: CustomerIntent; matches: CatalogItem[] } {
  const m = fold(message);
  const fact = catalogFactIntent(message, catalog);
  if (fact) return { intent: fact, matches: [] };
  if (COMBO_RE.test(m) && COMBO_INFO_RE.test(m)) return { intent: 'combo_info', matches: [] };
  const policy = POLICY_RE.find((x) => x.re.test(m));
  if (policy) return { intent: policy.intent, matches: [] };
  if (EXPLAIN_RE.test(m)) return { intent: 'explain', matches: [] };
  const matches = matchServices(message, catalog);
  if (/(bang gia|xem gia|gia ca|price|menu|danh sach dich vu|co nhung dich vu|tat ca dich vu)/.test(m)) return { intent: 'price_list', matches };
  if (HOT_RE.test(m)) return { intent: 'hot', matches };
  // "massage đá nóng giá bao nhiêu" → giá lấy thẳng từ bảng giá (không để mô hình đọc lại con số)
  if (PRICE_RE.test(m) && matches.length) return { intent: 'service_price', matches };
  if (/(dat lich|dat cho|dat hen|book|giu cho|hen gio|muon den|dat ngay)/.test(m)) return { intent: 'book', matches };
  if (/(may gio|gio mo cua|mo cua|dong cua|lam viec den|gio lam|chu nhat|thu bay|cuoi tuan co lam)/.test(m) && !matches.length) return { intent: 'hours', matches };
  if (/(dia chi|o dau|cho nao|duong nao|hotline|so dien thoai|lien he|ban do|zalo)/.test(m)) return { intent: 'contact', matches };
  const small = smallTalkIntent(message);
  // "chào shop, tư vấn da mụn" → nhu cầu thắng câu chào; "bạn là ai" không có nhu cầu → xã giao
  if (small && !NEEDS.some((n) => n.ask.test(m)) && !SYMPTOMS.some((x) => x.ask.test(m))) return { intent: small, matches: [] };
  if (matches.length) return { intent: 'need', matches };
  return { intent: 'unknown', matches };
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
function catalogFactReply(intent: CatalogFactIntent, message: string, catalog: CatalogItem[], shop: string): { answer: string; suggestions: CatalogItem[] } {
  const scope = groupScope(message, catalog);
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
    const head = ties.length > 1
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

export function customerRuleReply(
  message: string, catalog: CatalogItem[], hotIds: string[], facts: SalonFacts, now?: Date,
): CustomerReply {
  const { intent, matches } = detectCustomerIntent(message, catalog);
  const hot = hotIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
  const popular = (hot.length ? hot : catalog).slice(0, 4);
  const shop = facts.name || 'tiệm';
  const reply = (answer: string, suggestions: CatalogItem[] = [], quickReplies = QUICK): CustomerReply =>
    ({ intent, answer, suggestions, quickReplies });

  if (CATALOG_FACT_INTENTS.has(intent)) {
    const fact = catalogFactReply(intent as CatalogFactIntent, message, catalog, shop);
    return reply(fact.answer, fact.suggestions, ['Xem bảng giá', 'Dịch vụ hot', 'Đặt lịch ngay']);
  }

  switch (intent) {
    case 'greeting':
      return reply(`Chào bạn!${now ? ` Chúc bạn buổi ${partOfDay(now)} thật thư thái.` : ''} Mình là chuyên viên tư vấn của ${shop} 🌿 `
        + 'Bạn đang muốn chăm sóc tóc, da, massage thư giãn hay làm móng? '
        + 'Kể mình nghe nhu cầu, mình gợi ý dịch vụ kèm giá và thời lượng nhé.', [], ['Tư vấn chăm sóc tóc', 'Tư vấn chăm sóc da', 'Massage thư giãn']);
    case 'bye':
      return reply(`Cảm ơn bạn đã ghé ${shop}! Hẹn gặp bạn tại tiệm — khi cần cứ bấm "Đặt lịch ngay" hoặc nhắn mình nhé 🌸`);
    case 'identity':
      return reply(`Mình là trợ lý tư vấn tự động của ${shop}. Mình giúp bạn chọn dịch vụ hợp nhu cầu, báo giá và thời lượng, `
        + 'rồi điền sẵn vào phiếu đặt lịch — bạn chỉ cần chọn giờ và để lại số điện thoại. Mình không cần tài khoản hay thông tin cá nhân của bạn.');
    case 'help':
      return reply('Đặt lịch chỉ 4 bước: (1) chọn dịch vụ → (2) chọn ngày giờ còn trống → (3) chọn thợ hoặc để tiệm xếp → '
        + '(4) nhập tên, số điện thoại. Bạn cứ nói nhu cầu (vd. "tóc khô xơ", "đau mỏi vai gáy"), mình gợi ý dịch vụ rồi bấm '
        + '"Đặt lịch với dịch vụ này" là xong phần chọn dịch vụ.');
    case 'thanks':
      return reply('Không có gì ạ! Khi cần, bạn bấm "Đặt lịch ngay" hoặc hỏi mình thêm nhé.');
    case 'price_list': {
      const byCat = new Map<string, CatalogItem[]>();
      for (const s of catalog) byCat.set(s.categoryName, [...(byCat.get(s.categoryName) ?? []), s]);
      const parts = Array.from(byCat.entries()).slice(0, 6).map(([cat, list]) =>
        `${cat}:\n${list.slice(0, 3).map(line).join('\n')}${list.length > 3 ? `\n  …và ${list.length - 3} dịch vụ khác` : ''}`);
      return reply(parts.length ? `Bảng giá ${shop} (giá tạm tính, tiệm chốt khi thanh toán):\n${parts.join('\n')}`
        : 'Hiện tiệm chưa mở dịch vụ nào để đặt online, bạn gọi hotline giúp mình nhé.', [], ['Dịch vụ hot', 'Combo có gì hot?', 'Đặt lịch ngay']);
    }
    case 'hot': {
      // "combo có gì hot?" → dịch vụ hot TRONG nhóm combo (theo lượt đặt 90 ngày), không phải toàn bộ danh mục
      const scope = groupScope(message, catalog);
      if (scope) {
        const inScope = new Set(scope.items.map((s) => s.id));
        const hotIn = hot.filter((s) => inScope.has(s.id)).slice(0, 3);
        const list = hotIn.length ? hotIn : catalogStats(scope.items).byPrice.slice(0, 3);
        return reply(hotIn.length
          ? `Nhóm ${scope.label} được đặt nhiều nhất gần đây:\n${list.map(line).join('\n')}`
          : `Nhóm ${scope.label} chưa có đủ lượt đặt để xếp hạng, các lựa chọn hiện có:\n${list.map(line).join('\n')}`,
        list, ['Xem bảng giá', 'Đặt lịch ngay']);
      }
      return reply(popular.length ? `Dịch vụ được đặt nhiều nhất gần đây:\n${popular.slice(0, 3).map(line).join('\n')}`
        : 'Tiệm chưa có dịch vụ nào đang mở đặt online.', popular.slice(0, 3), ['Xem bảng giá', 'Combo có gì hot?', 'Đặt lịch ngay']);
    }
    case 'explain': {
      // Chế độ luật không tự giải thích chuyên môn được → nói thật, đưa dịch vụ liên quan để khách tự xem (không chèn thẻ)
      const related = matchServices(message, catalog, 3, true);
      // Chỉ dựa trên MÔ TẢ DỊCH VỤ do chủ tiệm khai báo; không tự suy kiến thức chuyên môn
      return reply(related.length
        ? `Theo mô tả dịch vụ của tiệm:\n${related.map((s) => `• ${s.name}: ${s.description ?? 'chưa có mô tả'} (${s.durationMinutes} phút · ${s.priceText})`).join('\n')}\n`
          + `Chuyên viên sẽ tư vấn kỹ theo tình trạng tóc / da của bạn tại tiệm hoặc qua ${facts.hotline || 'hotline'}.`
        : `Câu này cần chuyên viên tư vấn kỹ theo tình trạng tóc / da của bạn — bạn gọi ${facts.hotline || 'hotline của tiệm'} `
          + 'hoặc hỏi trực tiếp khi đến tiệm nhé.', [], ['Xem bảng giá', 'Dịch vụ hot']);
    }
    case 'service_price': {
      const list = matches.slice(0, 3);
      return reply(list.length === 1
        ? `${list[0].name}: ${list[0].priceText}, khoảng ${list[0].durationMinutes} phút (giá tạm tính, tiệm chốt khi thanh toán).`
        : `Giá tại tiệm (tạm tính, tiệm chốt khi thanh toán):\n${list.map(line).join('\n')}`, list, ['Xem bảng giá', 'Đặt lịch ngay']);
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
      return reply('Tiệm nhận tiền mặt hoặc chuyển khoản (quét mã VietQR tại quầy). Bạn thanh toán sau khi làm xong dịch vụ; '
        + `riêng lịch trên ${formatVnd(DEPOSIT_THRESHOLD)} cần cọc trước ${DEPOSIT_PERCENT}% và tiền cọc được trừ vào hoá đơn.`);
    case 'promotion':
      return reply('Nếu có mã giảm giá, bạn đưa mã cho lễ tân khi thanh toán — mỗi hoá đơn áp dụng một mã, có mã yêu cầu giá trị '
        + `đơn tối thiểu. Ưu đãi đang áp dụng bạn hỏi nhanh qua ${facts.hotline || 'hotline của tiệm'} nhé.`);
    case 'book':
      return matches.length
        ? reply(`Mình tìm thấy dịch vụ phù hợp:\n${matches.map(line).join('\n')}\nChọn dịch vụ rồi bấm "Đặt lịch" — mình điền sẵn vào phiếu, bạn chỉ cần chọn giờ.`, matches)
        : reply('Bạn muốn đặt dịch vụ nào? Chọn nhanh một dịch vụ hot bên dưới, hoặc bấm "Mở trang đặt lịch" để tự chọn.', popular, ['Xem bảng giá', 'Dịch vụ hot']);
    case 'hours': {
      const hours = facts.openingHours.map((h) => `${h.dayLabel}: ${h.isClosed ? 'nghỉ' : `${h.openTime.slice(0, 5)}–${h.closeTime.slice(0, 5)}`}`);
      return reply(hours.length ? `Giờ mở cửa của ${shop}:\n${hours.join('\n')}` : `Bạn gọi ${facts.hotline} để hỏi giờ mở cửa giúp mình nhé.`);
    }
    case 'contact':
      return reply(`${shop}\n📍 ${facts.address}\n☎ ${facts.hotline}\nBạn có thể đặt lịch online ngay tại đây, không cần gọi điện.`);
    case 'need': {
      const totalMin = matches[0]?.durationMinutes ?? 0;
      return reply(`Với nhu cầu của bạn, mình gợi ý:\n${matches.map(line).join('\n')}\n`
        + `${totalMin >= 90 ? 'Dịch vụ khá lâu, bạn nên đặt buổi sáng hoặc đầu giờ chiều. ' : ''}Chọn dịch vụ ưng ý rồi bấm "Đặt lịch" nhé.`, matches);
    }
    default:
      return reply('Mình chưa rõ bạn cần gì 😊 Bạn mô tả giúp mình nhu cầu (vd. "tóc hư tổn", "da mụn", "mỏi vai gáy") '
        + 'hoặc chọn nhanh bên dưới nhé.', [], ['Xem bảng giá', 'Dịch vụ hot', 'Tư vấn chăm sóc tóc']);
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

/**
 * Làm sạch câu trả lời của mô hình trước khi trả về giao diện (khung chat hiển thị văn bản thuần): bỏ nút / liên kết giả
 * "**[Đặt lịch]**", "[Book now](…)", markdown (**đậm**, # tiêu đề, ```), token đặc biệt (<|im_end|>) và dòng trống thừa.
 */
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
