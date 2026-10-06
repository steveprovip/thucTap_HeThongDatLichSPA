import { LIVE_PATH } from './realtime.interceptor';

describe('LIVE_PATH — thao tác ghi nào làm các thiết bị khác tải lại', () => {
  it.each([
    '/appointments/walk-in',
    '/appointments/3f2c/confirm',
    '/appointments/bulk-reassign',
    '/public/bookings',
    '/public/cancel',
    '/customers/3f2c',
    '/invoices',
    '/invoices/9a/pay',
    '/stylists/1/time-off',
    '/stylists/1/shifts',
    '/shifts/copy-week',
    '/shift-requests/3f2c/approve',
    '/holidays',
    '/working-hours',
    '/services/5',
    '/service-categories',
    '/vouchers/7',
    '/users/2/unlock',
    '/reviews/token/abc',
  ])('%s -> có phát sự kiện', (p) => expect(LIVE_PATH.test(p)).toBe(true));

  it.each([
    '/auth/login',
    '/auth/refresh',
    '/auth/change-password',
    '/public/quote',
    '/public/lookup',
    '/analytics/revenue',
    '/audit-logs',
    '/notifications/read-all',
    '/events/stream',
    '/health',
    '/appointmentsX',
  ])('%s -> không phát sự kiện', (p) => expect(LIVE_PATH.test(p)).toBe(false));
});
