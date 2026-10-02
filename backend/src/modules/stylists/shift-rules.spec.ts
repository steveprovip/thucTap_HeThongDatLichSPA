import { findShiftOverlap, shiftDayText, shiftLabel, ShiftRange, shiftRangeText } from './shift-rules';
import { MSG } from '../../common/constants/messages.constant';

const saved: ShiftRange[] = [
  { id: 'a', workDate: '2026-10-05', startTime: '08:00', endTime: '12:00', note: null },
  { id: 'b', workDate: '2026-10-05', startTime: '13:00', endTime: '17:00', note: 'Ca nhuộm chiều' },
];

describe('QA-07 — xung đột ca làm nêu rõ tên ca và khung giờ', () => {
  it('phát hiện ca chồng lấn và trả về đúng ca bị đè', () => {
    const hit = findShiftOverlap({ workDate: '2026-10-05', startTime: '11:00', endTime: '14:00' }, saved);
    expect(hit?.id).toBe('a');
  });

  it('hai ca nối tiếp [08:00,12:00) và [12:00,13:00) KHÔNG chồng lấn (giống EXCLUDE tsrange "[)")', () => {
    expect(findShiftOverlap({ workDate: '2026-10-05', startTime: '12:00', endTime: '13:00' }, saved)).toBeNull();
  });

  it('khác ngày thì không chồng lấn; khi sửa ca bỏ qua chính nó', () => {
    expect(findShiftOverlap({ workDate: '2026-10-06', startTime: '09:00', endTime: '10:00' }, saved)).toBeNull();
    expect(findShiftOverlap({ id: 'a', workDate: '2026-10-05', startTime: '07:30', endTime: '12:00' }, saved)).toBeNull();
  });

  it('tên ca: ưu tiên ghi chú, không có thì suy theo giờ bắt đầu', () => {
    expect(shiftLabel(saved[1])).toBe('Ca nhuộm chiều');
    expect(shiftLabel({ startTime: '08:00', note: null })).toBe('Ca sáng');
    expect(shiftLabel({ startTime: '13:30', note: '  ' })).toBe('Ca chiều');
    expect(shiftLabel({ startTime: '18:00' })).toBe('Ca tối');
  });

  it('thông điệp lỗi chứa tên ca, khung giờ bị xung đột và ngày', () => {
    const hit = findShiftOverlap({ workDate: '2026-10-05', startTime: '15:00', endTime: '19:00' }, saved)!;
    const msg = MSG.SHIFT_OVERLAP_DETAIL(
      shiftRangeText({ startTime: '15:00', endTime: '19:00' }), shiftLabel(hit), shiftRangeText(hit), shiftDayText('2026-10-05'),
    );
    expect(msg).toContain('"Ca nhuộm chiều"');
    expect(msg).toContain('13:00–17:00');
    expect(msg).toContain('15:00–19:00');
    expect(msg).toContain('Thứ hai 05/10/2026');
  });
});
