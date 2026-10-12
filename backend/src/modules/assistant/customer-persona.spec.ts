import { CATEGORIES, SERVICES } from '../../database/realistic/catalog';
import {
  buildRewriteMessages, CatalogItem, ChatLine, correctMessage, customerRuleReply, detectCustomerIntent, faithfulRewrite, groupAvailabilityAnswer,
  parseRewrite,
  SalonFacts, ungroundedClaim,
} from './customer-assistant-rules';

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

/**
 * Hội thoại có TRẠNG THÁI như widget thật: mỗi lượt gửi lại `state` server vừa trả (dialogue state tracking) — câu cụt
 * "cắt tóc nữ ?" / "thế giờ trống là ?" phải nối đúng nhiệm vụ đang dở (tra giờ sáng mai), không rơi về tư vấn chung.
 */
function chat(nowTime: string, ...questions: string[]) {
  const history: ChatLine[] = [];
  let state: CustomerReplyState | undefined;
  return questions.map((q) => {
    const r = customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T05:00:00Z'), { history: [...history], today: TODAY, state, nowTime });
    history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
    state = r.state;
    return r;
  });
}
type CustomerReplyState = ReturnType<typeof customerRuleReply>['state'];

describe('Nhập vai khách — log 12/10 tối (giữ ngữ cảnh tra giờ, "bây giờ còn mở cửa")', () => {
  it('đúng log: alo → còn mở cửa? → sáng mai có giờ trống? → cắt tóc nữ ? → thế giờ trống là ?', () => {
    const [hi, open, ask, svc, again] = chat('21:21', 'alo', 'bây giờ còn mở cửa không ?', 'sáng mai có giờ nào trống ?', 'cắt tóc nữ ?', 'thế giờ trống là ?');
    expect(hi.intent).toBe('greeting');
    expect(open.intent).toBe('open_now');
    expect(open.answer).toContain('đã đóng cửa');
    expect(open.answer).not.toContain('Chủ nhật'); // không in cả bảng giờ 7 ngày
    expect(ask.intent).toBe('availability');
    expect(ask.state).toMatchObject({ task: 'availability', date: '2026-10-13', part: 'sang', awaitingService: true });
    expect(svc.intent).toBe('availability');
    expect(svc.pending).toMatchObject({ serviceId: byName('Cắt tóc nữ').id, when: { date: '2026-10-13', part: 'sang' } });
    expect(again.intent).toBe('availability');
    expect(again.pending).toMatchObject({ serviceId: byName('Cắt tóc nữ').id, when: { date: '2026-10-13', part: 'sang' } });
  });

  it('đổi buổi / đổi ngày giữ dịch vụ: "thế chiều thì sao" → chiều mai; "còn thứ 7 thì sao" → thứ 7 cùng dịch vụ', () => {
    const [, , afternoon, sat] = chat('10:00', 'sáng mai có giờ nào trống', 'gội đầu dưỡng sinh', 'thế chiều thì sao', 'còn thứ 7 thì sao');
    const id = byName('Gội đầu dưỡng sinh thảo dược').id;
    expect(afternoon.pending).toMatchObject({ serviceId: id, when: { date: '2026-10-13', part: 'chieu' } });
    expect(sat.pending).toMatchObject({ serviceId: id, when: { date: '2026-10-17' } });
  });

  it('đổi chủ đề giữa chừng thì thoát nhiệm vụ tra giờ: hỏi giá vẫn ra giá, không bị kéo về giờ trống', () => {
    const [, price] = chat('10:00', 'sáng mai có giờ nào trống', 'cắt tóc nam giá bao nhiêu');
    expect(price.intent).toBe('service_price');
    expect(names(price)).toEqual(['Cắt tóc nam tạo kiểu Barber']);
  });

  it('"bây giờ còn mở cửa không" theo giờ thật: trước giờ mở / đang mở / nghỉ lễ', () => {
    expect(chat('07:15', 'giờ này tiệm mở cửa chưa')[0].answer).toContain('chưa mở cửa');
    const [mid] = chat('14:00', 'tiệm còn mở không');
    expect(mid).toMatchObject({ intent: 'open_now' });
    expect(mid.answer).toContain('đang mở cửa đến 21:00 (còn khoảng 7 giờ 0 phút)');
    const holiday = customerRuleReply('bây giờ còn mở cửa không', catalog, [], { ...facts, holidays: [{ startDate: TODAY, endDate: TODAY, reason: 'Sửa chữa' }] },
      new Date('2026-10-12T05:00:00Z'), { today: TODAY, nowTime: '10:00' });
    expect(holiday.answer).toContain('Hôm nay tiệm nghỉ (Sửa chữa)');
    expect(holiday.answer).toContain('Ngày mai (Thứ ba 13/10) tiệm mở từ 08:00');
  });

  it('chưa hiểu 2 lần liên tiếp → chuyển người thật (hotline), không lặp lại câu hỏi lại vô tận', () => {
    const [a, b] = chat('10:00', 'xyz qwe', 'abc def ghi');
    expect(a.intent).toBe('unknown');
    expect(b.intent).toBe('handoff');
    expect(b.answer).toContain(facts.hotline);
  });
});

describe('Kiểm tra bám dữ liệu câu trả lời tự do của mô hình (grounding check)', () => {
  it('loại câu bịa giờ trống / giá lạ; giữ câu có giá đúng danh mục', () => {
    expect(ungroundedClaim('Sáng mai gội đầu còn 12 khung giờ trống: 09:00, 09:15, 09:30', catalog)).toBe('availability');
    expect(ungroundedClaim('Tiệm còn chỗ lúc 9h nhé', catalog)).toBe('availability');
    expect(ungroundedClaim('Cắt tóc nữ chỉ 99.000đ thôi ạ', catalog)).toBe('price');
    expect(ungroundedClaim(`Cắt tóc nữ layer tạo kiểu giá ${byName('Cắt tóc nữ').price.toLocaleString('vi-VN')} đ ạ`, catalog)).toBeNull();
    expect(ungroundedClaim('Dạ tiệm rất vui được phục vụ bạn, bạn cần tư vấn gì thêm không ạ?', catalog)).toBeNull();
  });

  it('"thế sáng thì sao" / "vậy tối được không" khi đang tra giờ = đổi buổi, không rơi vào câu tự do', () => {
    const [, morning, evening] = chat('10:00', 'chiều mai còn giờ gội đầu dưỡng sinh không', 'thế sáng thì sao', 'vậy tối được không');
    const id = byName('Gội đầu dưỡng sinh thảo dược').id;
    expect(morning.pending).toMatchObject({ serviceId: id, when: { date: '2026-10-13', part: 'sang' } });
    expect(evening.pending).toMatchObject({ serviceId: id, when: { date: '2026-10-13', part: 'toi' } });
  });
});

describe('Nhập vai khách — vòng chấm điểm 12/10 (eval-assistant)', () => {
  it('"mấy giờ đóng cửa" → giờ hôm nay + ngày mai, không in cả bảng 7 ngày', () => {
    const [r] = chat('10:00', 'mấy giờ đóng cửa');
    expect(r.answer).toBe('Hôm nay (Thứ hai 12/10): tiệm mở cửa 08:00–21:00.\nNgày mai (Thứ ba 13/10): tiệm mở cửa 08:00–21:00.');
    expect(chat('10:00', 'giờ mở cửa cả tuần')[0].answer).toContain('Chủ nhật: 08:00–21:00');
  });

  it('ngữ cảnh có 2 dịch vụ → "mai còn giờ không" hỏi lại dịch vụ nào; khách chọn thì tra đúng dịch vụ đó', () => {
    const [price, ask, pick] = chat('10:00', 'massage cổ vai gáy giá bao nhiêu', 'mai còn giờ không', 'massage bấm huyệt cổ vai gáy');
    expect(price.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(ask.intent).toBe('availability');
    expect(ask.pending).toBeUndefined();
    expect(ask.answer).toContain('cho dịch vụ nào');
    expect(ask.state).toMatchObject({ date: '2026-10-13', awaitingService: true });
    expect(pick.pending).toMatchObject({ serviceId: byName('Massage bấm huyệt cổ vai gáy').id, when: { date: '2026-10-13' } });
  });
});

describe('Nhập vai khách — log 12/10 lần 4 (chính tả, cả nhóm, tên thợ, ưu đãi, không lặp câu)', () => {
  const lan = { id: 't1', name: 'Nguyễn Thị Lan', gender: 'female', serviceIds: [byName('Gội đầu dưỡng sinh thảo dược').id] };
  const minh = { id: 't2', name: 'Trần Minh', gender: 'male', serviceIds: [byName('Cắt tóc nam').id] };
  const f2: SalonFacts = { ...facts, team: [lan, minh], promotions: [] };
  function chat2(factsX: SalonFacts, ...questions: string[]) {
    const history: ChatLine[] = [];
    let state: CustomerReplyState | undefined;
    return questions.map((q) => {
      const r = customerRuleReply(q, catalog, [], factsX, new Date('2026-10-12T14:00:00Z'), { history: [...history], today: TODAY, state, nowTime: '21:00' });
      history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
      state = r.state;
      return r;
    });
  }

  it('"ngày kia có dịch vụ mát xoa nào trống lịch không" → tra giờ CẢ NHÓM massage ngày 14/10 (trước đây: chưa rõ ý)', () => {
    const [r] = chat2(f2, 'ngày kia có dịch vụ mát xoa nào trống lịch không ?');
    expect(r.intent).toBe('availability');
    expect(r.pending).toMatchObject({ kind: 'availability_group', label: 'massage', when: { date: '2026-10-14' } });
    expect(r.state).toMatchObject({ date: '2026-10-14', awaitingService: true });
    expect(correctMessage('mát-xa, mat xoa, masage, mát xoa')).toBe('massage, massage, massage, massage');
    expect(correctMessage('da mặt sạm')).toBe('da mat sam'); // "mặt" thường không bị đổi
  });

  it('nêu đúng dịch vụ cụ thể thì vẫn tra một dịch vụ; chọn dịch vụ sau câu hỏi nhóm thì giữ ngày', () => {
    const [, pick] = chat2(f2, 'ngày kia massage nào còn trống', 'massage chân bấm huyệt');
    expect(pick.pending).toMatchObject({ kind: 'availability', serviceId: byName('Massage chân bấm huyệt').id, when: { date: '2026-10-14' } });
  });

  it('"có những thợ gì có thể làm ?" sau khi tra giờ gội đầu → tên thợ làm được dịch vụ đó (+ máy chủ tra ai còn giờ)', () => {
    const [, who] = chat2(f2, '"Gội đầu dưỡng sinh thảo dược" mai có lịch trống không ?', 'có những thợ gì có thể làm ?');
    expect(who.intent).toBe('stylists');
    expect(who.answer).toContain('1 thợ làm được Gội đầu dưỡng sinh thảo dược: Nguyễn Thị Lan');
    expect(who.pending).toMatchObject({ kind: 'stylists', serviceId: byName('Gội đầu dưỡng sinh thảo dược').id, date: '2026-10-13' });
    const [names] = chat2(f2, 'có những thợ nào');
    expect(names.answer).toContain('Tiệm có 2 thợ: Nguyễn Thị Lan, Trần Minh');
    expect(chat2(f2, 'có thợ nữ không')[0].answer).toContain('Tiệm có 1 thợ nữ: Nguyễn Thị Lan');
  });

  it('không bao giờ lặp nguyên văn câu vừa trả lời → thừa nhận + chuyển người thật', () => {
    const [a, b] = chat2(f2, 'có cần đặt cọc không', 'có cần đặt cọc không');
    expect(a.intent).toBe('deposit');
    expect(b).toMatchObject({ intent: 'deposit', repeated: true });
    expect(b.answer).toContain('Dạ, như mình vừa nêu ở trên:');
    expect(b.answer).toContain(a.answer); // vẫn nhắc lại thông tin (khách có thể chưa đọc kỹ), kèm mời gọi nhân viên
  });

  it('mã giảm giá: đọc ưu đãi ĐANG chạy (không lộ mã); không có thì nói thật là không có', () => {
    const none = chat2(f2, 'dạo gần đây có sự kiện cho mã giảm giá gì không ?')[0];
    expect(none.answer).toContain('chưa có chương trình giảm giá nào đang chạy');
    const withPromo = chat2({ ...f2, promotions: [{ description: 'Mừng 20/10', type: 'percent', value: 15, minOrder: 300000, endDate: '2026-10-20' }] }, 'có khuyến mãi gì không')[0];
    expect(withPromo.answer).toContain('• Mừng 20/10 (giảm 15%) cho hoá đơn từ 300.000');
    expect(withPromo.answer).toContain('đến hết 20/10');
  });

  it('giờ trống cả nhóm: dịch vụ nhiều giờ trước, dịch vụ kín liệt kê riêng, lọc theo buổi', () => {
    const a = byName('Massage chân bấm huyệt');
    const b = byName('Massage bấm huyệt cổ vai gáy');
    const slot = (time: string, ids: string[]) => ({ time, stylistIds: ids });
    const g = groupAvailabilityAnswer('massage', [
      { service: a, data: { salonClosed: false, slots: [slot('09:00', ['x']), slot('14:00', ['x']), slot('15:00', ['x'])], suggestedDates: [] } },
      { service: b, data: { salonClosed: false, slots: [slot('09:00', [])], suggestedDates: [] } },
    ] as never, { date: '2026-10-14', explicitDate: true, part: 'chieu', time: null }, TODAY);
    expect(g.answer).toContain('Thứ tư 14/10 buổi chiều nhóm massage còn trống:');
    expect(g.answer).toContain(`• ${a.name} (${a.durationMinutes} phút · ${a.priceText}) — 2 khung giờ, sớm nhất 14:00`);
    expect(g.answer).toContain(`Đã kín: ${b.name}`);
    expect(g.open.map((x) => x.id)).toEqual([a.id]);
  });

  it('câu đã học (chủ tiệm duyệt) dùng ngay, không cần mô hình; cụm từ đã học thay trong câu', () => {
    const learned = [
      { kind: 'question' as const, phrase: 'tiem con nhan k', rewrite: 'Bây giờ tiệm còn mở cửa không?' },
      { kind: 'alias' as const, phrase: 'goi thao moc', rewrite: 'goi dau duong sinh thao duoc' },
    ];
    const r = customerRuleReply('tiệm còn nhận k??', catalog, [], f2, new Date(), { today: TODAY, nowTime: '10:00', learned });
    expect(r.intent).toBe('open_now');
    const p = customerRuleReply('gội thảo mộc giá bao nhiêu', catalog, [], f2, new Date(), { today: TODAY, learned });
    expect(names(p)).toEqual(['Gội đầu dưỡng sinh thảo dược']);
  });

  it('viết lại câu (query rewriting): lời nhắc có ví dụ đã duyệt + ngữ cảnh; chỉ nhận một câu hợp lệ', () => {
    const msgs = buildRewriteMessages('cái đó bn', [{ role: 'user', content: 'gội đầu dưỡng sinh' }], catalog, [{ phrase: 'abc', rewrite: 'Giá cắt tóc nữ?' }]);
    expect(msgs[0].content).toContain('KHÔNG trả lời câu hỏi');
    expect(msgs[1]).toEqual({ role: 'user', content: 'abc' });
    expect(msgs.at(-1)!.content).toContain('Khách: gội đầu dưỡng sinh');
    expect(parseRewrite('"Ngày kia dịch vụ massage nào còn giờ trống?"\nGiải thích...', 'x')).toBe('Ngày kia dịch vụ massage nào còn giờ trống?');
    expect(parseRewrite('KHONG_RO', 'x')).toBeNull();
    expect(parseRewrite('alo', 'alo')).toBeNull();
  });
});

describe('Nhập vai khách — vòng 5 trên AI thật (tiếng lóng, nhầm nhóm, câu ngoài dữ liệu)', () => {
  const ask = (q: string, extra = {}) => customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T15:00:00Z'), { today: TODAY, nowTime: '22:00', ...extra });

  it.each([
    ['bn tiền gội đầu z', 'service_price'],
    ['sdt tiệm là gì', 'contact'],
    ['cho hỏi giá làm móng gel', 'service_price'],
    ['có j hot k', 'hot'],
  ])('tiếng lóng / viết tắt: "%s" → %s', (q, intent) => {
    expect(ask(q).intent).toBe(intent);
  });

  it('"chị ơi mai chiều 3h có ai rảnh làm nail k" → tra giờ trống cả nhóm móng 15:00 ngày mai', () => {
    const r = ask('chị ơi mai chiều 3h có ai rảnh làm nail k');
    expect(r.intent).toBe('availability');
    expect(r.pending).toMatchObject({ kind: 'availability_group', when: { date: '2026-10-13', time: '15:00' } });
  });

  it('"làm đẹp da mặt" gợi ý nhóm Chăm sóc da, không phải "Cạo mặt & tỉa râu"', () => {
    const r = ask('e muốn làm đẹp da mặt thì sao ạ');
    expect(names(r)).not.toContain('Cạo mặt & tỉa râu kiểu Barber');
    expect(r.suggestions.every((x) => /da/i.test(x.categoryName))).toBe(true);
  });

  it('"có làm tóc cho nam k" → Cắt tóc nam đứng đầu, combo không chen lên khi khách không hỏi combo', () => {
    const r = ask('có làm tóc cho nam k');
    expect(names(r)[0]).toBe('Cắt tóc nam tạo kiểu Barber');
    expect(names(r).some((n) => n.startsWith('Combo'))).toBe(false);
  });

  it('"tiệm có chỗ để xe hơi ko" không bị hiểu là hỏi giờ trống; chủ tiệm soạn câu trả lời thì dùng ngay', () => {
    expect(ask('tiệm có chỗ để xe hơi ko').intent).toBe('unknown');
    const learned = [{ kind: 'answer' as const, phrase: 'cho de xe', rewrite: 'Tiệm có bãi giữ xe máy miễn phí; ô tô đỗ ở bãi Nguyễn Văn Cừ cách 50m.' }];
    const r = ask('tiệm có chỗ để xe hơi ko', { learned });
    expect(r).toMatchObject({ intent: 'faq', answer: learned[0].rewrite });
    expect(ask('có nối tóc không', { learned }).intent).toBe('not_offered'); // câu luật đã hiểu không bị câu soạn sẵn chen ngang
  });

  it('kiểm tra trung thực câu viết lại: không được thêm dịch vụ khách không nhắc', () => {
    expect(faithfulRewrite('mát xoa giá bao nhiêu', 'Chăm sóc da chuyên sâu Vitamin C giá bao nhiêu?', catalog)).toBe(false);
    expect(faithfulRewrite('bn tiền gội đầu z', 'Nhuộm phủ bạc thảo dược giá bao nhiêu?', catalog)).toBe(false);
    expect(faithfulRewrite('cho hỏi giá làm móng gel', 'Làm móng gel giá bao nhiêu?', catalog)).toBe(true);
    expect(faithfulRewrite('ngay kia co dv mat xoa nao trong lich k', 'Ngày kia dịch vụ massage nào còn giờ trống?', catalog)).toBe(true);
    // "cái đó" lấy từ hội thoại: được phép
    expect(faithfulRewrite('cái đó bn', 'Phục hồi tóc Keratin Nano giá bao nhiêu?', catalog,
      [{ role: 'assistant', content: 'Gợi ý: Phục hồi tóc Keratin Nano — 60 phút' }])).toBe(true);
  });
});

describe('Nhập vai khách — vòng 6 trên AI thật', () => {
  const ask = (q: string, extra = {}) => customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T15:00:00Z'), { today: TODAY, nowTime: '22:00', ...extra });
  it('"có làm tóc cho nam k" → "giá sao" báo giá Cắt tóc nam (không phải Combo Cô dâu)', () => {
    const [, price] = talk('có làm tóc cho nam k', 'giá sao');
    expect(names(price)[0]).toBe('Cắt tóc nam tạo kiểu Barber');
  });
  it('"tóc mình xơ quá muốn mềm mượt lại thì làm j" → phục hồi / hấp dầu, không phải cắt tóc', () => {
    const r = ask('tóc mình xơ quá muốn mềm mượt lại thì làm j');
    expect(names(r)[0]).toMatch(/Phục hồi|Hấp dầu/);
    expect(names(r).some((n) => n.startsWith('Cắt tóc'))).toBe(false);
  });
  it('"tiem lam toi may h vay ban" → giờ mở cửa hôm nay', () => {
    const r = ask('tiem lam toi may h vay ban');
    expect(r.intent).toBe('hours');
    expect(r.answer).toContain('Hôm nay (Thứ hai 12/10)');
  });
});

describe('Nhập vai khách — vòng 7 (va chạm khi bỏ dấu, câu dẫn soạn sẵn)', () => {
  const ask = (q: string) => customerRuleReply(q, catalog, [], facts, new Date('2026-10-12T15:00:00Z'), { today: TODAY, nowTime: '22:00' });
  it('"tui mún đi spa thư dãn sau giờ làm" → massage thư giãn (không phải "Lấy nhân MỤN")', () => {
    const r = ask('tui mún đi spa thư dãn sau giờ làm');
    expect(names(r).some((n) => /mụn/i.test(n))).toBe(false);
    expect(names(r)[0]).toMatch(/Massage/);
    expect(r.answer.split('\n')[0]).toBe('Sau những giờ làm việc căng thẳng, được thư giãn một chút là điều rất nên 🌿');
  });
  it('"lịch trống thứ năm cho uốn tóc hàn" → Uốn sóng lơi Hàn Quốc (thứ NĂM ≠ tóc NAM)', () => {
    const r = ask('lịch trống thứ năm cho uốn tóc hàn');
    expect(r.pending).toMatchObject({ kind: 'availability', serviceId: byName('Uốn sóng lơi Hàn Quốc').id, when: { date: '2026-10-15' } });
  });
  it('không dấu: "tui mun di spa" = muốn; "da bi mun", "tri mun" = mụn', () => {
    expect(names(ask('tui mun di spa thu dan sau gio lam')).some((n) => /mụn/i.test(n))).toBe(false);
    expect(names(ask('da minh bi mun nhieu qua')).some((n) => /mụn/i.test(n))).toBe(true);
  });
  it('"dịch dụ tẩy da chết bao nhiu" → báo giá', () => {
    expect(ask('dịch dụ tẩy da chết bao nhiu').intent).toBe('service_price');
  });
  it('"toc toi dai muon tia lai chut thoi" → cắt tóc người lớn, không gợi ý trẻ em / tỉa râu', () => {
    const r = ask('toc toi dai muon tia lai chut thoi');
    expect(names(r).some((n) => /trẻ em|râu/.test(n))).toBe(false);
    expect(names(r)[0]).toMatch(/^Cắt tóc/);
  });
});
