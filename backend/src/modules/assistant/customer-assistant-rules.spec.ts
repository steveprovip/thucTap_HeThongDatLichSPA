import { CatalogItem, customerRuleReply, detectCustomerIntent, matchServices, SalonFacts } from './customer-assistant-rules';

const svc = (id: string, name: string, categoryName: string, durationMinutes: number, price: number): CatalogItem =>
  ({ id, name, categoryName, durationMinutes, price, priceText: `${price.toLocaleString('vi-VN')} ₫`, description: null });
const catalog = [
  svc('cut', 'Cắt tóc nữ', 'Tóc', 45, 150000),
  svc('dye', 'Nhuộm thời trang', 'Tóc', 120, 650000),
  svc('rep', 'Phục hồi tóc hư tổn', 'Tóc', 60, 350000),
  svc('fac', 'Chăm sóc da mặt cơ bản', 'Chăm sóc da', 60, 300000),
  svc('acne', 'Điều trị mụn', 'Chăm sóc da', 75, 450000),
  svc('mas', 'Massage cổ vai gáy', 'Massage', 45, 250000),
];
const facts: SalonFacts = {
  name: 'Hương Sen', hotline: '0909 123 456', address: '128 Nguyễn Văn Cừ',
  openingHours: [{ dayLabel: 'Thứ 2', isClosed: false, openTime: '08:30', closeTime: '20:00' }, { dayLabel: 'Chủ nhật', isClosed: true, openTime: '08:00', closeTime: '20:00' }],
};

describe('AI tư vấn khách — luật dựa trên danh mục thật (TASK v3 · NV1)', () => {
  it('hiểu chào hỏi / hỏi danh tính / xin hướng dẫn, không đổ bảng giá', () => {
    expect(detectCustomerIntent('alo shop ơi', catalog).intent).toBe('greeting');
    expect(detectCustomerIntent('bạn là ai', catalog).intent).toBe('identity');
    expect(detectCustomerIntent('hướng dẫn tôi đặt với', catalog).intent).toBe('help');
    const hi = customerRuleReply('xin chào', catalog, [], facts);
    expect(hi.answer).toContain('Hương Sen');
    expect(hi.suggestions).toHaveLength(0);
  });

  it('tư vấn theo nhu cầu: tóc hư tổn, da mụn, mỏi vai gáy → đúng dịch vụ, có giá và thời lượng', () => {
    expect(matchServices('tóc mình bị hư tổn khô xơ', catalog)[0].id).toBe('rep');
    expect(matchServices('tóc khô xơ quá', [...catalog, svc('cut2', 'Cắt tóc nam', 'Tóc', 30, 100000)])[0].id).toBe('rep');
    expect(matchServices('mai đi đám cưới', [...catalog, svc('mk', 'Trang điểm dự tiệc', 'Trang điểm & Móng', 60, 400000)])[0].id).toBe('mk');
    expect(matchServices('da mặt nhiều mụn quá', catalog)[0].id).toBe('acne');
    expect(matchServices('chăm sóc da mặt', catalog).map((s) => s.id)).toEqual(expect.arrayContaining(['fac']));
    const r = customerRuleReply('dạo này mỏi cổ vai gáy', catalog, [], facts);
    expect(r.intent).toBe('need');
    expect(r.suggestions[0].id).toBe('mas');
    expect(r.answer).toContain('Massage cổ vai gáy — 45 phút · 250.000 ₫');
  });

  it('nút nhanh: Xem bảng giá theo nhóm, Dịch vụ hot theo lượt đặt, Đặt lịch ngay', () => {
    const price = customerRuleReply('Xem bảng giá', catalog, [], facts);
    expect(price.intent).toBe('price_list');
    expect(price.answer).toContain('Tóc:');
    expect(price.answer).toContain('Chăm sóc da:');
    const hot = customerRuleReply('Dịch vụ hot', catalog, ['dye', 'mas'], facts);
    expect(hot.suggestions.map((s) => s.id)).toEqual(['dye', 'mas']);
    const book = customerRuleReply('đặt lịch nhuộm thời trang', catalog, [], facts);
    expect(book.intent).toBe('book');
    expect(book.suggestions[0].id).toBe('dye');
    expect(customerRuleReply('mấy giờ mở cửa', catalog, [], facts).answer).toContain('Chủ nhật: nghỉ');
    expect(customerRuleReply('địa chỉ ở đâu', catalog, [], facts).answer).toContain('0909 123 456');
  });

  it('câu không hiểu: hỏi lại nhu cầu, vẫn gợi ý dịch vụ để bấm', () => {
    const r = customerRuleReply('asdfgh', catalog, ['cut'], facts);
    expect(r.intent).toBe('unknown');
    expect(r.suggestions[0].id).toBe('cut');
  });
});
