import { ShiftRequestKind } from '../../database/entities/shift-request.entity';
import { describeShiftRequests } from './shift-requests.service';

describe('describeShiftRequests — thông báo yêu cầu ca/nghỉ nêu rõ loại, ngày, giờ (QA 11/10)', () => {
  it('chỉ ca làm: tiêu đề "đăng ký N ca làm", nội dung có ngày + khung giờ', () => {
    const n = describeShiftRequests('Hà', [
      { kind: ShiftRequestKind.SHIFT, workDate: '2026-10-13', startTime: '08:00', endTime: '17:00' },
    ]);
    expect(n.title).toBe('Hà đăng ký 1 ca làm');
    expect(n.body).toContain('13/10/2026: Ca làm 08:00–17:00');
  });

  it('chỉ xin nghỉ: phân biệt nghỉ cả ngày và nghỉ theo giờ, kèm lý do', () => {
    const n = describeShiftRequests('Hà', [
      { kind: ShiftRequestKind.TIME_OFF, workDate: '2026-10-14', startTime: null, endTime: null, note: 'Việc gia đình' },
      { kind: ShiftRequestKind.TIME_OFF, workDate: '2026-10-15', startTime: '13:00', endTime: '15:00' },
    ]);
    expect(n.title).toBe('Hà xin nghỉ 2 ngày');
    expect(n.body).toContain('Nghỉ cả ngày — "Việc gia đình"');
    expect(n.body).toContain('Nghỉ 13:00–15:00');
  });

  it('hỗn hợp, nhiều mục: tiêu đề gộp, chỉ liệt kê 3 mục và giữ trong giới hạn cột', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      kind: i % 2 ? ShiftRequestKind.TIME_OFF : ShiftRequestKind.SHIFT,
      workDate: `2026-10-1${i}`, startTime: '09:00', endTime: '18:00', note: 'x'.repeat(300),
    }));
    const n = describeShiftRequests('Hà', items);
    expect(n.title).toBe('Hà gửi 5 yêu cầu ca làm & xin nghỉ');
    expect(n.body).toContain('… và 2 yêu cầu khác');
    expect(n.body.length).toBeLessThanOrEqual(500);
  });
});
