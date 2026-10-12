import {
  CatalogItem, customerContextForLlm, customerRuleReply, detectCustomerIntent, matchServices, SalonFacts, sanitizeLlmAnswer,
} from './customer-assistant-rules';

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

  describe('Deterministic pre-query — số lượng / so sánh tính trên danh mục thật (QA 12/10)', () => {
    // Mô phỏng đúng tình huống lỗi: có dịch vụ 90.000 ₫ nhưng mô hình trả lời "Cạo mặt 100.000 ₫"
    const real = [
      ...catalog,
      svc('kid', 'Cắt tóc trẻ em', 'Cắt & tạo kiểu tóc', 30, 90000),
      svc('beard', 'Cạo mặt & tỉa râu kiểu Barber', 'Cắt & tạo kiểu tóc', 30, 100000),
      svc('nail', 'Sơn gel tay', 'Nail - Chăm sóc móng', 40, 150000),
      svc('nail2', 'Đắp bột móng', 'Nail - Chăm sóc móng', 90, 350000),
      svc('vip', 'Combo VIP trọn gói 3 giờ', 'Gói combo tiết kiệm', 180, 1990000),
    ];

    it('nhận diện câu hỏi thống kê / so sánh', () => {
      const cases: [string, string][] = [
        ['có bao nhiêu dịch vụ ?', 'count_services'], ['tiệm có mấy dịch vụ', 'count_services'], ['tong cong bao nhieu dich vu', 'count_services'],
        ['dịch vụ rẻ nhất là', 'cheapest_service'], ['cái nào giá thấp nhất', 'cheapest_service'],
        ['dịch vụ đắt nhất', 'priciest_service'], ['gói cao cấp nhất bên mình', 'priciest_service'],
        ['làm cái gì nhanh nhất', 'fastest_service'], ['dịch vụ nào lâu nhất', 'longest_service'],
        ['có những dịch vụ móng nào', 'filter_by_group'], ['liệt kê các dịch vụ chăm sóc da', 'filter_by_group'],
      ];
      for (const [q, intent] of cases) expect(detectCustomerIntent(q, real).intent).toBe(intent);
      // "được đặt nhất" = phổ biến, không phải "đắt nhất"
      expect(detectCustomerIntent('dịch vụ nào được đặt nhất', real).intent).not.toBe('priciest_service');
      // câu tư vấn nhu cầu vẫn là tư vấn
      expect(detectCustomerIntent('tóc mình bị hư tổn khô xơ', real).intent).toBe('need');
    });

    it('đếm đúng số dịch vụ và danh mục', () => {
      const r = customerRuleReply('có bao nhiêu dịch vụ ?', real, [], facts);
      expect(r.answer).toContain(`có ${real.length} dịch vụ`);
      expect(r.answer).toContain('chia thành 6 danh mục');
      expect(r.answer).toContain('Giá từ 90.000 ₫ (Cắt tóc trẻ em) đến 1.990.000 ₫ (Combo VIP trọn gói 3 giờ)');
      expect(customerRuleReply('có bao nhiêu dịch vụ móng', real, [], facts).answer).toContain('Nhóm móng hiện có 2 dịch vụ');
    });

    it('rẻ nhất / đắt nhất / nhanh nhất / lâu nhất: đúng dịch vụ, thẻ gợi ý bám sát câu hỏi', () => {
      const cheap = customerRuleReply('dịch vụ rẻ nhất là', real, [], facts);
      expect(cheap.answer).toMatch(/^Dịch vụ có giá thấp nhất là Cắt tóc trẻ em — 90\.000 ₫, 30 phút\./);
      expect(cheap.suggestions.map((s) => s.id)).toEqual(['kid', 'beard', 'nail']); // 150.000 ₫ bằng giá: dịch vụ ngắn hơn trước
      const vip = customerRuleReply('dịch vụ đắt nhất', real, [], facts);
      expect(vip.suggestions[0].id).toBe('vip');
      expect(customerRuleReply('dịch vụ móng rẻ nhất', real, [], facts).answer).toContain('trong nhóm móng là Sơn gel tay');
      expect(customerRuleReply('dịch vụ nào lâu nhất', real, [], facts).suggestions[0].id).toBe('vip');
      const fast = customerRuleReply('làm cái gì nhanh nhất', real, [], facts);
      expect(fast.answer).toContain('Có 2 dịch vụ làm nhanh nhất'); // hai dịch vụ cùng 30 phút
      expect(fast.suggestions.map((s) => s.id)).toEqual(['kid', 'beard', 'nail']);
      const nails = customerRuleReply('có những dịch vụ móng nào', real, [], facts);
      expect(nails.suggestions.map((s) => s.id)).toEqual(['nail', 'nail2']);
    });

    it('ngữ cảnh mô hình có sẵn tổng số, giá thấp nhất / cao nhất', () => {
      const text = customerContextForLlm(real, [], facts);
      expect(text).toContain(`Tổng số dịch vụ: ${real.length} dịch vụ, 6 danh mục`);
      expect(text).toContain('Dịch vụ giá thấp nhất: Cắt tóc trẻ em (90.000 ₫)');
      expect(text).toContain('Dịch vụ giá cao nhất: Combo VIP trọn gói 3 giờ (1.990.000 ₫)');
    });
  });

  it('làm sạch câu trả lời mô hình: bỏ nút giả, markdown, token rác', () => {
    expect(sanitizeLlmAnswer('Bạn thử **Cắt tóc trẻ em** nhé! **[Đặt lịch]**')).toBe('Bạn thử Cắt tóc trẻ em nhé!');
    expect(sanitizeLlmAnswer('Mời bạn [Book now](https://x.vn/dat-lich) hoặc [Đặt lịch ngay]<|im_end|>')).toBe('Mời bạn  hoặc');
    expect(sanitizeLlmAnswer('## Gợi ý\n- Massage cổ vai gáy\n* Gội dưỡng sinh\n\n\n\nXem [bảng giá](/dich-vu)'))
      .toBe('Gợi ý\n• Massage cổ vai gáy\n• Gội dưỡng sinh\n\nXem bảng giá');
    expect(sanitizeLlmAnswer('<think></think>Chào bạn')).toBe('Chào bạn');
  });

  it('câu không hiểu: hỏi lại nhu cầu, vẫn gợi ý dịch vụ để bấm', () => {
    const r = customerRuleReply('asdfgh', catalog, ['cut'], facts);
    expect(r.intent).toBe('unknown');
    expect(r.suggestions[0].id).toBe('cut');
  });
});
