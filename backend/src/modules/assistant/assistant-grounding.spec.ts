import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { addDays, todaySalon } from '../../common/utils/time.util';
import type { AvailabilityService } from '../booking-engine/availability.service';
import type { StylistsService } from '../stylists/stylists.service';
import type { WorkingHoursService } from '../working-hours/working-hours.service';
import { AssistantService } from './assistant.service';
import { bookTimeFor, nearestSlotNote, pickNearestSlot } from './customer-assistant-rules';

/**
 * RFC-2026-SPA-V3 · Pillar III.2 — giờ trống trong câu trả lời của trợ lý LUÔN là giờ đã tra thật bằng AvailabilityService.
 * Ngày khách hỏi đã kín → trợ lý tra ngày gần nhất còn chỗ và nêu đúng NGÀY + GIỜ (kèm bookDate / bookTime cho nút "Đặt").
 */
const HOT = { id: 'hot', name: 'Massage body đá nóng', durationMinutes: 90, price: 590000, priceText: '590.000 ₫', description: 'Đá bazan nóng', imageUrl: null };
const NECK = { id: 'neck', name: 'Massage bấm huyệt cổ vai gáy', durationMinutes: 60, price: 350000, priceText: '350.000 ₫', description: null, imageUrl: null };
const empty = (date: string, suggestedDates: string[] = []) => ({
  date, totalDurationMinutes: 90, estimatedTotal: 0, estimatedTotalText: '', salonClosed: false, closedReason: null,
  slots: [] as { time: string; stylistIds: string[] }[], suggestedDates, exceedsLongestShift: false,
  earliestStartMinutes: null,
});

type Slot = { time: string; stylistIds: string[] };

/** `byService`: lịch riêng từng dịch vụ (tra cả nhóm) — dịch vụ không có trong đó dùng chung `days` / `suggested`. */
function setup(days: Record<string, Slot[]>, suggested: string[], byService: Record<string, { days: Record<string, Slot[]>; suggested: string[] }> = {}) {
  const getAvailability = jest.fn(async ({ date, serviceIds }: { date: string; serviceIds: string[] }) => {
    const own = byService[serviceIds[0]];
    const slots = (own ? own.days : days)[date] ?? [];
    return { ...empty(date, slots.length ? [] : own ? own.suggested : suggested), slots };
  });
  const availability = {
    getAvailability,
    publicCatalog: jest.fn(async () => [{ categoryId: 'c', categoryName: 'Massage & Body', services: [HOT, NECK] }]),
    capableStylists: jest.fn(async () => [{ id: 'st1', fullName: 'Lê Bích Ngọc' }, { id: 'st2', fullName: 'Võ Kim Chi' }]),
  } as unknown as AvailabilityService;
  const config = { get: (k: string) => ({ 'ai.provider': 'off', 'app.salonHotline': '028 3838 6868', 'app.salonName': 'Hương Sen' } as Record<string, unknown>)[k] } as unknown as ConfigService;
  const dataSource = {
    query: jest.fn(async (sql: string) => (/count\(\*\) FILTER/.test(sql) ? [{ total: 2, female: 2, male: 0 }] : [])),
  } as unknown as DataSource;
  const workingHours = { list: jest.fn(async () => []) } as unknown as WorkingHoursService;
  const service = new AssistantService(config, dataSource, {} as StylistsService, workingHours, availability);
  return { service, getAvailability };
}

describe('Trợ lý khách — giờ trống gần nhất đã tra thật (Pillar III.2)', () => {
  const today = todaySalon();
  const tomorrow = addDays(today, 1);
  const d3 = addDays(today, 3);
  const d4 = addDays(today, 4);

  it('pickNearestSlot / bookTimeFor: gần giờ hỏi nhất, ưu tiên buổi hỏi, bỏ khung không còn thợ', () => {
    const data = { ...empty(today), slots: [
      { time: '09:00', stylistIds: ['a'] }, { time: '10:30', stylistIds: [] }, { time: '11:00', stylistIds: ['a'] }, { time: '15:00', stylistIds: ['b'] },
    ] };
    expect(pickNearestSlot(data, { part: null, time: '10:30' })?.time).toBe('11:00');
    expect(pickNearestSlot(data, { part: null, time: '10:00' })?.time).toBe('09:00'); // cách đều → giờ sớm hơn
    expect(pickNearestSlot(data, { part: 'chieu', time: null })?.time).toBe('15:00');
    expect(pickNearestSlot(data, { part: 'toi', time: null })?.time).toBe('09:00'); // buổi tối kín → khung sớm nhất
    expect(pickNearestSlot({ ...data, salonClosed: true }, { part: null, time: null })).toBeNull();
    expect(bookTimeFor(data, { part: null, time: '11:00' })).toBe('11:00');
    expect(bookTimeFor(data, { part: 'sang', time: null })).toBeNull();
    expect(nearestSlotNote({ date: tomorrow, time: '09:00', stylistIds: ['a', 'b'] }, today, 'Gội')).toContain('09:00 ngày mai');
  });

  it('ngày hỏi kín cả ngày → nêu đúng giờ sớm nhất của ngày còn chỗ gần nhất + bookDate/bookTime', async () => {
    const { service, getAvailability } = setup({ [d3]: [{ time: '13:15', stylistIds: ['st2'] }, { time: '16:00', stylistIds: ['st1', 'st2'] }] }, [d3, d4]);
    const r = await service.customerChat('massage body đá nóng ngày mai còn giờ trống không', [], undefined, false);
    expect(r.intent).toBe('availability');
    expect(getAvailability).toHaveBeenCalledWith(expect.objectContaining({ date: tomorrow }));
    expect(getAvailability).toHaveBeenCalledWith(expect.objectContaining({ date: d3 }));
    expect(r.answer).toContain('Giờ trống gần nhất đã kiểm tra trên lịch thật: 13:15');
    expect(r.bookDate).toBe(d3);
    expect(r.bookTime).toBe('13:15');
  });

  it('khách hỏi giờ cụ thể còn trống → bookTime đúng giờ đó; không tra thêm ngày khác', async () => {
    const { service, getAvailability } = setup({ [tomorrow]: [{ time: '09:00', stylistIds: ['st1'] }, { time: '10:00', stylistIds: ['st2'] }] }, []);
    const r = await service.customerChat('mai 10h massage body đá nóng được không', [], undefined, false);
    expect(r.intent).toBe('availability');
    expect(r.answer).toContain('Còn trống');
    expect(r.bookDate).toBe(tomorrow);
    expect(r.bookTime).toBe('10:00');
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });

  it('cả nhóm kín đúng giờ hỏi nhưng ngày đó dịch vụ khác còn giờ → đề xuất giờ gần nhất NGAY NGÀY ĐÓ, không nhảy sang ngày khác', async () => {
    const { service, getAvailability } = setup({}, [], {
      hot: { days: { [tomorrow]: [{ time: '15:30', stylistIds: ['st1'] }] }, suggested: [] },
      neck: { days: { [d3]: [{ time: '15:00', stylistIds: ['st2'] }] }, suggested: [d3] },
    });
    const r = await service.customerChat('ngày mai 15h dịch vụ massage nào còn trống', [], undefined, false);
    expect(r.intent).toBe('availability');
    expect(r.answer).toContain('Giờ trống gần nhất đã kiểm tra trên lịch thật: 15:30 ngày mai');
    expect(r.answer).toContain('cho Massage body đá nóng');
    expect(r.answer).not.toContain('Bạn thử ngày khác'); // giờ khác cùng ngày vẫn còn
    expect(r.suggestions.map((s) => s.id)).toEqual(['hot']);
    expect(r.bookDate).toBe(tomorrow);
    expect(r.bookTime).toBe('15:30');
    expect(getAvailability).not.toHaveBeenCalledWith(expect.objectContaining({ date: d3 }));
  });

  it('nhiều dịch vụ trong nhóm còn giờ cùng ngày → chọn khung gần giờ khách hỏi nhất; hỏi theo buổi → khung sớm nhất trong ngày', async () => {
    const { service } = setup({}, [], {
      hot: { days: { [tomorrow]: [{ time: '16:30', stylistIds: ['st1'] }] }, suggested: [] },
      neck: { days: { [tomorrow]: [{ time: '09:00', stylistIds: ['st2'] }, { time: '14:00', stylistIds: ['st2'] }] }, suggested: [] },
    });
    const r = await service.customerChat('ngày mai 15h dịch vụ massage nào còn trống', [], undefined, false);
    expect(r.suggestions.map((s) => s.id)).toEqual(['neck']);
    expect(r.bookDate).toBe(tomorrow);
    expect(r.bookTime).toBe('14:00');

    const evening = setup({}, [], {
      hot: { days: { [tomorrow]: [{ time: '10:00', stylistIds: ['st1'] }] }, suggested: [] },
      neck: { days: { [d3]: [{ time: '13:00', stylistIds: ['st2'] }] }, suggested: [d3] },
    });
    const m = await evening.service.customerChat('tối mai dịch vụ massage nào còn trống', [], undefined, false);
    expect(m.answer).toContain('10:00 ngày mai');
    expect(m.suggestions.map((s) => s.id)).toEqual(['hot']);
    expect(m.bookDate).toBe(tomorrow);
    expect(m.bookTime).toBe('10:00');
  });

  it('cả nhóm kín cả ngày → dịch vụ có ngày còn chỗ sớm nhất, đúng giờ đã tra', async () => {
    const { service } = setup({}, [], {
      hot: { days: { [d4]: [{ time: '09:00', stylistIds: ['st1'] }] }, suggested: [d4] },
      neck: { days: { [d3]: [{ time: '13:15', stylistIds: ['st2'] }] }, suggested: [d3] },
    });
    const r = await service.customerChat('ngày mai 15h dịch vụ massage nào còn trống', [], undefined, false);
    expect(r.answer).toContain('Giờ trống gần nhất đã kiểm tra trên lịch thật: 13:15');
    expect(r.suggestions.map((s) => s.id)).toEqual(['neck']);
    expect(r.bookDate).toBe(d3);
    expect(r.bookTime).toBe('13:15');
  });

  it('không có ngày nào còn chỗ (30 ngày) → không bịa giờ, không có bookTime', async () => {
    const { service } = setup({}, []);
    const r = await service.customerChat('massage body đá nóng ngày mai còn giờ trống không', [], undefined, false);
    expect(r.intent).toBe('availability');
    expect(r.answer).not.toMatch(/\d{2}:\d{2}/);
    expect(r.bookTime).toBeUndefined();
  });
});
