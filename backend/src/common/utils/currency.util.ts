/**
 * Định dạng tiền VND theo quy ước tài liệu: 250000 -> "250.000 đ".
 * Dùng dấu chấm ngăn nghìn, không có phần thập phân.
 */
export const formatVnd = (value: number | string | null | undefined): string => {
  const n = Math.round(Number(value ?? 0));
  if (!Number.isFinite(n)) return '0 đ';
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits} đ`;
};

/** "250.000 đ" | "250000" -> 250000 */
export const parseVnd = (input: string): number => {
  const cleaned = String(input).replace(/[^\d-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/** Ép về số nguyên không âm (dùng cho tiền). */
export const toMoney = (v: number | string | null | undefined): number =>
  Math.max(0, Math.round(Number(v ?? 0)));
