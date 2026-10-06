import { computeDayCoverage, rankGapCandidates } from './coverage';

const h = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

describe('Độ phủ ca làm (Mentor S2 · mục 9)', () => {
  it('tiệm 08:00–20:00, một thợ 09:00–17:00 nghỉ 12:00–13:00 -> 3 khoảng trống', () => {
    const cov = computeDayCoverage({
      open: h('08:00'), close: h('20:00'),
      shifts: [{ stylistId: 'a', start: h('09:00'), end: h('17:00'), breakStart: h('12:00'), breakEnd: h('13:00') }],
    });
    expect(cov.gaps).toEqual([
      { start: h('08:00'), end: h('09:00'), minCount: 0 },
      { start: h('12:00'), end: h('13:00'), minCount: 0 },
      { start: h('17:00'), end: h('20:00'), minCount: 0 },
    ]);
    expect(cov.coveredMinutes).toBe(7 * 60);
    expect(cov.coveragePercent).toBe(58);
  });

  it('hai ca nối tiếp phủ kín -> không cảnh báo; nghỉ giữa ca của người này được người kia bù', () => {
    const cov = computeDayCoverage({
      open: h('08:00'), close: h('20:00'),
      shifts: [
        { stylistId: 'a', start: h('08:00'), end: h('14:00'), breakStart: h('11:00'), breakEnd: h('12:00') },
        { stylistId: 'b', start: h('10:00'), end: h('20:00') },
      ],
    });
    expect(cov.gaps).toEqual([]);
    expect(cov.coveragePercent).toBe(100);
    expect(cov.peakCount).toBe(2);
  });

  it('thợ xin nghỉ theo giờ không được tính là có mặt', () => {
    const cov = computeDayCoverage({
      open: h('09:00'), close: h('12:00'),
      shifts: [{ stylistId: 'a', start: h('09:00'), end: h('12:00') }],
      timeOff: [{ stylistId: 'a', start: h('10:00'), end: h('11:00') }],
    });
    expect(cov.gaps).toEqual([{ start: h('10:00'), end: h('11:00'), minCount: 0 }]);
  });

  it('minStaff = 2: khung chỉ có 1 thợ cũng là khoảng trống (minCount = 1)', () => {
    const cov = computeDayCoverage({
      open: h('09:00'), close: h('11:00'), minStaff: 2,
      shifts: [{ stylistId: 'a', start: h('09:00'), end: h('11:00') }, { stylistId: 'b', start: h('10:00'), end: h('11:00') }],
    });
    expect(cov.gaps).toEqual([{ start: h('09:00'), end: h('10:00'), minCount: 1 }]);
    expect(cov.hourly).toEqual([{ hour: 9, count: 1 }, { hour: 10, count: 2 }]);
  });

  it('gợi ý thợ rảnh, ít giờ làm trong tuần nhất lên trước; loại thợ đang có ca / xin nghỉ', () => {
    const list = rankGapCandidates({
      gap: { start: h('17:00'), end: h('20:00') },
      stylists: [{ id: 'a', fullName: 'An' }, { id: 'b', fullName: 'Bình' }, { id: 'c', fullName: 'Chi' }, { id: 'd', fullName: 'Dung' }],
      shiftsToday: [{ stylistId: 'a', start: h('16:00'), end: h('18:00') }],
      timeOffToday: [{ stylistId: 'd', start: null, end: null }],
      weekMinutes: new Map([['b', 2400], ['c', 600]]),
    });
    expect(list.map((x) => x.stylistId)).toEqual(['c', 'b']);
  });
});
