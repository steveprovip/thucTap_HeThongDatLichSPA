import { CATEGORIES, PHONE_PREFIXES, SERVICES, STYLISTS } from './realistic/catalog';
import { bookingCode, demandAt, makeCustomers, planDay, rng, shiftFor } from './seed-realistic';

describe('Dữ liệu thực tế (TASK v4 · NV2) — danh mục đúng bất biến nghiệp vụ', () => {
  it('dịch vụ: tên thật không trùng, không còn "Tải thử", thời lượng bội số 15 (15–240), giá ≤ 20 triệu, ảnh https riêng', () => {
    const names = SERVICES.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(SERVICES.length);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(SERVICES.length);
    expect(new Set(SERVICES.map((s) => s.imageUrl)).size).toBe(SERVICES.length); // mỗi dịch vụ một ảnh
    for (const s of SERVICES) {
      expect(s.name).not.toMatch(/tải thử|scale-seed|test/i);
      expect(s.duration % 15).toBe(0);
      expect(s.duration).toBeGreaterThanOrEqual(15);
      expect(s.duration).toBeLessThanOrEqual(240);
      expect(s.price).toBeGreaterThan(0);
      expect(s.price).toBeLessThanOrEqual(20_000_000);
      expect(s.imageUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/);
      expect(CATEGORIES.some((c) => c.id === s.categoryId)).toBe(true);
    }
    // Các dịch vụ tiêu biểu theo yêu cầu đều có mặt
    for (const want of ['Gội đầu dưỡng sinh thảo dược', 'Cắt tóc nữ layer tạo kiểu', 'Uốn sóng lơi Hàn Quốc', 'Nhuộm Balayage thời trang',
      'Phục hồi tóc Keratin Nano', 'Chăm sóc da chuyên sâu Vitamin C', 'Lấy nhân mụn chuẩn y khoa', 'Massage body đá nóng',
      'Massage bấm huyệt cổ vai gáy', 'Làm móng Gel Nail Art cao cấp', 'Tắm trắng phi thuyền Collagen']) {
      expect(SERVICES.map((s) => s.name)).toContain(want);
    }
  });

  it('chuyên viên: tên thật, SĐT di động VN đúng dải, mọi dịch vụ đều có ít nhất một người làm được', () => {
    expect(STYLISTS.map((s) => s.fullName)).toEqual(expect.arrayContaining(
      ['Nguyễn Bảo Ngọc', 'Trần Minh Đức', 'Lê Thu Hà', 'Đặng Hoài Nam', 'Phan Thuỳ Linh', 'Vũ Kim Chi', 'Hoàng Thuỳ Linh']));
    for (const st of STYLISTS) {
      expect(st.phone).toMatch(/^0\d{9}$/);
      expect(PHONE_PREFIXES.some((p) => st.phone.startsWith(p))).toBe(true);
      expect(st.skills.length).toBeGreaterThan(0);
    }
    expect(new Set(STYLISTS.map((s) => s.phone)).size).toBe(STYLISTS.length);
    for (const s of SERVICES) expect(STYLISTS.some((st) => st.skills.includes(s.key))).toBe(true);
  });
});

describe('Bộ sinh dữ liệu — tất định, hợp lệ, không chồng lấn', () => {
  it('khách: tên Việt, SĐT không trùng theo dải 098/090/091/038/077, email chỉ @example.com, chạy lại ra y hệt', () => {
    const a = makeCustomers(500);
    expect(a).toEqual(makeCustomers(500));
    expect(new Set(a.map((c) => c.phone)).size).toBe(500);
    for (const c of a) {
      expect(c.phone).toMatch(/^(098|090|091|038|077)\d{7}$/);
      expect(c.fullName.split(' ').length).toBeGreaterThanOrEqual(3);
      if (c.email) expect(c.email).toMatch(/^[a-z0-9.]+@example\.com$/);
    }
    const female = a.filter((c) => c.gender === 'female').length / a.length;
    expect(female).toBeGreaterThan(0.6); // khách salon & spa phần lớn là nữ
  });

  it('mã tra cứu tất định 8 ký tự, cùng bảng chữ máy chủ (không 0/O/1/I/L)', () => {
    const c = bookingCode('33333333-3333-4333-8333-100000000001', '2026-10-11', '09:15');
    expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    expect(bookingCode('33333333-3333-4333-8333-100000000001', '2026-10-11', '09:15')).toBe(c);
    expect(bookingCode('33333333-3333-4333-8333-100000000001', '2026-10-11', '09:30')).not.toBe(c);
  });

  it('ca làm nằm trong giờ mở cửa, nghỉ đúng ngày nghỉ cố định, giờ nghỉ nằm trong ca', () => {
    const weekday = { open: 510, close: 1200, closed: false };
    const st = STYLISTS[0]; // nghỉ thứ 2
    expect(shiftFor(st, '2026-10-12', weekday)).toBeNull(); // 12/10/2026 là thứ 2
    for (const pattern of ['full', 'early', 'late', 'rotate'] as const) {
      const sh = shiftFor({ offDay: 1, pattern }, '2026-10-14', weekday)!;
      expect(sh.start).toBeGreaterThanOrEqual(510);
      expect(sh.end).toBeLessThanOrEqual(1200);
      expect(sh.end - sh.start).toBeGreaterThanOrEqual(240);
      if (sh.breakStart !== null) expect(sh.breakStart >= sh.start && (sh.breakEnd ?? 0) <= sh.end).toBe(true);
    }
    expect(shiftFor(st, '2026-10-14', { ...weekday, closed: true })).toBeNull();
  });

  it('giờ vàng thật: tối ngày thường và cuối tuần đông hơn sáng ngày thường', () => {
    expect(demandAt(3, 18 * 60)).toBeGreaterThan(demandAt(3, 9 * 60) * 2);
    expect(demandAt(6, 10 * 60)).toBeGreaterThan(demandAt(2, 10 * 60));
  });

  it('lịch một ngày: lưới 15 phút, nằm gọn trong ca, né lịch đã có, chỉ dịch vụ thợ làm được', () => {
    const st = STYLISTS.find((s) => s.fullName === 'Lê Thu Hà')!;
    const skills = SERVICES.filter((s) => st.skills.includes(s.key));
    const segments: [number, number][] = [[540, 720], [780, 1080]];
    const busy: [number, number][] = [[600, 660], [900, 960]];
    for (let i = 0; i < 40; i += 1) {
      const plan = planDay({ dow: 6, segments, busy, skills, demand: 1.2, factor: 1, r: rng(`test|${i}`) });
      const spans = plan.map((p) => [p.start, p.start + p.duration] as [number, number]);
      for (const p of plan) {
        expect(p.start % 15).toBe(0);
        expect(p.duration % 15).toBe(0);
        expect(p.duration).toBe(p.services.reduce((a, s) => a + s.duration, 0));
        expect(segments.some(([a, b]) => p.start >= a && p.start + p.duration <= b)).toBe(true);
        expect(busy.some(([a, b]) => p.start < b && a < p.start + p.duration)).toBe(false);
        for (const s of p.services) expect(st.skills).toContain(s.key);
      }
      spans.sort((x, y) => x[0] - y[0]);
      for (let k = 1; k < spans.length; k += 1) expect(spans[k][0]).toBeGreaterThanOrEqual(spans[k - 1][1]);
    }
  });
});
