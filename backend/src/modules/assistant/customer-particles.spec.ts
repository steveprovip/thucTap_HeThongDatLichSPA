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

  it('"da" (làn da) trước "bao nhiêu" / "hơi" / "nổi" không bị coi là "đã báo" / "đã hỏi" / "đã nói"', () => {
    for (const q of ['Chăm sóc da bao nhiêu tiền', 'cham soc da bao nhieu tien']) {
      const r = ask(q);
      expect(r.intent).toBe('service_price');
      expect(cats(r.suggestions)).toEqual(['Chăm sóc da']);
    }
    expect(ask('chăm sóc da bao lâu').intent).toBe('service_duration');
    for (const q of ['da hơi khô nên làm gì', 'da hoi kho nen lam gi', 'da hơi nhạy cảm có làm được không', 'da nổi mẩn đỏ thì làm gì']) {
      const r = ask(q);
      expect(r.intent).toBe('need');
      expect(cats(r.suggestions)).toEqual(['Chăm sóc da']);
    }
    // cụm không thể hiểu là làn da vẫn bỏ được "da" ở câu không dấu
    expect(stripParticles('em da hoi roi ma chua ai tra loi')).toBe('em hoi roi ma chua ai tra loi');
  });

  it('"Da em / mình hơi …" (hơi = một chút) đầu câu là làn da, không phải "dạ em hỏi"', () => {
    for (const q of ['Da em hơi khô thì nên làm gì', 'da em hoi kho thi nen lam gi', 'Da mình hơi dầu, nên làm dịch vụ gì', 'Da mình hơi sạm, có dịch vụ nào không']) {
      const r = ask(q);
      expect(r.intent).toBe('need');
      expect(cats(r.suggestions)).toEqual(['Chăm sóc da']);
    }
    expect(stripParticles('da em hoi ve gia cat toc')).toBe('em hoi ve gia cat toc');
  });

  it('câu có dấu chỉ mất "đã" / "dạ": bản đã bỏ dấu không bị đoán hư từ lần nữa ở các bước sau', () => {
    expect(correctMessage('Da mình cần chăm sóc gì')).toBe('da minh can cham soc gi');
    const r = ask('Da mình cần chăm sóc gì');
    expect(r.intent).toBe('need');
    expect(cats(r.suggestions)).toEqual(['Chăm sóc da']);
    // emoji / dấu "…" không làm câu không dấu thành "có dấu"
    expect(stripParticles('da em muon lam mong 😊')).toBe('em muon lam mong 😊');
  });

  it('"da em mun nhieu qua" (da em mụn nhiều) giữ cả làn da lẫn mụn; "da e mun lam mong" vẫn là "dạ em muốn"', () => {
    expect(correctMessage('da em mun nhieu qua')).toBe('da em mun nhieu qua');
    const r = ask('da em mun nhieu qua');
    expect(r.intent).toBe('need');
    expect(cats(r.suggestions)).toEqual(['Chăm sóc da']);
    expect(r.suggestions.some((s) => /mụn/i.test(s.name))).toBe(true);
    expect(correctMessage('da e mun lam mong')).toBe('e muon lam mong');
  });

  it('"da em mun" + việc muốn làm (tư vấn, đăng ký, sửa móng) vẫn là "dạ em muốn" — không lọt "Lấy nhân mụn"', () => {
    expect(correctMessage('da em mun tu van ve toc')).toBe('em muon tu van ve toc');
    const hair = ask('da em mun tu van ve toc').suggestions.map((s) => s.name);
    expect(hair.some((n) => /Cắt tóc/.test(n))).toBe(true);
    expect(hair.some((n) => /mụn/i.test(n))).toBe(false);
    for (const q of ['da e mun dang ky lam mong', 'da em mun sua mong']) expect(cats(ask(q).suggestions)).toEqual(['Nail - Chăm sóc móng']);
    // từ hay đi sau "mụn" không bị đổi thành "muốn"
    for (const q of ['da em bi mun den nhieu', 'em bi mun sua', 'tri mun gap']) expect(correctMessage(q)).toBe(q);
  });

  it('câu có dấu, riêng "đã" / "dạ" gõ thiếu dấu trước "đặt lịch" / "vâng" / "cảm ơn" có dấu: không gợi ý dịch vụ da', () => {
    for (const q of ['em da đặt lịch rồi', 'Em da đặt lịch rồi ạ']) {
      const r = ask(q);
      expect(r.intent).toBe('cancel_policy');
      expect(r.suggestions).toHaveLength(0);
    }
    const book = ask('da đặt lịch giúp em'); // "dạ, đặt lịch giúp em" — không có "rồi" → vẫn là đặt mới
    expect(book.intent).toBe('book');
    expect(cats(book.suggestions)).not.toContain('Chăm sóc da');
    for (const q of ['Da vâng ạ', 'Da, cảm ơn shop']) expect(ask(q).suggestions).toHaveLength(0);
    // "da" ở chỗ khác vẫn là làn da
    expect(stripParticles('chăm sóc da đặt lịch ở đâu')).toBe('cham soc da dat lich o dau');
    expect(stripParticles(stripParticles('em da đặt lịch rồi'))).toBe(stripParticles('em da đặt lịch rồi'));
  });

  it('"gáy" / "gầy" không phải tóc gãy: câu cắt tóc ra Cắt tóc; "tóc bị gãy" vẫn ra Phục hồi', () => {
    for (const q of ['muốn cắt tóc ngắn sát gáy', 'tư vấn kiểu tóc cho người mặt gầy', 'cắt tóc kiểu nào hợp mặt gầy',
      'cắt tóc sát gáy nhiều hơn', 'kiểu tóc cho mặt gầy nhiều']) {
      const names = ask(q).suggestions.map((s) => s.name);
      expect(names.some((n) => /Phục hồi/.test(n))).toBe(false);
      expect(names.some((n) => /Cắt tóc/.test(n))).toBe(true);
    }
    for (const q of ['toc em bi gay', 'tóc em bị gãy rụng nhiều', 'tóc em gãy ngọn', 'toc em gay ngon', 'tóc em dễ gãy',
      'tóc em yếu dễ gãy', 'tóc em gãy nhiều']) expect(ask(q).suggestions[0].name).toMatch(/Phục hồi/);
  });
});
