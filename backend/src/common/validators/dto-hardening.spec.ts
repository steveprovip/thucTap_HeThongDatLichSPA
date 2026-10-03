import 'reflect-metadata';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { isValidDateString } from '../utils/time.util';
import {
  AvailabilityQueryDto, BulkReassignDto, CapableStylistsQueryDto, CreateBookingDto, RescheduleDto,
} from '../../modules/booking-engine/dto/booking.dto';
import { CreateServiceDto, UpdateServiceDto } from '../../modules/services/dto/service.dto';
import { CopyWeekDto, CreateStylistDto, ShiftItemDto, UpdateShiftDto } from '../../modules/stylists/dto/stylist.dto';

const SERVICE_ID = '44444444-4444-4444-8444-000000000001';
const STYLIST_ID = '22222222-2222-4222-8222-000000000001';

/** Tập đường dẫn thuộc tính lỗi (kể cả lồng nhau, vd "items.0.targetTime"). */
const failing = async <T extends object>(cls: new () => T, plain: object): Promise<string[]> => {
  const flat: string[] = [];
  const collect = (list: ValidationError[], parent = ''): void => {
    for (const e of list) {
      const path = parent ? `${parent}.${e.property}` : e.property;
      if (e.constraints) flat.push(path);
      if (e.children?.length) collect(e.children, path);
    }
  };
  collect(await validate(plainToInstance(cls, plain)));
  return flat;
};

describe('Ngày dương lịch có thật (QA-14, QA-08)', () => {
  it.each(['2099-02-31', '2026-13-01', '2026-04-31', '2025-02-29'])('%s không tồn tại', (d) => {
    expect(isValidDateString(d)).toBe(false);
  });
  it.each(['2099-12-31', '2028-02-29'])('%s hợp lệ', (d) => expect(isValidDateString(d)).toBe(true));

  const booking = { serviceIds: [SERVICE_ID], date: '2099-02-31', time: '10:00', fullName: 'Khach', phone: '0987000111' };
  it('CreateBookingDto / RescheduleDto / ShiftItemDto / CopyWeekDto chặn ngày không tồn tại', async () => {
    expect(await failing(CreateBookingDto, booking)).toEqual(['date']);
    expect(await failing(RescheduleDto, { date: '2099-02-31' })).toEqual(['date']);
    expect(await failing(ShiftItemDto, { workDate: '2099-02-31', startTime: '09:00', endTime: '17:00' })).toEqual(['workDate']);
    expect(await failing(CopyWeekDto, { sourceWeekStart: '2099-02-31', targetWeekStart: '2099-03-01' })).toEqual(['sourceWeekStart']);
    expect(await failing(CreateBookingDto, { ...booking, date: '2099-02-28' })).toEqual([]);
  });
});

describe('Mảng mã (UUID) ở lớp DTO (QA-05, QA-13, QA-15)', () => {
  it('AvailabilityQueryDto: chuỗi "a,a" bị coi là trùng lặp, "a" hợp lệ', async () => {
    expect(await failing(AvailabilityQueryDto, { date: '2099-12-31', serviceIds: `${SERVICE_ID},${SERVICE_ID}` })).toEqual(['serviceIds']);
    expect(await failing(AvailabilityQueryDto, { date: '2099-12-31', serviceIds: SERVICE_ID })).toEqual([]);
  });

  it('CapableStylistsQueryDto: mã không phải UUID / trùng / quá 5 bị chặn; UUID hợp lệ qua', async () => {
    expect(await failing(CapableStylistsQueryDto, { serviceIds: 'khong-phai-uuid' })).toEqual(['serviceIds']);
    expect(await failing(CapableStylistsQueryDto, { serviceIds: `${SERVICE_ID},${SERVICE_ID}` })).toEqual(['serviceIds']);
    expect(await failing(CapableStylistsQueryDto, { serviceIds: SERVICE_ID })).toEqual([]);
  });

  it('CreateServiceDto / UpdateServiceDto: stylistIds phải là mảng UUID không trùng', async () => {
    const base = { categoryId: SERVICE_ID, name: 'Cat toc', durationMinutes: 30, price: 100000 };
    expect(await failing(CreateServiceDto, { ...base, stylistIds: ['abc'] })).toEqual(['stylistIds']);
    expect(await failing(CreateServiceDto, { ...base, stylistIds: [STYLIST_ID, STYLIST_ID] })).toEqual(['stylistIds']);
    expect(await failing(CreateServiceDto, { ...base, stylistIds: [STYLIST_ID] })).toEqual([]);
    expect(await failing(UpdateServiceDto, { stylistIds: 'abc' })).toEqual(['stylistIds']);
  });

  it('CreateStylistDto: serviceIds phải là mảng UUID', async () => {
    expect(await failing(CreateStylistDto, { fullName: 'Tho A', serviceIds: ['abc'] })).toEqual(['serviceIds']);
    expect(await failing(CreateStylistDto, { fullName: 'Tho A', serviceIds: [SERVICE_ID] })).toEqual([]);
  });
});

describe('Giờ nghỉ giữa ca khi sửa ca (QA-07, QA-08)', () => {
  it.each([{ breakStart: '25:99' }, { breakEnd: 'abc' }, { breakEnd: 1230 }])('%j bị chặn', async (body) => {
    expect((await failing(UpdateShiftDto, body)).length).toBe(1);
  });
  it('null (xoá giờ nghỉ), bỏ trống và HH:mm hợp lệ đều qua', async () => {
    expect(await failing(UpdateShiftDto, { breakStart: null, breakEnd: null })).toEqual([]);
    expect(await failing(UpdateShiftDto, {})).toEqual([]);
    expect(await failing(UpdateShiftDto, { breakStart: '12:00', breakEnd: '12:30' })).toEqual([]);
  });
});

describe('Chuyển lô: kiểm tra từng phần tử (QA-15)', () => {
  it('phần tử sai UUID hoặc sai giờ bị chặn, phần tử đúng qua', async () => {
    expect(await failing(BulkReassignDto, { items: [{ appointmentId: 'x' }] })).toEqual(['items.0.appointmentId']);
    expect(await failing(BulkReassignDto, { items: [{ appointmentId: SERVICE_ID, targetTime: '99:99' }] }))
      .toEqual(['items.0.targetTime']);
    expect(await failing(BulkReassignDto, { items: [{ appointmentId: SERVICE_ID, targetStylistId: STYLIST_ID, targetTime: '10:15' }] }))
      .toEqual([]);
  });
});
