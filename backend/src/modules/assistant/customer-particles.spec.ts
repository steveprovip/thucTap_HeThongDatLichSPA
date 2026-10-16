import { CATEGORIES, SERVICES } from '../../database/realistic/catalog';
import { CatalogItem, correctMessage, customerRuleReply, matchServices, SalonFacts, stripParticles } from './customer-assistant-rules';

/**
 * RFC-2026-SPA-V3 · Pillar III.1 — hư từ "đã" / "dạ" bỏ dấu thành "da" (làn da). Trước bản sửa: "em da dat lich roi" được gợi ý
 * Massage mặt / Chăm sóc da; "dạ em muốn làm móng" lọt "Chăm sóc da" vào danh sách khớp. Khoá trên danh mục thật 43 dịch vụ.
 */
const catalog: CatalogItem[] = SERVICES.map((s) => ({
  id: s.id, name: s.name, categoryName: CATEGORIES.find((c) => c.id === s.categoryId)!.name,
  durationMinutes: s.duration, price: s.price, priceText: `${s.price.toLocaleString('vi-VN')} đ`, description: s.description,
}));
const facts: SalonFacts = {
  name: 'Salon & Spa Hương Sen', hotline: '028 3838 6868', address: '128 Nguyễn Văn Cừ',
  openingHours: ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật']
    .map((dayLabel) => ({ dayLabel, isClosed: false, openTime: '08:00', closeTime: '21:00' })),
  maxActiveBookingsPerPhone: 3, stylists: { total: 14, female: 9, male: 5 },
};
const ask = (q: string) => customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T05:00:00Z'), { today: '2026-10-12' });
const cats = (items: CatalogItem[]) => [...new Set(items.map((s) => s.categoryName))];

describe('Hư từ "đã" / "dạ" không bị hiểu thành "da" (làn da)', () => {
  it('stripParticles: bỏ "đã" / "dạ" ở câu có dấu, giữ "da" (làn da)', () => {
    expect(stripParticles('Dạ cho em hỏi giá')).toBe('cho em hoi gia');
    expect(stripParticles('tóc em đã uốn nhiều lần')).toBe('toc em uon nhieu lan');
    expect(stripParticles('Da mặt em bị khô')).toBe('da mat em bi kho');
    expect(stripParticles('massage đá nóng')).toBe('massage da nong');
    // chạy lại trên câu đã chuẩn hoá cho cùng kết quả (correctMessage gọi hai lần)
    expect(stripParticles(stripParticles('Dạ em đã đặt lịch rồi'))).toBe(stripParticles('Dạ em đã đặt lịch rồi'));
  });

  it('câu không dấu: chỉ bỏ "da" khi từ đứng sau cho thấy là hư từ', () => {
    expect(stripParticles('da cho em hoi gia cat toc')).toBe('cho em hoi gia cat toc');
    expect(stripParticles('em da nhuom toc roi')).toBe('em nhuom toc roi');
    // làn da: "da em bị khô", "da tay", "da đen", "da nhăn" giữ nguyên
    for (const q of ['da em bi kho', 'da tay bi kho', 'da den', 'da nhan', 'da dau nhieu gau']) expect(stripParticles(q)).toBe(q);
  });

  it('"em đã đặt lịch rồi" → hướng dẫn tra cứu / đổi / huỷ, không gợi ý dịch vụ da', () => {
    for (const q of ['em da dat lich roi', 'em đã đặt lịch rồi', 'Em đã đặt lịch, muốn đổi giờ']) {
      const r = ask(q);
      expect(r.intent).toBe('cancel_policy');
      expect(r.suggestions).toHaveLength(0);
      expect(r.answer).toContain('Tra cứu lịch');
    }
    // không dấu + nhờ đặt: "dạ, đặt lịch giúp em" vẫn là đặt lịch mới
    expect(ask('da dat lich giup em cat toc nu').intent).toBe('book');
  });

  it('"dạ …" + nhóm tóc / móng / massage chỉ khớp đúng nhóm (không lọt Chăm sóc da)', () => {
    expect(cats(matchServices('dạ em muốn làm móng', catalog))).toEqual(['Nail - Chăm sóc móng']);
    expect(cats(matchServices('dạ massage cổ vai gáy', catalog))).not.toContain('Chăm sóc da');
    expect(cats(ask('Dạ tư vấn giúp em về tóc').suggestions).every((c) => /tóc|Uốn|Gội/.test(c))).toBe(true);
    expect(ask('Dạ cho em hỏi cắt tóc nữ giá bao nhiêu').suggestions.map((s) => s.name)).toEqual(['Cắt tóc nữ layer tạo kiểu']);
  });

  it('nút nhanh Tóc / Móng / Da mặt: mỗi chủ đề chỉ ra dịch vụ thuộc nhóm của nó', () => {
    expect(cats(ask('Tư vấn chăm sóc tóc').suggestions).some((c) => c === 'Chăm sóc da' || c.startsWith('Nail'))).toBe(false);
    expect(cats(ask('Tư vấn làm móng').suggestions)).toEqual(['Nail - Chăm sóc móng']);
    expect(cats(ask('Tư vấn chăm sóc da').suggestions)).toEqual(['Chăm sóc da']);
    expect(cats(ask('trị mụn').suggestions)).toEqual(['Chăm sóc da']);
    expect(ask('massage đá nóng').suggestions[0].name).toBe('Massage body đá nóng');
  });

  it('triệu chứng đứng cách chữ "tóc": "tóc em đã uốn nhiều lần bị khô" → phục hồi', () => {
    const r = ask('tóc em đã uốn nhiều lần bị khô');
    expect(r.intent).toBe('need');
    expect(r.suggestions[0].name).toMatch(/Phục hồi/);
  });

  it('"làm nail ở tiệm khác, giờ muốn sơn gel" không bị coi là so sánh hai dịch vụ', () => {
    const r = ask('mình đã làm nail ở tiệm khác, giờ muốn sơn gel');
    expect(r.intent).not.toBe('explain');
    expect(cats(r.suggestions)).toEqual(['Nail - Chăm sóc móng']);
  });

  it('correctMessage vẫn sửa lỗi gõ sau khi bỏ hư từ', () => {
    expect(correctMessage('dạ bn tiền mát xoa z')).toBe('bao nhieu tien massage vay');
  });
});
