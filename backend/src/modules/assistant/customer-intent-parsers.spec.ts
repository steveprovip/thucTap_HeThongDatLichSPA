import { fold } from './assistant-rules';
import { AVAILABILITY_RE, parseBudget, parseMoney, parseWhen } from './customer-intent-parsers';

// Thứ hai 12/10/2026
const TODAY = '2026-10-12';
const when = (q: string) => parseWhen(fold(q), TODAY);

describe('Đọc ngày / buổi / giờ khách hỏi (QA nhập vai 12/10)', () => {
  it('hôm nay / mai / mốt / thứ trong tuần / ngày cụ thể', () => {
    expect(when('chiều nay còn giờ trống không')).toMatchObject({ date: TODAY, explicitDate: true, part: 'chieu', time: null });
    expect(when('mai 9h sáng còn chỗ không')).toMatchObject({ date: '2026-10-13', part: 'sang', time: '09:00' });
    expect(when('thứ 7 này còn giờ nào buổi sáng')).toMatchObject({ date: '2026-10-17', part: 'sang' });
    expect(when('chủ nhật có làm không')).toMatchObject({ date: '2026-10-18' });
    expect(when('thứ 2 tuần sau')).toMatchObject({ date: '2026-10-19' });
    expect(when('ngày mốt còn chỗ không').date).toBe('2026-10-14');
    expect(when('15/10 lúc 3 giờ chiều')).toMatchObject({ date: '2026-10-15', part: 'chieu', time: '15:00' });
    expect(when('dat lich giup minh 3 gio chieu mai cat toc nu')).toMatchObject({ date: '2026-10-13', time: '15:00' });
    expect(when('còn giờ nào không')).toMatchObject({ date: TODAY, explicitDate: false });
  });

  it('không nhầm "tôi" là buổi tối, "sang" là buổi sáng, "mái tóc" là ngày mai, "5 tuổi" là 5 giờ', () => {
    expect(when('tôi muốn cắt tóc').part).toBeNull();
    expect(when('chuyển sang thợ khác được không').part).toBeNull();
    expect(when('tỉa mái tóc giá bao nhiêu').explicitDate).toBe(false);
    expect(when('bé 5 tuổi cắt mất bao lâu').time).toBeNull();
    expect(when('tối nay 7h còn chỗ không')).toMatchObject({ part: 'toi', time: '19:00' });
  });

  it('nhận ra câu hỏi giờ trống', () => {
    for (const q of ['chiều nay còn giờ trống không', 'mai 9h sáng còn chỗ không', 'thứ 7 này còn giờ nào buổi sáng',
      'Massage chân bấm huyệt trong hôm nay có những giờ nào đặt được nữa ?', 'tối nay còn nhận khách không']) {
      expect(AVAILABILITY_RE.test(fold(q))).toBe(true);
    }
    expect(AVAILABILITY_RE.test(fold('mấy giờ mở cửa'))).toBe(false);
  });
});

describe('Đọc ngân sách', () => {
  it('đơn vị tiền tiếng Việt', () => {
    expect(parseMoney('200', 'k')).toBe(200_000);
    expect(parseMoney('300', 'nghin')).toBe(300_000);
    expect(parseMoney('200.000', undefined)).toBe(200_000);
    expect(parseMoney('1', 'tr5')).toBe(1_500_000);
    expect(parseMoney('1,5', 'trieu')).toBe(1_500_000);
    expect(parseMoney('2', 'tram')).toBe(200_000);
  });

  it('dưới / tầm / trên', () => {
    expect(parseBudget(fold('có gì dưới 200k không'))).toMatchObject({ min: null, max: 200_000 });
    expect(parseBudget(fold('tầm 300 nghìn thì làm được gì'))).toMatchObject({ min: 225_000, max: 345_000 });
    expect(parseBudget(fold('500k làm được gì'))).toMatchObject({ min: 375_000, max: 575_000 });
    expect(parseBudget(fold('dịch vụ trên 1tr5'))).toMatchObject({ min: 1_500_000, max: null });
    expect(parseBudget(fold('dưới 2 trăm có gì'))).toMatchObject({ max: 200_000 });
    expect(parseBudget(fold('bé 5 tuổi cắt mất bao lâu'))).toBeNull();
    expect(parseBudget(fold('massage 60 phút'))).toBeNull();
  });
});
