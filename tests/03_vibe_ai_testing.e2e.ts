import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('AI Agent tự động điều hướng và thao tác đặt lịch Salon Spa', async ({ app, agent, screen, browser }) => {
  await app.open('/');

  // Bước 1: AI Agent tự tìm nút đặt lịch trên trang chủ và bấm vào
  await agent.act('Click on the booking button or navigate to book an appointment');

  // Bước 2: AI Agent xác thực đang ở trang đặt lịch
  await agent.assert('The current page is the appointment booking wizard');

  // Bước 3: Kiểm tra URL
  await expect(browser).toHaveURL(/\/booking/);
});
