/** Số điện thoại Việt Nam: đúng 10 chữ số, bắt đầu bằng 0 (S2-07). */
export const VN_PHONE_REGEX = /^0\d{9}$/;

export const isValidVnPhone = (phone: string): boolean => VN_PHONE_REGEX.test((phone ?? '').trim());

export const normalizePhone = (phone: string): string => {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) return '0' + digits.slice(3);
  if (digits.startsWith('84') && digits.length === 11) return '0' + digits.slice(2);
  return digits;
};

/**
 * Che số điện thoại khi hiển thị cho Thợ (yêu cầu bảo mật dữ liệu cá nhân):
 *   0981231234 -> 098***1234
 * Lễ tân, Chủ tiệm và Admin luôn thấy số đầy đủ.
 */
export const maskPhone = (phone: string | null | undefined): string => {
  const p = (phone ?? '').trim();
  if (p.length < 7) return p ? '***' : '';
  return `${p.slice(0, 3)}***${p.slice(-4)}`;
};
