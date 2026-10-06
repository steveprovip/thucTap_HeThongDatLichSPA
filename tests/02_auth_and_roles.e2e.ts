import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('1. Giao diện đăng nhập: Kiểm tra các thành phần xác thực', async ({ app, screen, browser }) => {
  await app.open('/dang-nhap');

  await expect(browser).toHaveURL(/\/dang-nhap/);
  await expect(screen.getByText(/Vận hành tiệm gọn gàng/i).first()).toBeVisible();
});
