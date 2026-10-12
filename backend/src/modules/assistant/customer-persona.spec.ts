import { CATEGORIES, SERVICES } from '../../database/realistic/catalog';
import { CatalogItem, ChatLine, customerRuleReply, detectCustomerIntent, SalonFacts } from './customer-assistant-rules';

/**
 * QA nhập vai khách 12/10 — các cuộc hội thoại THẬT đã chạy trên AI local và từng trả lời sai, khoá lại trên danh mục thật
 * 43 dịch vụ (backend/src/database/realistic/catalog.ts). Mỗi kịch bản là nhiều lượt: câu sau hiểu theo ngữ cảnh câu trước.
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
const TODAY = '2026-10-12';
const byName = (part: string) => catalog.find((s) => s.name.includes(part))!;

/** Chạy một cuộc hội thoại; trả lời từng lượt (luật) để kiểm. */
function talk(...questions: string[]) {
  const history: ChatLine[] = [];
  return questions.map((q) => {
    const r = customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T05:00:00Z'), { history: [...history], today: TODAY });
    history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
    return r;
  });
}
const names = (r: { suggestions: CatalogItem[] }) => r.suggestions.map((s) => s.name);

describe('Nhập vai khách — hội thoại nhiều lượt trên danh mục thật', () => {
  it('chị Lan tóc hư tổn: "cái đó giá bao nhiêu" → "mất bao lâu" → "chiều nay còn giờ không" đều hiểu là Keratin', () => {
    const [need, price, dur, avail] = talk('tóc em bị khô xơ chẻ ngọn do uốn nhiều, nên làm gì ạ', 'cái phục hồi keratin đó giá bao nhiêu',
      'làm mất bao lâu vậy', 'chiều nay còn giờ trống không');
    expect(names(need)[0]).toContain('Phục hồi');
    expect(price.intent).toBe('service_price');
    expect(names(price)).toEqual(['Phục hồi tóc Keratin Nano']);
    expect(dur).toMatchObject({ intent: 'service_duration' });
    expect(dur.answer).toContain('Phục hồi tóc Keratin Nano mất khoảng 60 phút'); // "mất" không còn khớp "Cạo MẶT"
    expect(avail.intent).toBe('availability');
    expect(avail.pending).toMatchObject({ serviceId: byName('Keratin').id, when: { date: TODAY, part: 'chieu' } });
  });

  it('cô dâu: "gói cô dâu" → combo cô dâu; "trọn gói gồm những gì" mô tả đúng combo đó (không liệt kê cả nhóm)', () => {
    const [need, detail] = talk('tháng sau mình cưới, có gói cô dâu không', 'trọn gói gồm những gì');
    expect(names(need)[0]).toContain('Combo Cô dâu');
    expect(names(need)).not.toContain('Duỗi thẳng phồng chân Collagen'); // "THÁNG" không còn khớp "Duỗi THẲNG"
    expect(detail.intent).toBe('service_detail');
    expect(detail.answer).toContain('Combo Cô dâu rạng rỡ');
    expect(detail.answer).toContain('Trang điểm cô dâu, làm tóc cưới');
  });

  it('mẹ đưa con: "bé" = trẻ em; "thứ 7 này buổi sáng" tra giờ trống của đúng dịch vụ đó', () => {
    const [need, dur, avail] = talk('có cắt tóc cho bé không', 'bé 5 tuổi cắt mất bao lâu', 'thứ 7 này còn giờ nào buổi sáng');
    expect(names(need)).toEqual(['Cắt tóc trẻ em']);
    expect(dur.answer).toContain('Cắt tóc trẻ em mất khoảng 30 phút');
    expect(avail.pending).toMatchObject({ serviceId: byName('trẻ em').id, when: { date: '2026-10-17', part: 'sang' } });
  });

  it('khách nail: "cái nào rẻ nhất" so trong nhóm móng vừa hỏi; "làm cái gì nhanh nhất" là hỏi chung cả tiệm', () => {
    const [, , cheap] = talk('làm nail bao nhiêu tiền', 'có những dịch vụ móng nào', 'cái nào rẻ nhất');
    expect(cheap.intent).toBe('cheapest_service');
    expect(cheap.answer).toContain('trong nhóm móng là Sơn gel tay chân cơ bản');
    const [fast] = talk('làm cái gì nhanh nhất');
    expect(fast.answer).toMatch(/^Có \d+ dịch vụ làm nhanh nhất:/);
  });

  it('so sánh A–B: "keratin hay hấp dầu" là giải thích; "cái nào rẻ hơn" so đúng hai dịch vụ đó', () => {
    const [cmp, cheaper] = talk('nên làm keratin hay hấp dầu', 'cái nào rẻ hơn');
    expect(cmp.intent).toBe('explain');
    expect(cmp.suggestions).toHaveLength(0);
    expect(cheaper.answer).toContain('Hấp dầu Collagen siêu mượt — 220.000 đ');
    expect(names(cheaper)).toEqual(['Hấp dầu Collagen siêu mượt', 'Phục hồi tóc Keratin Nano']);
  });

  it('nhiều dịch vụ một câu + tổng thời lượng', () => {
    const [both] = talk('mình muốn gội đầu và cắt tóc nữ luôn được không');
    expect(names(both)).toEqual(['Gội đầu dưỡng sinh thảo dược', 'Cắt tóc nữ layer tạo kiểu']);
    const [dur] = talk('cắt tóc nữ và nhuộm balayage mất bao lâu tổng cộng');
    expect(dur.answer).toContain('Tổng cộng khoảng 165 phút (2 giờ 45 phút)');
  });
});

describe('Nhập vai khách — câu đơn từng trả lời sai', () => {
  const ask = (q: string) => talk(q)[0];

  it.each([
    ['Massage chân bấm huyệt trong hôm nay có những giờ nào đặt được nữa ?', 'availability'],
    ['tháng sau mình cưới, có gói cô dâu không', 'need'], // "cô dâu" từng khớp "ở đâu" → địa chỉ
    ['combo nào cho cô dâu', 'need'],
    ['gia cat toc nu', 'service_price'], // "giá cắt" từng khớp "giá cả" → cả bảng giá
    ['massag co vai gay bao nhieu', 'service_price'],
    ['dat lich giup minh 3 gio chieu mai cat toc nu', 'availability'],
    ['chủ nhật này 10h sáng cắt tóc nữ được không', 'availability'],
    ['có gì dưới 200k không', 'budget'],
    ['tầm 300 nghìn thì làm được gì', 'budget'],
    ['2 người đi cùng có đặt chung được không', 'group_booking'],
    ['có thợ nữ không', 'stylists'],
    ['có nối tóc không', 'not_offered'],
    ['có xăm chân mày không', 'not_offered'],
    ['có triệt lông không', 'not_offered'],
    ['mày là bot à', 'identity'],
    ['how much for a haircut', 'service_price'],
    ['thời tiết hôm nay thế nào', 'unknown'],
    ['tiệm có mấy dịch vụ', 'count_services'], // "tiệm" không bị hiểu là "tiêm"
    ['dịch vụ nào nhiều người đặt nhất', 'hot'],
  ])('"%s" → %s', (q, intent) => {
    expect(detectCustomerIntent(q, catalog, { today: TODAY }).intent).toBe(intent);
  });

  it('combo hot theo LƯỢT ĐẶT THẬT của từng dịch vụ (không còn "chưa đủ lượt đặt")', () => {
    const combo = catalog.filter((s) => s.categoryName.includes('combo'));
    const r = customerRuleReply('combo có gì hot ?', catalog, [], facts, undefined, {
      today: TODAY, popularity: { [combo[0].id]: 105, [combo[1].id]: 32, [combo[2].id]: 6 },
    });
    expect(r.answer).toContain('Nhóm combo được đặt nhiều nhất 90 ngày qua');
    expect(r.answer).toContain('(105 lượt)');
    expect(names(r)[0]).toBe(combo[0].name);
  });

  it('thẻ gợi ý không còn "ăn theo" do bỏ dấu: cạo râu ≠ cao cấp, thời tiết ≠ thời trang, làm nail = cả nhóm móng', () => {
    expect(names(ask('có cạo râu không'))).toEqual(['Cạo mặt & tỉa râu kiểu Barber']);
    expect(ask('thời tiết hôm nay thế nào').suggestions).toHaveLength(0);
    const nail = ask('làm nail bao nhiêu tiền');
    expect(nail.answer).toContain('Giá nhóm móng');
    expect(ask('có nối tóc không').suggestions).toHaveLength(0);
    expect(ask('có thợ nữ không').answer).toContain('14 thợ (9 nữ, 5 nam)');
  });
});
