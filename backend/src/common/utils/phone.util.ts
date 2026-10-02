/** Số di động Việt Nam: đúng 10 chữ số, đầu số 03/05/07/08/09 (S2-07, QA-16). */
export const VN_PHONE_REGEX = /^0[35789]\d{8}$/;

export const VN_PHONE_MESSAGE = 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09';

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
