import { BadRequestException } from '@nestjs/common';
import { ERROR_CODES, MSG } from '../../common/constants/messages.constant';
import type { WorkingHoursService } from '../working-hours/working-hours.service';
import { AvailabilityService } from './availability.service';

/** Ngày tiệm nghỉ cả ngày (nghỉ lễ / nghỉ hằng tuần): lý do + thông báo chặn tạo / dời lịch (QA 05/10, Lỗi 2). */
const build = (holiday: { reason: string } | null, hours: { isClosed: boolean } | null): AvailabilityService => {
  const workingHours = {
    isHoliday: jest.fn().mockResolvedValue(holiday),
    getByDayOfWeek: jest.fn().mockResolvedValue(hours),
  } as unknown as WorkingHoursService;
  return new AvailabilityService(
    {} as never, workingHours, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
  );
};

const catchError = async (promise: Promise<void>): Promise<BadRequestException> => {
  try {
    await promise;
  } catch (e) {
    return e as BadRequestException;
  }
  throw new Error('Mong đợi bị chặn nhưng lại cho qua');
};

describe('AvailabilityService — tiệm nghỉ cả ngày', () => {
  it('ngày nghỉ lễ: trả đúng lý do của ngày nghỉ, ưu tiên hơn lịch nghỉ hằng tuần', async () => {
    const svc = build({ reason: 'Nghỉ Lễ' }, { isClosed: true });
    await expect(svc.closedReason('2026-10-18')).resolves.toBe('Nghỉ Lễ');
  });

  it('nghỉ cố định hằng tuần hoặc chưa cấu hình giờ làm: lý do mặc định', async () => {
    await expect(build(null, { isClosed: true }).closedReason('2026-10-18')).resolves.toBe(MSG.SALON_CLOSED_WEEKLY);
    await expect(build(null, null).closedReason('2026-10-18')).resolves.toBe(MSG.SALON_CLOSED_WEEKLY);
  });

  it('ngày mở cửa: không có lý do nghỉ, không chặn', async () => {
    const svc = build(null, { isClosed: false });
    await expect(svc.closedReason('2026-10-19')).resolves.toBeNull();
    await expect(svc.assertSalonOpen('2026-10-19', 'create')).resolves.toBeUndefined();
    await expect(svc.assertSalonOpen('2026-10-19', 'reschedule')).resolves.toBeUndefined();
  });

  it('tạo lịch vào ngày nghỉ lễ: 400 SALON_CLOSED, nêu lý do nghỉ', async () => {
    const err = await catchError(build({ reason: 'Nghỉ Lễ' }, { isClosed: false }).assertSalonOpen('2026-10-18', 'create'));
    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({
      message: 'Tiệm nghỉ trong ngày này (Nghỉ Lễ). Không thể tạo lịch hẹn.',
      field: 'date',
      code: ERROR_CODES.SALON_CLOSED,
      details: { date: '2026-10-18', reason: 'Nghỉ Lễ' },
    });
  });

  it('dời lịch vào ngày nghỉ lễ: thông báo riêng cho thao tác dời lịch', async () => {
    const err = await catchError(build({ reason: 'Nghỉ Lễ' }, { isClosed: false }).assertSalonOpen('2026-10-18', 'reschedule'));
    expect(err.getResponse()).toMatchObject({
      message: 'Tiệm nghỉ trong ngày này (Nghỉ Lễ). Không thể dời lịch hẹn vào ngày này.',
      code: ERROR_CODES.SALON_CLOSED,
    });
  });
});
