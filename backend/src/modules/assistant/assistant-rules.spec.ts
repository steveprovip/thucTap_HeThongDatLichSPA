import { AssistantContext, contextForLlm, detectIntent, hourLabel, quickReplies, ruleAnswer } from './assistant-rules';

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

  it('ngữ cảnh gửi mô hình chỉ gồm số liệu tổng hợp', () => {
    const text = contextForLlm(ctx);
    expect(text).toContain('Giờ vàng: T7 10:00–11:00 (42 lượt)');
    expect(text).not.toMatch(/0\d{9}|@/); // không SĐT / email
  });
});
