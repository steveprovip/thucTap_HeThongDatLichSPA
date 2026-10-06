import { rankSmartSlots, scoreSmartSlot, SmartSlotCandidate } from './smart-slots';

const base: SmartSlotCandidate = {
  date: '2026-10-10', dayOffset: 0, start: 9 * 60, duration: 60, stylistId: 'a', stylistName: 'An',
  freeStart: 9 * 60, freeEnd: 12 * 60, dayLoadMinutes: 0, maxDayLoad: 0, minDayLoad: 0, earliestOfDay: 9 * 60,
};

describe('Trợ lý AI xếp lịch — chấm điểm khung giờ (Mentor S2 · mục 4)', () => {
  it('khung lấp kín khoảng trống được cộng điểm nhiều nhất và nêu lý do', () => {
    const snug = scoreSmartSlot({ ...base, freeStart: 9 * 60, freeEnd: 10 * 60 });
    const edge = scoreSmartSlot(base);
    expect(snug.score).toBeGreaterThan(edge.score);
    expect(snug.reasons).toContain('Lấp kín một khoảng trống của thợ');
    expect(edge.reasons).toContain('Nối tiếp ngay sau lịch / đầu ca, không để trống');
  });

  it('để lại khoảng lẻ < 30 phút bị trừ điểm', () => {
    const frag = scoreSmartSlot({ ...base, start: 9 * 60 + 15 });
    expect(frag.reasons).toContain('Để lại khoảng lẻ 15′ khó xếp khách khác');
    expect(frag.score).toBeLessThan(scoreSmartSlot({ ...base, start: 10 * 60 }).score);
  });

  it('ưu tiên ngày gần và thợ ít lịch', () => {
    expect(scoreSmartSlot({ ...base, dayOffset: 1 }).score).toBeLessThan(scoreSmartSlot(base).score);
    const busy = scoreSmartSlot({ ...base, dayLoadMinutes: 300, maxDayLoad: 300, minDayLoad: 0 });
    const idle = scoreSmartSlot({ ...base, dayLoadMinutes: 0, maxDayLoad: 300, minDayLoad: 0 });
    expect(idle.score).toBeGreaterThan(busy.score);
    expect(idle.reasons).toContain('Thợ chưa có lịch nào trong ngày');
  });

  it('kết quả đa dạng: mỗi thợ mỗi ngày tối đa 2 gợi ý, sắp theo điểm', () => {
    const many: SmartSlotCandidate[] = [];
    for (let k = 0; k < 6; k += 1) many.push({ ...base, start: 9 * 60 + k * 15 });
    many.push({ ...base, stylistId: 'b', stylistName: 'Bình', start: 11 * 60, freeStart: 11 * 60, freeEnd: 12 * 60 });
    const out = rankSmartSlots(many, 6);
    expect(out.filter((x) => x.stylistId === 'a')).toHaveLength(2);
    expect(out.some((x) => x.stylistId === 'b')).toBe(true);
    for (let i = 1; i < out.length; i += 1) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    expect(out[0]).toMatchObject({ time: expect.stringMatching(/^\d{2}:\d{2}$/), endTime: expect.any(String) });
  });
});
