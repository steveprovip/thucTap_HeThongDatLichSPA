import { lunarToSolarIso } from '../../common/utils/lunar-calendar';

/**
 * Trợ lý sinh ngày lễ quốc gia Việt Nam cho một năm (Mentor Sprint 2 · mục 5).
 *
 * Căn cứ: Điều 112 Bộ luật Lao động 2019, bổ sung Ngày Văn hoá Việt Nam 24/11 (hiệu lực từ 01/7/2026).
 * Ngày lễ âm lịch (Tết Nguyên Đán, Giỗ Tổ Hùng Vương) đổi sang dương lịch bằng thuật toán âm lịch thiên văn
 * múi giờ +7 (common/utils/lunar-calendar.ts) nên chạy hoàn toàn ngoại tuyến, không cần Internet / khoá API.
 *
 * Hàm THUẦN: chỉ đề xuất. Việc đối chiếu với lịch hẹn của khách và ngày nghỉ đã khai báo do WorkingHoursService làm.
 */
export interface HolidaySuggestion {
  /** Khoá ổn định theo năm, vd. "2027-tet-nguyen-dan" — dùng để chọn áp dụng từng ngày. */
  key: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  calendar: 'solar' | 'lunar';
  /** Diễn giải cách tính, hiển thị cho chủ tiệm kiểm tra lại. */
  rule: string;
  note: string | null;
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const addDaysIso = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (start: string, end: string): number =>
  Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1;

/** Năm hợp lệ để sinh ngày lễ (thuật toán chính xác trong khoảng 1800–2199). */
export const isSupportedHolidayYear = (year: number): boolean => Number.isInteger(year) && year >= 2000 && year <= 2100;

export function generateVietnamHolidays(year: number): HolidaySuggestion[] {
  if (!isSupportedHolidayYear(year)) throw new Error(`Chỉ hỗ trợ năm 2000–2100, nhận ${year}`);
  const tet = lunarToSolarIso(1, 1, year);
  const hungKings = lunarToSolarIso(10, 3, year);

  const items: Omit<HolidaySuggestion, 'days'>[] = [
    {
      key: `${year}-tet-duong-lich`, name: 'Tết Dương lịch', startDate: iso(year, 1, 1), endDate: iso(year, 1, 1),
      calendar: 'solar', rule: '01/01 dương lịch', note: null,
    },
    {
      key: `${year}-tet-nguyen-dan`, name: `Tết Nguyên Đán ${year}`,
      startDate: addDaysIso(tet, -1), endDate: addDaysIso(tet, 3),
      calendar: 'lunar', rule: `Ngày cuối năm âm lịch đến mùng 4 Tết (mùng 1 = ${tet.split('-').reverse().join('/')})`,
      note: 'Luật quy định 5 ngày; Thủ tướng chốt lịch cụ thể hằng năm — có thể nới thêm theo thông báo chính thức.',
    },
    {
      key: `${year}-gio-to-hung-vuong`, name: 'Giỗ Tổ Hùng Vương', startDate: hungKings, endDate: hungKings,
      calendar: 'lunar', rule: '10/3 âm lịch', note: null,
    },
    {
      key: `${year}-giai-phong-mien-nam`, name: 'Ngày Giải phóng miền Nam, thống nhất đất nước',
      startDate: iso(year, 4, 30), endDate: iso(year, 4, 30), calendar: 'solar', rule: '30/04 dương lịch', note: null,
    },
    {
      key: `${year}-quoc-te-lao-dong`, name: 'Ngày Quốc tế Lao động', startDate: iso(year, 5, 1), endDate: iso(year, 5, 1),
      calendar: 'solar', rule: '01/05 dương lịch', note: null,
    },
    {
      key: `${year}-quoc-khanh`, name: 'Quốc khánh', startDate: iso(year, 9, 1), endDate: iso(year, 9, 2),
      calendar: 'solar', rule: '02/09 và 01 ngày liền kề (mặc định 01/09)',
      note: 'Ngày liền kề (trước hoặc sau 02/09) do Thủ tướng quyết định hằng năm.',
    },
  ];
  if (year >= 2026) {
    items.push({
      key: `${year}-van-hoa-viet-nam`, name: 'Ngày Văn hoá Việt Nam', startDate: iso(year, 11, 24), endDate: iso(year, 11, 24),
      calendar: 'solar', rule: '24/11 dương lịch (nghỉ hưởng lương từ 01/7/2026)', note: null,
    });
  }
  return items
    .map((h) => ({ ...h, days: daysBetween(h.startDate, h.endDate) }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
