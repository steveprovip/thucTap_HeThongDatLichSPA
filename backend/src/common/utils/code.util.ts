import { randomBytes, randomInt } from 'crypto';

/** Bỏ các ký tự dễ nhìn nhầm (0/O, 1/I/L) để khách đọc mã qua điện thoại không sai. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Mã tra cứu 8 ký tự cho khách (S2-07). */
export const generateBookingCode = (length = 8): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
};

/** Token ngẫu nhiên dùng cho liên kết đặt lại mật khẩu / đánh giá. */
export const generateToken = (bytes = 32): string => randomBytes(bytes).toString('hex');

/** Mật khẩu tạm cho tài khoản mới: luôn có chữ hoa, chữ thường, số và ký tự đặc biệt. */
export const generateTempPassword = (): string => {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const special = '@#$%';
  const pick = (s: string) => s[randomInt(s.length)];
  const base = [pick(upper), pick(lower), pick(digit), pick(special)];
  for (let i = 0; i < 6; i += 1) base.push(pick(upper + lower + digit));
  // xáo trộn
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
};

/** Mã phiếu tính tiền: HD + yyMMdd + 4 ký tự ngẫu nhiên. */
export const generateInvoiceCode = (d: Date = new Date()): string => {
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `HD${y}${m}${day}${suffix}`;
};
