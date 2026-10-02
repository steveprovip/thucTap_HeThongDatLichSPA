/**
 * QA-02: ràng buộc ký tự cho email / mật khẩu — khớp backend common/utils/password.util.ts.
 * Chặn chữ có dấu tiếng Việt, khoảng trắng và ký tự dễ gây chèn mã (< > " ' ` \).
 */
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const PASSWORD_CHARSET_RE = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};:,.?/|~]+$/;

export const EMAIL_CHARSET_MESSAGE = 'Email chỉ gồm chữ cái không dấu, chữ số và . _ % + -';
export const PASSWORD_CHARSET_MESSAGE = 'Mật khẩu không được chứa chữ có dấu, khoảng trắng hoặc < > " \' ` \\';

/** Có ký tự ngoài ASCII (chữ có dấu, emoji…) hoặc khoảng trắng. */
const hasNonAsciiOrSpace = (s: string): boolean => /[^\x21-\x7E]/.test(s);

/** Lỗi của ô email, hoặc undefined nếu hợp lệ. `required` = bắt buộc nhập. */
export const emailError = (value: string, required = true): string | undefined => {
  const v = value.trim();
  if (!v) return required ? 'Vui lòng nhập email' : undefined;
  if (hasNonAsciiOrSpace(v)) return EMAIL_CHARSET_MESSAGE;
  return EMAIL_RE.test(v) ? undefined : 'Email không đúng định dạng';
};

/** Lỗi ký tự của ô mật khẩu (không xét độ mạnh), hoặc undefined nếu hợp lệ. */
export const passwordCharsetError = (value: string): string | undefined =>
  value && !PASSWORD_CHARSET_RE.test(value) ? PASSWORD_CHARSET_MESSAGE : undefined;
