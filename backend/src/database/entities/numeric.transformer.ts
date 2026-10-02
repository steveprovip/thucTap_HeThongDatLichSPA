import { ValueTransformer } from 'typeorm';

/** PostgreSQL trả NUMERIC dưới dạng chuỗi — ép về number để tính toán an toàn. */
export const NumericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => (value === null || value === undefined ? null : Math.round(value)),
  from: (value: string | null): number => (value === null || value === undefined ? 0 : Number(value)),
};
