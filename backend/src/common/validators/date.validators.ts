import { ValidateBy, ValidationOptions } from 'class-validator';
import { isValidDateString } from '../utils/time.util';

/**
 * Ngày dương lịch CÓ THẬT theo dạng yyyy-MM-dd. Regex định dạng cho lọt "2026-02-31" -> luxon trả Invalid Date
 * -> NaN đi tiếp xuống CSDL và nổ 500. Tên ràng buộc riêng để không ghi đè thông điệp của @Matches cùng thuộc tính.
 */
export const IsCalendarDate = (options?: ValidationOptions): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isValidDateString(value),
        defaultMessage: (): string => 'Ngày không tồn tại trên lịch',
      },
    },
    options,
  );
