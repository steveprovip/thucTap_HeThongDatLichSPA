/** Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số (S1-04). */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export const isStrongPassword = (pw: string): boolean => PASSWORD_REGEX.test(pw ?? '');
