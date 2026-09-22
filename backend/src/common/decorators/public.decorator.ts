import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Đánh dấu endpoint không cần đăng nhập (trang công khai của khách). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
