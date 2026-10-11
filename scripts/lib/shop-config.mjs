/**
 * "Thiết lập cửa hàng" trong HoYoSalon Launcher: chủ tiệm điền biểu mẫu, Launcher ghi vào backend/.env thay vì bắt
 * người không rành kỹ thuật tự mở tệp cấu hình. Chỉ Node thuần, không cần gói npm.
 *
 *  - Đọc / ghi từng khoá, GIỮ NGUYÊN mọi dòng khác (ghi chú, khoá JWT, cấu hình CSDL…), bỏ dấu # ở dòng mẫu "#KEY=".
 *  - Không bao giờ trả mật khẩu về giao diện (chỉ báo "đã có"); để trống ô mật khẩu = giữ mật khẩu cũ.
 *  - Ngân hàng nhận chuyển khoản VietQR, thông tin tiệm, Gmail gửi thư xác nhận, tài khoản quản trị đầu tiên.
 */

/** Ngân hàng phổ biến và mã BIN theo NAPAS (dùng cho VietQR). */
export const BANKS = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'],
  ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'],
  ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970437', 'HDBank'], ['970441', 'VIB'],
  ['970443', 'SHB'], ['970448', 'OCB'], ['970426', 'MSB'], ['970440', 'SeABank'],
  ['970431', 'Eximbank'], ['970449', 'LPBank'], ['970428', 'Nam A Bank'], ['970454', 'BVBank'],
].map(([bin, name]) => ({ bin, name }));

/** Khoá được phép đọc/ghi qua Launcher. secret = không bao giờ gửi giá trị ra giao diện. */
const FIELDS = {
  SALON_NAME: { max: 120, required: true },
  SALON_ADDRESS: { max: 200, required: true },
  SALON_HOTLINE: { max: 30, required: true, re: /^[0-9 .+()-]{8,30}$/, msg: 'Số điện thoại chỉ gồm số, khoảng trắng, . + ( ) -' },
  SALON_EMAIL: { max: 120, re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, msg: 'Email không hợp lệ' },
  SALON_FACEBOOK_URL: { max: 200, re: /^https?:\/\/\S+$/, msg: 'Địa chỉ Facebook phải bắt đầu bằng https://' },
  SALON_ZALO: { max: 120 },
  BANK_BIN: { max: 6, re: /^\d{6}$/, msg: 'Chọn ngân hàng (mã BIN 6 số)' },
  BANK_ACCOUNT_NO: { max: 19, re: /^[0-9A-Za-z]{4,19}$/, msg: 'Số tài khoản chỉ gồm chữ và số, 4–19 ký tự' },
  BANK_ACCOUNT_NAME: { max: 50 },
  SMTP_USER: { max: 120, re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, msg: 'Gmail gửi thư không hợp lệ' },
  SMTP_PASSWORD: { max: 64, secret: true },
  BOOKING_REQUIRE_EMAIL: { max: 5, re: /^(true|false)$/, msg: 'Chọn Có hoặc Không' },
  BOOTSTRAP_ADMIN_EMAIL: { max: 120, re: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, msg: 'Email đăng nhập chỉ gồm chữ không dấu, số và . _ % + -' },
  BOOTSTRAP_ADMIN_PASSWORD: {
    max: 64, secret: true, re: /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7e]{8,64}$/,
    msg: 'Mật khẩu từ 8 ký tự, có cả chữ và số, không dấu, không khoảng trắng',
  },
};
export const SHOP_KEYS = Object.keys(FIELDS);

const LINE = /^\s*#?\s*([A-Z0-9_]+)\s*=(.*)$/;

function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  const hash = v.search(/\s#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

/** Giá trị các khoá ĐANG CÓ HIỆU LỰC (bỏ qua dòng bị ghi chú "#KEY="). */
export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = LINE.exec(line);
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

/** Bỏ dấu tiếng Việt, in hoa — tên chủ tài khoản hiển thị trên app ngân hàng. */
export const toBankName = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);

/** Ghi giá trị an toàn cho dotenv: có # hoặc khoảng trắng đầu/cuối thì đặt trong nháy kép. */
function encode(value) {
  const v = String(value);
  return /#|^\s|\s$/.test(v) ? `"${v}"` : v;
}

/**
 * Cập nhật các khoá trong nội dung .env. Dòng "KEY=" hoặc "#KEY=" đầu tiên được thay thế (bỏ ghi chú), các dòng
 * trùng khoá phía sau bị ghi chú lại để không còn hai giá trị; khoá chưa có được thêm vào cuối dưới một tiêu đề.
 */
export function upsertEnv(text, updates) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(text).split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  const done = new Set();
  const out = lines.map((line) => {
    const m = LINE.exec(line);
    if (!m || !pending.has(m[1])) return line;
    const key = m[1];
    if (done.has(key)) return /^\s*#/.test(line) ? line : `#${line}`;
    // dòng mẫu đang ghi chú chỉ thay khi không còn dòng nào đang có hiệu lực cho khoá này
    if (/^\s*#/.test(line) && lines.some((l) => !/^\s*#/.test(l) && LINE.exec(l)?.[1] === key)) return line;
    done.add(key);
    return `${key}=${encode(pending.get(key))}`;
  });
  const rest = [...pending.keys()].filter((k) => !done.has(k));
  if (rest.length) {
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push('# ----- Thiết lập cửa hàng (ghi bởi HoYoSalon Launcher) -----');
    for (const k of rest) out.push(`${k}=${encode(pending.get(k))}`);
    out.push('');
  }
  return out.join(eol);
}

/** Thông tin hiện tại cho biểu mẫu (mật khẩu chỉ báo có / không). */
export function readShopConfig(envText) {
  const env = parseEnv(envText);
  const values = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    if (!f.secret) values[key] = env[key] ?? '';
  }
  return {
    values,
    hasSmtpPassword: !!env.SMTP_PASSWORD,
    hasAdminPassword: !!env.BOOTSTRAP_ADMIN_PASSWORD,
    gmailConfigured: env.SMTP_HOST === 'smtp.gmail.com' && !!env.SMTP_USER && !!env.SMTP_PASSWORD,
  };
}

/**
 * Kiểm tra + chuẩn hoá dữ liệu biểu mẫu. Trả về { errors, updates } — updates là các khoá .env cần ghi.
 * Ô mật khẩu để trống = giữ nguyên; điền Gmail thì tự đặt máy chủ gửi thư smtp.gmail.com.
 */
export function buildShopUpdates(input, envText = '') {
  const env = parseEnv(envText);
  const errors = {};
  const updates = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    if (!(key in (input ?? {}))) continue;
    let v = String(input[key] ?? '').replace(/[\r\n"]/g, ' ').trim();
    if (key === 'BANK_ACCOUNT_NO') v = v.replace(/\s/g, '');
    if (key === 'BANK_ACCOUNT_NAME') v = toBankName(v);
    if (key === 'SMTP_PASSWORD') v = v.replace(/\s/g, ''); // mật khẩu ứng dụng Google hiển thị theo nhóm 4 ký tự
    if (f.secret && !v) continue; // giữ mật khẩu cũ
    if (!v) {
      if (f.required) errors[key] = 'Bắt buộc';
      else updates[key] = '';
      continue;
    }
    if (v.length > f.max) { errors[key] = `Tối đa ${f.max} ký tự`; continue; }
    if (f.re && !f.re.test(v)) { errors[key] = f.msg; continue; }
    updates[key] = v;
  }
  const bin = updates.BANK_BIN ?? env.BANK_BIN ?? '';
  const acc = updates.BANK_ACCOUNT_NO ?? env.BANK_ACCOUNT_NO ?? '';
  if (!!bin !== !!acc && !errors.BANK_BIN && !errors.BANK_ACCOUNT_NO) {
    errors[bin ? 'BANK_ACCOUNT_NO' : 'BANK_BIN'] = 'Cần cả ngân hàng và số tài khoản';
  }
  if (updates.BOOTSTRAP_ADMIN_PASSWORD && !(updates.BOOTSTRAP_ADMIN_EMAIL ?? env.BOOTSTRAP_ADMIN_EMAIL)) {
    errors.BOOTSTRAP_ADMIN_EMAIL = 'Nhập email đăng nhập cho mật khẩu này';
  }
  if (updates.SMTP_USER) {
    Object.assign(updates, {
      SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true', MAIL_FROM_ADDRESS: updates.SMTP_USER,
    });
    if (!updates.SMTP_PASSWORD && !env.SMTP_PASSWORD) errors.SMTP_PASSWORD = 'Nhập mật khẩu ứng dụng 16 ký tự của Gmail';
  } else if ('SMTP_USER' in updates && updates.SMTP_USER === '') {
    delete updates.SMTP_USER; // không xoá cấu hình thư đang chạy chỉ vì ô để trống
  }
  if (updates.SALON_NAME) updates.MAIL_FROM_NAME = updates.SALON_NAME;
  return { errors, updates };
}
