import { jdFromDate, jdToDate, lunarToSolar, lunarToSolarIso } from '../../common/utils/lunar-calendar';
import { addDaysIso, generateVietnamHolidays, isSupportedHolidayYear } from './vn-holidays';
import { WorkingHoursService } from './working-hours.service';
import { SalonHoliday } from '../../database/entities/salon-holiday.entity';

describe('Âm lịch Việt Nam (múi giờ +7)', () => {
  it.each([
    [1985, '1985-01-21'], // Việt Nam đón Tết sớm hơn Trung Quốc 1 tháng do khác múi giờ
    [2023, '2023-01-22'],
    [2024, '2024-02-10'],
    [2025, '2025-01-29'],
    [2026, '2026-02-17'],
    [2027, '2027-02-06'],
    [2028, '2028-01-26'],
  ])('mùng 1 Tết năm %i là %s', (year, expected) => {
    expect(lunarToSolarIso(1, 1, year)).toBe(expected);
  });

  it.each([
    [2023, '2023-04-29'],
    [2024, '2024-04-18'],
    [2025, '2025-04-07'],
    [2026, '2026-04-26'],
  ])('Giỗ Tổ 10/3 âm năm %i là %s', (year, expected) => {
    expect(lunarToSolarIso(10, 3, year)).toBe(expected);
  });

  it('đổi qua lại số ngày Julius không lệch ngày', () => {
    for (const [d, m, y] of [[1, 1, 2000], [29, 2, 2024], [31, 12, 2099]] as const) {
      expect(jdToDate(jdFromDate(d, m, y))).toEqual([d, m, y]);
    }
  });

  it('tháng nhuận không tồn tại trong năm -> null; năm có nhuận tháng 6 (2025) -> có', () => {
    expect(lunarToSolar(1, 2, 2026, true)).toBeNull();
    expect(lunarToSolar(1, 6, 2025, true)).toEqual({ day: 25, month: 7, year: 2025 });
  });
});

describe('Sinh ngày lễ quốc gia', () => {
  it('2027: đủ 7 ngày lễ, sắp theo ngày, Tết 5 ngày từ ngày cuối năm âm', () => {
    const list = generateVietnamHolidays(2027);
    expect(list.map((h) => h.key)).toEqual([
      '2027-tet-duong-lich', '2027-tet-nguyen-dan', '2027-gio-to-hung-vuong', '2027-giai-phong-mien-nam',
      '2027-quoc-te-lao-dong', '2027-quoc-khanh', '2027-van-hoa-viet-nam',
    ]);
    const tet = list.find((h) => h.key === '2027-tet-nguyen-dan')!;
    expect(tet).toMatchObject({ startDate: '2027-02-05', endDate: '2027-02-09', days: 5, calendar: 'lunar' });
    expect(list.find((h) => h.key === '2027-quoc-khanh')).toMatchObject({ startDate: '2027-09-01', endDate: '2027-09-02', days: 2 });
  });

  it('Ngày Văn hoá Việt Nam 24/11 chỉ có từ năm 2026', () => {
    expect(generateVietnamHolidays(2025).some((h) => h.key.endsWith('van-hoa-viet-nam'))).toBe(false);
    expect(generateVietnamHolidays(2026).some((h) => h.key.endsWith('van-hoa-viet-nam'))).toBe(true);
  });

  it('chặn năm ngoài phạm vi hỗ trợ', () => {
    expect(isSupportedHolidayYear(1999)).toBe(false);
    expect(isSupportedHolidayYear(2030.5)).toBe(false);
    expect(() => generateVietnamHolidays(2101)).toThrow();
  });

  it('addDaysIso qua ranh giới năm', () => {
    expect(addDaysIso('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDaysIso('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('Đối chiếu đề xuất với dữ liệu tiệm (không chèn lên lịch khách)', () => {
  const makeService = (opts: { holidays: Partial<SalonHoliday>[]; busyDates: string[] }) => {
    const service = new WorkingHoursService(
      {} as never,
      { save: jest.fn(async (h: Partial<SalonHoliday>) => ({ ...h, id: `id-${h.startDate}` })), create: (h: unknown) => h } as never,
      {} as never,
    );
    jest.spyOn(service, 'listHolidays').mockImplementation(async (from?: string, to?: string) =>
      opts.holidays.filter((h) => (!from || h.endDate! >= from) && (!to || h.startDate! <= to)) as SalonHoliday[]);
    jest.spyOn(service, 'previewHolidayImpact').mockImplementation(async (start: string, end: string) => {
      const hits = opts.busyDates.filter((d) => d >= start && d <= end);
      return { affected: hits.length, codes: hits.map((d) => `BK${d.replace(/-/g, '').slice(2)}`) };
    });
    return service;
  };

  it('phân loại ready / exists / conflict / past', async () => {
    const service = makeService({
      holidays: [{ startDate: '2027-04-30', endDate: '2027-04-30', reason: 'Nghỉ 30/4' }],
      busyDates: ['2027-09-01'],
    });
    const list = await service.suggestHolidays(2027, '2027-02-01');
    const byKey = Object.fromEntries(list.map((h) => [h.key.slice(5), h]));
    expect(byKey['tet-duong-lich'].status).toBe('past');
    expect(byKey['tet-nguyen-dan'].status).toBe('ready');
    expect(byKey['giai-phong-mien-nam']).toMatchObject({ status: 'exists', existingReason: 'Nghỉ 30/4' });
    expect(byKey['quoc-khanh']).toMatchObject({ status: 'conflict', affectedAppointments: 1 });
  });

  it('áp dụng 1-click: bỏ qua ngày có lịch khách nếu không force; force thì tạo', async () => {
    const service = makeService({ holidays: [], busyDates: ['2027-09-02'] });
    jest.spyOn(service, 'suggestHolidays').mockImplementation(async (year: number) => {
      const real = generateVietnamHolidays(year);
      return real.map((h) => ({
        ...h, status: h.key.endsWith('quoc-khanh') ? 'conflict' : 'ready',
        existingReason: null, affectedAppointments: h.key.endsWith('quoc-khanh') ? 1 : 0, affectedCodes: [],
      }));
    });
    const normal = await service.generateHolidays({ year: 2027 });
    expect(normal.created).toHaveLength(6);
    expect(normal.skipped).toEqual([expect.objectContaining({ key: '2027-quoc-khanh' })]);

    const forced = await service.generateHolidays({ year: 2027, keys: ['2027-quoc-khanh'], force: true });
    expect(forced.created.map((c) => c.key)).toEqual(['2027-quoc-khanh']);
  });
});
