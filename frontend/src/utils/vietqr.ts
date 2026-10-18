/**
 * VietQR (NAPAS 247) — chuỗi EMVCo Merchant-Presented QR để app ngân hàng VN quét được.
 * Chuẩn: EMVCo MPM + NAPAS "VietQR" (GUID A000000727, dịch vụ QRIBFTTA = chuyển nhanh tới tài khoản).
 *
 * Bẫy thường gặp khiến app ngân hàng báo "mã QR không hợp lệ":
 *  - Độ dài TLV tính theo ký tự UTF-16 trong khi nội dung có dấu tiếng Việt → lệch độ dài.
 *  - Thiếu/ sai CRC (tag 63) hoặc CRC không tính cả "6304".
 *  - Số tiền có dấu chấm/phẩy ("150.000") hoặc số lẻ.
 * → Chuẩn hoá mọi trường về ASCII in hoa, số tiền là số nguyên, CRC16-CCITT-FALSE.
 */

export interface VietQrInput {
  /** Mã BIN ngân hàng 6 số theo NAPAS, VD 970436 (Vietcombank). */
  bankBin: string;
  accountNo: string;
  /** Số tiền VND (làm tròn về số nguyên). 0/undefined = QR tĩnh, khách tự nhập số tiền. */
  amount?: number;
  /** Nội dung chuyển khoản. Tự bỏ dấu, tối đa 25 ký tự (giới hạn phổ biến của app ngân hàng). */
  addInfo?: string;
}

const MAX_ADD_INFO = 25;

/** Bỏ dấu tiếng Việt, chỉ giữ A-Z 0-9 và khoảng trắng — an toàn cho mọi app ngân hàng. */
export function toBankText(s: string, max = MAX_ADD_INFO): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

const tlv = (id: string, value: string): string => {
  if (value.length > 99) throw new Error(`VietQR: trường ${id} dài quá 99 ký tự`);
  return id + String(value.length).padStart(2, '0') + value;
};

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — đúng thuật toán EMVCo yêu cầu cho tag 63. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Trả về chuỗi payload hoặc null nếu cấu hình không hợp lệ (không bao giờ sinh QR rác). */
export function buildVietQrPayload({ bankBin, accountNo, amount, addInfo }: VietQrInput): string | null {
  const bin = (bankBin ?? '').trim();
  const acc = (accountNo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(bin) || !/^[0-9A-Za-z]{1,19}$/.test(acc)) return null;

  const amt = Number.isFinite(amount) && (amount as number) > 0 ? String(Math.round(amount as number)) : '';
  const info = addInfo ? toBankText(addInfo) : '';

  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acc)) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') +
    tlv('01', amt ? '12' : '11') + // 12 = QR động (dùng 1 lần, có số tiền), 11 = QR tĩnh
    tlv('38', merchant) +
    tlv('53', '704') + // VND
    (amt ? tlv('54', amt) : '') +
    tlv('58', 'VN') +
    (info ? tlv('62', tlv('08', info)) : '') +
    '6304';
  return body + crc16(body);
}

/** Tài khoản nhận tiền đọc từ biến môi trường; thiếu cấu hình → null. */
export const BANK = {
  bin: import.meta.env.VITE_BANK_BIN?.trim() ?? '',
  accountNo: import.meta.env.VITE_BANK_ACCOUNT_NO?.trim() ?? '',
  accountName: import.meta.env.VITE_BANK_ACCOUNT_NAME?.trim() ?? '',
};

/**
 * QA Sprint 4 · mục 2 — nội dung CK chuẩn hoá cú pháp `SPA <SĐT> <MÃ LỊCH>` (VD "SPA 0915103844 8SGE9AJ2" = 23 ký tự,
 * vừa giới hạn 25 của tag 62-08) để kế toán đối soát 1-1 theo khách + lịch. Thiếu SĐT/mã lịch → dùng mã phiếu.
 */
export function invoiceTransferContent(inv: { code: string; customerPhone?: string | null; appointmentCode?: string | null }): string {
  const phone = (inv.customerPhone ?? '').replace(/\D/g, '');
  const appt = (inv.appointmentCode ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const content = phone && appt ? `SPA ${phone} ${appt}` : `SPA ${inv.code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()}`;
  return toBankText(content);
}
