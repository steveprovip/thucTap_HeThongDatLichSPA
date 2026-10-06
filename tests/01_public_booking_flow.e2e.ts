import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('1. Trang chủ: Hiển thị thông tin thương hiệu và danh mục dịch vụ', async ({ app, screen }) => {
  await app.open('/');

  // Kiểm tra thương hiệu salon hoặc logo
  await expect(screen.getByText(/Hương Sen|Salon/i).first()).toBeVisible();
  
  // Kiểm tra các nút hành động chính
  await expect(screen.getByText(/Đặt lịch/i).first()).toBeVisible();
});

test('2. Luồng đặt lịch: Truy cập trang đặt lịch hẹn', async ({ app, screen, browser }) => {
  await app.open('/booking');

  // Xác thực đang ở trang đặt lịch
  await expect(browser).toHaveURL(/\/booking/);
});

test('3. Tra cứu lịch hẹn: Kiểm tra trang tra cứu', async ({ app, screen, browser }) => {
  await app.open('/tra-cuu');

  // Xác thực trang tra cứu
  await expect(browser).toHaveURL(/\/tra-cuu/);
});
