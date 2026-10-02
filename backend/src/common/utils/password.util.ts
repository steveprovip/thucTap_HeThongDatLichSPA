/** Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số (S1-04). */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export const isStrongPassword = (pw: string): boolean => PASSWORD_REGEX.test(pw ?? '');

/**
 * QA-02: email chỉ gồm ASCII an toàn. @IsEmail của class-validator mặc định CHO PHÉP chữ có dấu
 * (allow_utf8_local_part) và tên miền unicode, nên "nguyễn@salon.vn" hay "a<b>@x.vn" vẫn lọt.
 */
export const ASCII_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const EMAIL_CHARSET_MESSAGE = 'Email chỉ được gồm chữ cái không dấu, chữ số và các ký tự . _ % + -';

/**
 * QA-02: mật khẩu chỉ nhận chữ không dấu, chữ số và ký tự đặc biệt an toàn.
 * Chặn chữ có dấu, khoảng trắng/ký tự điều khiển và < > " ' ` \ (ký tự dễ gây lỗi chèn mã khi hiển thị lại).
 */
export const PASSWORD_CHARSET_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};:,.?/|~]+$/;
export const PASSWORD_CHARSET_MESSAGE =
  'Mật khẩu không được chứa chữ có dấu, khoảng trắng hoặc các ký tự < > " \' ` \\';

export const isSafeEmail = (email: string): boolean => ASCII_EMAIL_REGEX.test((email ?? '').trim());
export const isSafePasswordCharset = (pw: string): boolean => PASSWORD_CHARSET_REGEX.test(pw ?? '');
