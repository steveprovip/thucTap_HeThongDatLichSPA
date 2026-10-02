import { ValidateBy, ValidationOptions } from 'class-validator';
import {
  EMAIL_CHARSET_MESSAGE, isSafeEmail, isSafePasswordCharset, PASSWORD_CHARSET_MESSAGE,
} from '../utils/password.util';

/**
 * QA-02: tên ràng buộc RIÊNG (không dùng lại @Matches) để không ghi đè thông điệp của @Matches
 * khác trên cùng thuộc tính — class-validator gom lỗi theo tên ràng buộc.
 */
export const IsAsciiEmail = (options?: ValidationOptions): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isAsciiEmail',
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isSafeEmail(value),
        defaultMessage: (): string => EMAIL_CHARSET_MESSAGE,
      },
    },
    options,
  );

export const IsSafePasswordCharset = (options?: ValidationOptions): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isSafePasswordCharset',
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isSafePasswordCharset(value),
        defaultMessage: (): string => PASSWORD_CHARSET_MESSAGE,
      },
    },
    options,
  );
