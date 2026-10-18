import { AssistantContext, contextForLlm, detectIntent, hourLabel, parsePeriod, quickReplies, ruleAnswer, topN } from './assistant-rules';

const ctx: AssistantContext = {
  goldenHours: [{ dow: 6, dayLabel: 'T7', hour: 10, label: hourLabel(6, 10), bookings: 42 }],
  quietHours: [{ dow: 2, dayLabel: 'T3', hour: 14, label: hourLabel(2, 14), bookings: 1 }],
  combos: [{ names: ['Cắt tóc', 'Gội dưỡng'], count: 12, totalDuration: 75, totalPrice: 250000, priceText: '250.000 ₫' }],
  topServices: [{ name: 'Cắt tóc', count: 50 }],
  gaps: [{ date: '2026-10-13', dayText: 'Thứ 3 13/10', startTime: '18:00', endTime: '20:00', minCount: 0, hint: null,
    candidates: [{ stylistId: 'x', fullName: 'Hà', weekMinutes: 1200 }] }],
  holidays: [{ name: 'Quốc khánh', startDate: '2027-09-02', endDate: '2027-09-02', days: 1, status: 'ready' }],
};

describe('Trợ lý AI — luật dự phòng khi không có mô hình ngôn ngữ (Part 5)', () => {
  it('nhận diện ý định tiếng Việt có / không dấu', () => {
    expect(detectIntent('Tuần sau thiếu thợ ca nào?')).toBe('shifts');
    expect(detectIntent('xep ca giup minh')).toBe('shifts');
    expect(detectIntent('Thêm ngày lễ năm nay')).toBe('holidays');
    expect(detectIntent('Giờ vàng là mấy giờ?')).toBe('golden');
    expect(detectIntent('khach goi dat cat toc thi goi y combo gi')).toBe('combo');
    expect(detectIntent('xin chào')).toBe('greeting');
    expect(detectIntent('alo')).toBe('greeting');
    expect(detectIntent('Bạn là ai vậy?')).toBe('identity');
    expect(detectIntent('hướng dẫn tôi dùng với')).toBe('help');
    expect(detectIntent('chào bạn, tuần này thiếu thợ không')).toBe('shifts'); // chủ đề nghiệp vụ thắng câu chào
    expect(detectIntent('thời tiết hôm nay')).toBe('general');
  });

  it('trả lời có số liệu cụ thể, kèm gợi ý thao tác', () => {
    expect(ruleAnswer('shifts', ctx)).toContain('Thứ 3 13/10 18:00–20:00: KHÔNG có thợ → gợi ý xếp Hà');
    expect(ruleAnswer('golden', ctx)).toContain('T7 10:00–11:00');
    expect(ruleAnswer('golden', ctx)).toContain('T3 14:00–15:00');
    expect(ruleAnswer('combo', ctx)).toContain('Cắt tóc + Gội dưỡng — 12 lượt');
    expect(ruleAnswer('holidays', ctx)).toContain('Quốc khánh (02/09)');
  });

  it('hội thoại tự nhiên: chào lại theo tên, giới thiệu bản thân, câu chưa hiểu thì hỏi lại (không đổ số liệu)', () => {
    const hi = ruleAnswer('greeting', ctx, { userName: 'Nguyễn Thị Lan' });
    expect(hi).toMatch(/^Chào Lan!/);
    expect(hi).toContain('1 khung giờ thiếu thợ');
    expect(ruleAnswer('identity', ctx)).toContain('Trợ lý vận hành');
    expect(ruleAnswer('help', ctx)).toContain('Bạn có thể hỏi tự nhiên');
    const unknown = ruleAnswer('general', ctx);
    expect(unknown).toContain('chưa chắc đã hiểu');
    expect(unknown).not.toContain('T7 10:00');
    expect(quickReplies('golden')).not.toContain('Giờ vàng tuần này?');
  });

  it('TASK v4 · NV1: xưng hô / chào hỏi / hướng dẫn được đáp thân thiện, không bao giờ in bảng giờ vàng', () => {
    const cases: [string, string][] = [
      ['bạn là ai', 'identity'], ['Bạn giúp được gì cho mình?', 'identity'], ['hướng dẫn tôi', 'help'], ['chào bạn', 'greeting'],
      ['alo', 'greeting'], ['alo alo', 'greeting'], ['Bạn khỏe không?', 'greeting'], ['cảm ơn nhé', 'thanks'], ['tạm biệt', 'bye'],
    ];
    for (const [q, intent] of cases) {
      expect(detectIntent(q)).toBe(intent);
      const answer = ruleAnswer(detectIntent(q), ctx, { userName: 'Đỗ Thanh Mai', now: new Date('2026-10-11T02:00:00Z') });
      expect(answer).not.toContain('T7 10:00–11:00'); // không đổ số liệu giờ vàng khi chỉ xã giao
      expect(answer.length).toBeGreaterThan(20);
    }
    // 09:00 giờ tiệm → "buổi sáng"; 20:00 → "buổi tối"
    expect(ruleAnswer('greeting', ctx, { userName: 'Đỗ Thanh Mai', now: new Date('2026-10-11T02:00:00Z') })).toMatch(/^Chào Mai! Chúc bạn buổi sáng/);
    expect(ruleAnswer('greeting', ctx, { now: new Date('2026-10-11T13:00:00Z') })).toContain('buổi tối');
    expect(ruleAnswer('help', ctx)).toContain('Chờ xác nhận');
    expect(ruleAnswer('bye', ctx, { userName: 'Lan' })).toMatch(/^Tạm biệt Lan!/);
  });

  it('TASK v4 · NV1: "tình hình hôm nay" trả số liệu tổng hợp của ngày, "thời tiết hôm nay" thì không', () => {
    expect(detectIntent('Hôm nay có bao nhiêu lịch?')).toBe('today');
    expect(detectIntent('tinh hinh hom nay the nao')).toBe('today');
    expect(detectIntent('thời tiết hôm nay')).toBe('general');
    const today = {
      date: '2026-10-11', dayText: 'CN 11/10', total: 12, revenue: 3_450_000, revenueText: '3.450.000 ₫', pendingTotal: 4, pendingOverdue: 1,
      byStatus: { pending: 2, confirmed: 5, arrived: 0, in_progress: 1, completed: 4, cancelled: 0, no_show: 0 },
    };
    const text = ruleAnswer('today', { ...ctx, today });
    expect(text).toContain('12 lịch hẹn');
    expect(text).toContain('5 đã xác nhận');
    expect(text).toContain('3.450.000 ₫');
    expect(text).toContain('4 lịch online chờ xác nhận (1 lịch đã chờ quá 12 giờ)');
    expect(ruleAnswer('today', ctx)).toContain('Lịch ngày');
    expect(quickReplies('today')).not.toContain('Tình hình hôm nay thế nào?');
    expect(contextForLlm({ ...ctx, today })).toContain('Hôm nay CN 11/10: 12 lịch');
  });

  it('QA 12/10: hỏi thợ đang trực / ai đang rảnh → liệt kê thợ có ca hôm nay, không rơi vào "chưa hiểu"', () => {
    for (const q of ['Đang có thợ nào làm việc vậy?', 'Ai đang rảnh?', 'hom nay ai di lam', 'Thợ trực hôm nay', 'Có mấy thợ đang làm?',
      'danh sach tho hom nay', 'Ai đang trực vậy em']) {
      expect(detectIntent(q)).toBe('working_stylists');
    }
    // câu xếp ca vẫn là xếp ca
    expect(detectIntent('Tuần sau thiếu thợ ca nào?')).toBe('shifts');
    expect(detectIntent('chào bạn, tuần này thiếu thợ không')).toBe('shifts');

    const workingToday = [
      { fullName: 'Trần Thu Hà', shiftsText: '09:00–18:00 (nghỉ 12:00–13:00)', onShiftNow: true, busyNow: true, timeOff: null },
      { fullName: 'Lê Minh', shiftsText: '13:00–21:00', onShiftNow: true, busyNow: false, timeOff: null },
      { fullName: 'Phạm Lan', shiftsText: '18:00–21:00', onShiftNow: false, busyNow: false, timeOff: '14:00–16:00' },
    ];
    const text = ruleAnswer('working_stylists', { ...ctx, workingToday });
    expect(text).toContain('Hôm nay có 3 thợ có ca làm');
    expect(text).toContain('• Trần Thu Hà: 09:00–18:00 (nghỉ 12:00–13:00) — đang làm khách');
    expect(text).toContain('• Phạm Lan: 18:00–21:00 · xin nghỉ 14:00–16:00');
    expect(text).toContain('Lúc này 2 thợ đang trong ca, đang rảnh: Lê Minh.');
    expect(text).not.toContain('chưa chắc đã hiểu');
    expect(ruleAnswer('working_stylists', { ...ctx, workingToday: [] })).toContain('chưa có thợ nào được xếp ca');
    expect(ruleAnswer('working_stylists', { ...ctx, workingToday: null })).toContain('Bảng ca làm');
    expect(contextForLlm({ ...ctx, workingToday })).toContain('Thợ có ca hôm nay: Trần Thu Hà 09:00–18:00');
    expect(contextForLlm({ ...ctx, workingToday })).toContain('Lê Minh 13:00–21:00 — đang rảnh');
    expect(quickReplies('today')).toContain('Đang có thợ nào làm việc?');
  });

  it('ngữ cảnh gửi mô hình chỉ gồm số liệu tổng hợp', () => {
    const text = contextForLlm(ctx);
    expect(text).toContain('Giờ vàng: T7 10:00–11:00 (42 lượt)');
    expect(text).not.toMatch(/0\d{9}|@/); // không SĐT / email
  });
});

describe('QA Sprint 3 · mục 6 — các câu trợ lý từng trả "chưa hiểu"', () => {
  it('nhận đúng ý định của 7 câu hỏi trong biên bản QA', () => {
    expect(detectIntent('liệt kê 5 khách sử dụng dịch vụ nhiều nhất cùng số lượng')).toBe('top_customers');
    expect(detectIntent('khách có lịch gần nhất tính từ thời điểm hiện tại')).toBe('next_appointment');
    expect(detectIntent('tiệm nghỉ vào ngày nào')).toBe('closed_days');
    expect(detectIntent('tiệm có bao nhiêu dịch vụ')).toBe('service_count');
    expect(detectIntent('báo cáo doanh thu tuần vừa rồi')).toBe('revenue');
    expect(detectIntent('thợ nào làm ít nhất tuần vừa rồi')).toBe('stylist_load');
    expect(detectIntent('các ngày lễ tiệm nghỉ')).toBe('holidays');
    // không phá các ý định cũ
    expect(detectIntent('Đang có thợ nào làm việc vậy?')).toBe('working_stylists');
    expect(detectIntent('ca nào thiếu thợ nhất')).toBe('shifts');
    expect(detectIntent('doanh thu hôm nay')).toBe('today');
    expect(detectIntent('Ngày lễ sắp tới?')).toBe('holidays');
  });

  it('kỳ báo cáo & số lượng trong câu hỏi', () => {
    // 18/10/2026 là Chủ nhật → tuần trước = T2 05/10 – CN 11/10
    expect(parsePeriod('doanh thu tuần vừa rồi', '2026-10-18')).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
    expect(parsePeriod('tuần này', '2026-10-18')).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(parsePeriod('tháng trước', '2026-10-18')).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(parsePeriod('30 ngày qua', '2026-10-18')).toMatchObject({ from: '2026-09-19', to: '2026-10-18' });
    expect(parsePeriod('doanh thu', '2026-10-18')).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(topN('liệt kê 5 khách sử dụng dịch vụ nhiều nhất')).toBe(5);
    expect(topN('top 10 khách')).toBe(10);
    expect(topN('khách thân thiết')).toBe(5);
  });

  it('trả lời bằng số liệu thật, không rơi vào câu "chưa hiểu"', () => {
    const facts = {
      topCustomers: [{ fullName: 'Lê Bảo Quyên', visits: 17, spentText: '4.250.000 ₫' }],
      upcoming: [{ fullName: 'Đỗ Quỳnh Giang', whenText: '19:30 T7 17/10', services: 'Đắp móng bột', stylist: 'Phan Thuỳ Linh', statusLabel: 'Đã xác nhận', minutesUntil: 75 }],
      closed: { weeklyClosed: [], upcoming: [{ reason: 'Nghỉ Tết', startDate: '2027-02-05', endDate: '2027-02-09' }] },
      services: { total: 32, byCategory: [{ name: 'Tóc', count: 12 }, { name: 'Móng', count: 8 }], minPriceText: '50.000 ₫', maxPriceText: '1.200.000 ₫' },
      revenue: { label: 'tuần trước (05/10–11/10)', totalText: '12.500.000 ₫', invoices: 40, avgText: '312.500 ₫', changePct: 8, bestDay: '10/10 (3.100.000 ₫)' },
      stylistLoad: { label: 'tuần trước', order: 'asc' as const, rows: [{ fullName: 'Bùi Gia Huy', done: 3, minutes: 135 }] },
    };
    const c = { ...ctx, facts };
    expect(ruleAnswer('top_customers', c)).toContain('1. Lê Bảo Quyên — 17 lượt');
    expect(ruleAnswer('next_appointment', c)).toContain('còn 1 giờ 15 phút');
    expect(ruleAnswer('closed_days', c)).toMatch(/mở cửa tất cả.*Nghỉ Tết \(05\/02–09\/02\).*Quốc khánh/);
    expect(ruleAnswer('service_count', c)).toContain('32 dịch vụ trong 2 nhóm: Tóc (12), Móng (8)');
    expect(ruleAnswer('revenue', c)).toContain('12.500.000 ₫ từ 40 phiếu');
    expect(ruleAnswer('revenue', c)).toContain('+8%');
    expect(ruleAnswer('stylist_load', c)).toContain('• Bùi Gia Huy: 3 lượt · 2h15 phục vụ');
    for (const k of ['top_customers', 'next_appointment', 'closed_days', 'service_count', 'revenue', 'stylist_load'] as const) {
      expect(ruleAnswer(k, c)).not.toContain('chưa chắc đã hiểu');
    }
  });
});
