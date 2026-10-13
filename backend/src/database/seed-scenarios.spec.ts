import { outcomeOf } from './seed-scenarios';
import { COVERAGE } from './seed-coverage';

describe('Dữ liệu mẫu sát thực tế (ghi chú test 13/10)', () => {
  it('lịch đã qua được chốt TẤT ĐỊNH (chạy lại ra cùng kết quả), tỉ lệ như tiệm thật: ~84% hoàn tất, ~5% không đến, ~11% huỷ', () => {
    const codes = Array.from({ length: 5000 }, (_, i) => `K${String(i).padStart(7, '0')}`);
    const count = { completed: 0, no_show: 0, cancelled: 0 };
    for (const c of codes) count[outcomeOf(c)] += 1;
    expect(outcomeOf('ABCD2345')).toBe(outcomeOf('ABCD2345'));
    expect(count.completed / 5000).toBeGreaterThan(0.8);
    expect(count.completed / 5000).toBeLessThan(0.88);
    expect(count.no_show / 5000).toBeGreaterThan(0.03);
    expect(count.no_show / 5000).toBeLessThan(0.07);
    expect(count.cancelled / 5000).toBeGreaterThan(0.08);
  });

  it('bảng độ phủ: mỗi tình huống gắn mã story, có chỗ mở trên giao diện, phủ đủ 6 epic', () => {
    for (const r of COVERAGE) {
      expect(r.story).toBeTruthy();
      expect(r.where).toBeTruthy();
      expect(r.sql).toMatch(/SELECT/i);
    }
    const stories = new Set(COVERAGE.flatMap((r) => r.story.match(/S\d-\d{2}/g) ?? []));
    for (const s of ['S1-01', 'S1-05', 'S2-01', 'S2-07', 'S3-02', 'S3-09', 'S4-01', 'S4-04', 'S4-07']) expect(stories.has(s)).toBe(true);
    expect(stories.size).toBeGreaterThanOrEqual(30);
  });
});
