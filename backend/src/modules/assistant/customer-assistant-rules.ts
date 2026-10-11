/**
 * TASK v3 · NV1 — "AI tư vấn khách" trên trang công khai: hàm THUẦN để kiểm thử và để trợ lý vẫn tư vấn được khi chưa
 * cấu hình mô hình ngôn ngữ. Chỉ dùng DANH MỤC CÔNG KHAI (tên, thời lượng, giá) + giờ mở cửa + hotline — không có dữ liệu
 * cá nhân nào. Câu trả lời luôn kèm dịch vụ gợi ý để khách bấm một chạm điền vào wizard đặt lịch.
 */
import { fold, partOfDay, smallTalkIntent } from './assistant-rules';

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
}

export type CustomerIntent =
  | 'greeting' | 'identity' | 'help' | 'thanks' | 'bye' | 'price_list' | 'hot' | 'book' | 'hours' | 'contact' | 'need' | 'unknown';

export interface CustomerReply {
  intent: CustomerIntent;
  answer: string;
  suggestions: CatalogItem[];
  quickReplies: string[];
}

/** Nhu cầu → từ khoá (không dấu). Khớp với tên / nhóm / mô tả dịch vụ trong danh mục THẬT của tiệm. */
const NEEDS: { label: string; ask: RegExp; words: string[] }[] = [
  { label: 'tóc', ask: /\b(toc|cat|goi dau|goi|nhuom|uon|duoi|phuc hoi|hu ton|xoan|tay toc|highlight|balayage|ombre|phu bac|toc bac|keratin|olaplex|rung toc|barber|rau)\b/, words: ['toc', 'cat', 'goi', 'nhuom', 'uon', 'duoi', 'phuc hoi', 'hap', 'barber', 'rau'] },
  { label: 'da', ask: /\b(da|da mat|mat na|mun|tham mun|lam sang|duong da|facial|cham soc da|lo chan long|kho da|da dau|cap am|dien di|peel|tre hoa|vitamin c)\b/, words: ['da', 'mat', 'facial', 'mun', 'duong', 'sang', 'cap am', 'peel', 'collagen'] },
  { label: 'massage', ask: /\b(massage|mat xa|matxa|thu gian|dau lung|moi vai|co vai gay|vai gay|body|xong hoi|da nong|bam huyet|tam trang|phi thuyen|ngam chan)\b/, words: ['massage', 'mat xa', 'thu gian', 'body', 'vai gay', 'xong', 'da nong', 'bam huyet', 'tam trang'] },
  { label: 'móng', ask: /\b(nail|mong|son gel|son mong|ve mong|mong tay|mong chan|dap bot|up mong|manicure|pedicure)\b/, words: ['nail', 'mong', 'son', 'manicure', 'pedicure'] },
  { label: 'gội dưỡng', ask: /\b(goi duong|goi thao duoc|u toc|hap dau|duong toc|gau|da dau)\b/, words: ['goi', 'duong', 'u toc', 'hap', 'da dau'] },
  { label: 'trang điểm', ask: /\b(trang diem|make ?up|co dau|ky yeu|noi mi|long mi)\b/, words: ['trang diem', 'co dau', 'ky yeu', 'mi'] },
];

/** Triệu chứng cụ thể → dịch vụ chuyên trị (trọng số cao hơn nhu cầu chung "tóc" / "da"). */
const SYMPTOMS: { ask: RegExp; words: string[] }[] = [
  { ask: /\b(kho xo|xo roi|hu ton|che ngon|gay rung|toc yeu|toc kho|phuc hoi|nhuom nhieu|tay nhieu)\b/, words: ['phuc hoi', 'hap', 'u', 'duong'] },
  { ask: /\b(mun|tham mun|da dau|lo chan long)\b/, words: ['mun', 'tri', 'lam sach'] },
  { ask: /\b(moi|dau lung|co vai gay|vai gay|met moi|cang thang|stress|mat ngu|thu gian)\b/, words: ['massage', 'vai gay', 'duong sinh', 'thu gian'] },
  { ask: /\b(du tiec|di tiec|dam cuoi|chup anh|su kien)\b/, words: ['trang diem', 'tiec'] },
];

const STOP = new Set(['toi', 'minh', 'em', 'anh', 'chi', 'ban', 'muon', 'can', 'cho', 'voi', 'la', 'co', 'khong', 'gi', 'nao',
  'bao', 'nhieu', 'tien', 'gia', 'lam', 'dich', 'vu', 'shop', 'tiem', 'oi', 'a', 'nhe', 'di', 'duoc', 'va', 'hay', 'thi', 'mot', 'cai']);

const textOf = (s: CatalogItem): string => fold(`${s.name} ${s.categoryName} ${s.description ?? ''}`);

/** Chấm điểm dịch vụ theo câu khách hỏi: khớp nhu cầu + khớp chữ trong tên. */
export function matchServices(message: string, catalog: CatalogItem[], limit = 4): CatalogItem[] {
  const m = fold(message);
  const needs = NEEDS.filter((n) => n.ask.test(m));
  const symptoms = SYMPTOMS.filter((x) => x.ask.test(m));
  const tokens = m.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
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
    for (const tok of tokens) if (tok.length >= 3 && words.has(tok)) score += 2; // trọn từ: "ai" không khớp "vai"
    return { s, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.s.price - b.s.price);
  // Bỏ gợi ý "ăn theo" yếu (chỉ khớp một chữ chung) khi đã có dịch vụ khớp rõ ràng
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score * 2 >= top).slice(0, limit).map((x) => x.s);
}

export function detectCustomerIntent(message: string, catalog: CatalogItem[]): { intent: CustomerIntent; matches: CatalogItem[] } {
  const m = fold(message);
  const matches = matchServices(message, catalog);
  if (/(bang gia|xem gia|gia ca|price|menu|danh sach dich vu|co nhung dich vu|tat ca dich vu)/.test(m)) return { intent: 'price_list', matches };
  if (/(hot|noi bat|pho bien|ban chay|nhieu nguoi|dat nhieu|duoc yeu thich|best ?seller|nen thu)/.test(m)) return { intent: 'hot', matches };
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

export function customerRuleReply(
  message: string, catalog: CatalogItem[], hotIds: string[], facts: SalonFacts, now?: Date,
): CustomerReply {
  const { intent, matches } = detectCustomerIntent(message, catalog);
  const hot = hotIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
  const popular = (hot.length ? hot : catalog).slice(0, 4);
  const shop = facts.name || 'tiệm';
  const reply = (answer: string, suggestions: CatalogItem[] = [], quickReplies = QUICK): CustomerReply =>
    ({ intent, answer, suggestions, quickReplies });

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
        : 'Hiện tiệm chưa mở dịch vụ nào để đặt online, bạn gọi hotline giúp mình nhé.', popular, ['Dịch vụ hot', 'Tư vấn chăm sóc da', 'Đặt lịch ngay']);
    }
    case 'hot':
      return reply(popular.length ? `Dịch vụ được đặt nhiều nhất gần đây:\n${popular.map(line).join('\n')}\nBấm "Chọn" ở dịch vụ bạn thích rồi "Đặt lịch" nhé.`
        : 'Tiệm chưa có dịch vụ nào đang mở đặt online.', popular, ['Xem bảng giá', 'Đặt lịch ngay']);
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
        + 'hoặc chọn nhanh bên dưới nhé.', popular.slice(0, 3), ['Xem bảng giá', 'Dịch vụ hot', 'Tư vấn chăm sóc tóc']);
  }
}

/** Ngữ cảnh cho mô hình ngôn ngữ: danh mục công khai + giờ mở cửa (không có dữ liệu khách). */
export function customerContextForLlm(catalog: CatalogItem[], hotIds: string[], facts: SalonFacts): string {
  const hot = new Set(hotIds.slice(0, 5));
  return [
    `Tiệm: ${facts.name} · ${facts.address} · hotline ${facts.hotline}`,
    `Giờ mở cửa: ${facts.openingHours.map((h) => `${h.dayLabel} ${h.isClosed ? 'nghỉ' : `${h.openTime.slice(0, 5)}-${h.closeTime.slice(0, 5)}`}`).join('; ')}`,
    'Danh mục (tên | nhóm | phút | giá):',
    ...catalog.slice(0, 80).map((s) => `- ${s.name} | ${s.categoryName} | ${s.durationMinutes} | ${s.priceText}${hot.has(s.id) ? ' | HOT' : ''}`),
  ].join('\n');
}

export const CUSTOMER_SYSTEM_PROMPT = 'Bạn là nhân viên tư vấn thân thiện của một tiệm salon & spa Việt Nam, chat với khách trên website. '
  + 'Xưng "mình", gọi khách là "bạn". Chào hỏi tự nhiên, hỏi nhu cầu (tóc, da, massage, móng), gợi ý 1–3 dịch vụ CÓ TRONG DANH MỤC '
  + 'kèm thời lượng và giá đúng như danh mục. Không bịa dịch vụ, giá, khuyến mãi hay khung giờ trống. Không hỏi số điện thoại — '
  + 'khách tự nhập ở bước đặt lịch. Trả lời ngắn (tối đa 5 dòng), cuối câu mời khách bấm "Đặt lịch".';
