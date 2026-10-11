/**
 * Part 5 — phần "luật" của Trợ lý AI: hàm THUẦN (không DB, không mạng) để kiểm thử đơn vị và để trợ lý vẫn trả lời
 * được khi KHÔNG cấu hình mô hình ngôn ngữ (AI_PROVIDER trống) hoặc mô hình cục bộ (Ollama) đang tắt / quá chậm.
 */

export type AssistantIntent =
  | 'shifts' | 'holidays' | 'golden' | 'combo' | 'greeting' | 'identity' | 'help' | 'thanks' | 'general';

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
}

export const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
    .replace(/\s+/g, ' ').trim();

/** Câu xã giao chung cho cả trợ lý nhân sự lẫn trợ lý khách (TASK v3 · NV1). */
export const SMALL_TALK: { intent: 'greeting' | 'identity' | 'help' | 'thanks'; re: RegExp }[] = [
  { intent: 'identity', re: /(ban la ai|may la ai|em la ai|ban ten (la )?gi|ten (cua )?ban|ban lam (duoc )?gi|tro ly (nay )?(la )?gi|la bot|robot)/ },
  { intent: 'help', re: /(huong dan|chi (cho )?(toi|minh|em|tui)|giup (toi|minh|em|tui|voi)|tro giup|lam sao|cach (dung|su dung|lam)|bat dau tu dau|\bhelp\b)/ },
  { intent: 'thanks', re: /^(ok+|oke|okay|cam on|thanks?|thank you|tks|tuyet voi|hay qua|duoc roi)\b/ },
  { intent: 'greeting', re: /^(alo+|a lo|a lô|hello|helo|hi+|hey|chao|xin chao|chao ban|chao em|chao shop|e oi|em oi|shop oi|ad oi|ban oi)\b/ },
];

export function smallTalkIntent(message: string): 'greeting' | 'identity' | 'help' | 'thanks' | null {
  const m = fold(message);
  for (const t of SMALL_TALK) if (t.re.test(m)) return t.intent;
  return null;
}

/** Nhận diện ý định từ câu hỏi tiếng Việt (có hoặc không dấu). Chủ đề nghiệp vụ thắng câu xã giao ("chào, tuần này thiếu thợ không?"). */
export function detectIntent(message: string): AssistantIntent {
  const m = fold(message);
  if (/(thieu tho|xep ca|ca lam|lich lam|phan ca|thieu nguoi|ca truc|do phu)/.test(m)) return 'shifts';
  if (/(nghi le|ngay le|\ble\b|tet|quoc khanh|30\/4|2\/9|gio to)/.test(m)) return 'holidays';
  if (/(combo|goi dich vu|ban kem|lam them|dich vu kem|up ?sell|goi y dich vu)/.test(m)) return 'combo';
  if (/(gio vang|cao diem|dong khach|gio nao|khung gio|vang khach|thap diem|gio dep|gio vang)/.test(m)) return 'golden';
  return smallTalkIntent(message) ?? 'general';
}

/** Gợi ý câu hỏi tiếp theo (nút bấm nhanh) theo ngữ cảnh vừa trả lời. */
export function quickReplies(intent: AssistantIntent): string[] {
  const all: Record<string, string> = {
    golden: 'Giờ vàng tuần này?', combo: 'Gợi ý combo cho khách', shifts: '7 ngày tới thiếu thợ ca nào?', holidays: 'Ngày lễ sắp tới?',
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
export function ruleAnswer(intent: AssistantIntent, ctx: AssistantContext, opts: { userName?: string | null } = {}): string {
  const name = firstName(opts.userName);
  switch (intent) {
    case 'greeting': {
      const alert = ctx.gaps.length ? ` Tuần này có ${ctx.gaps.length} khung giờ thiếu thợ, bạn muốn xem không?` : '';
      return `Chào ${name || 'bạn'}! Mình là trợ lý vận hành của tiệm.${alert} Bạn cần mình hỗ trợ gì: giờ vàng, combo dịch vụ, xếp ca hay ngày lễ?`;
    }
    case 'identity':
      return 'Mình là Trợ lý vận hành của tiệm, đọc số liệu lịch hẹn thật để giúp bạn:\n'
        + '• Tư vấn khung giờ vàng / giờ vắng khi khách gọi đặt lịch\n• Gợi ý combo dịch vụ khách hay đặt cùng\n'
        + '• Phát hiện khung giờ thiếu thợ và gợi ý ai nên xếp\n• Sinh ngày lễ trong năm để thêm vào lịch nghỉ\n'
        + 'Mình không xem được thông tin cá nhân của khách.';
    case 'help':
      return 'Bạn có thể hỏi tự nhiên, ví dụ:\n• "Khách muốn cắt tóc chiều thứ 7, giờ nào đẹp?"\n• "Khách đặt nhuộm thì mời thêm gì?"\n'
        + '• "Tuần sau thiếu thợ ca nào?"\n• "Còn ngày lễ nào chưa thêm?"\nHoặc bấm các tab phía trên để xem nhanh và thao tác một chạm.';
    case 'thanks':
      return `Không có gì${name ? ` ${name}` : ''}! Cần gì cứ hỏi mình nhé.`;
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
    default:
      return 'Mình chưa chắc đã hiểu đúng ý bạn. Mình trả lời tốt nhất các câu về giờ vàng, combo dịch vụ, ca thiếu thợ và ngày lễ'
        + ' — bạn thử hỏi lại theo một trong các chủ đề đó, hoặc bấm gợi ý bên dưới nhé.';
  }
}

/** Ngữ cảnh gửi cho mô hình ngôn ngữ — CHỈ số liệu tổng hợp, không có tên / SĐT / email khách (bảo mật dữ liệu). */
export function contextForLlm(ctx: AssistantContext): string {
  return [
    `Giờ vàng: ${ctx.goldenHours.map((g) => `${g.label} (${g.bookings} lượt)`).join('; ') || 'chưa có'}`,
    `Giờ vắng: ${ctx.quietHours.map((g) => g.label).join('; ') || 'chưa có'}`,
    `Combo hay đặt cùng: ${ctx.combos.map((c) => `${c.names.join(' + ')} (${c.count} lượt, ${c.totalDuration}′, ${c.priceText})`).join('; ') || 'chưa có'}`,
    `Dịch vụ phổ biến: ${ctx.topServices.map((s) => `${s.name} (${s.count})`).join('; ') || 'chưa có'}`,
    `Khung thiếu thợ 7 ngày tới: ${ctx.gaps.slice(0, 8).map((g) => `${g.dayText} ${g.startTime}–${g.endTime}${g.candidates[0] ? ` gợi ý ${g.candidates[0].fullName}` : ''}`).join('; ') || 'không có'}`,
    `Ngày lễ chưa thêm: ${ctx.holidays.filter((h) => h.status === 'ready').map((h) => `${h.name} ${h.startDate}`).join('; ') || 'không có'}`,
  ].join('\n');
}

export const SYSTEM_PROMPT = 'Bạn là trợ lý vận hành thân thiện của một tiệm salon/spa Việt Nam, trò chuyện với lễ tân và chủ tiệm. '
  + 'Trả lời tự nhiên như đồng nghiệp: chào hỏi thì chào lại, hỏi bạn là ai thì giới thiệu ngắn. Với câu nghiệp vụ, CHỈ dùng số liệu '
  + 'trong phần DỮ LIỆU, không bịa. Tiếng Việt, ngắn gọn (tối đa 6 dòng), có hành động cụ thể. '
  + 'Không hứa giờ trống cụ thể — nhắc lễ tân kiểm tra trên màn hình đặt lịch.';
