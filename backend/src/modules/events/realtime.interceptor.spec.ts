import { LIVE_PATH, liveEventFor } from './realtime.interceptor';

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

describe('liveEventFor — chia kênh theo phạm vi dữ liệu + chuông báo lịch đặt online', () => {
  it('khách đặt lịch trên website → booking.created (kênh lịch hẹn)', () => {
    expect(liveEventFor('POST', '/public/bookings')).toEqual({ scope: 'appointments', kind: 'booking.created' });
  });
  it('gửi lại email, huỷ lịch công khai → chỉ làm mới kênh lịch hẹn, không chuông', () => {
    expect(liveEventFor('POST', '/public/bookings/email')).toEqual({ scope: 'appointments' });
    expect(liveEventFor('POST', '/public/cancel')).toEqual({ scope: 'appointments' });
  });
  it('kênh = đoạn đầu đường dẫn; lễ tân tạo lịch không bật chuông', () => {
    expect(liveEventFor('POST', '/appointments/walk-in')).toEqual({ scope: 'appointments' });
    expect(liveEventFor('PATCH', '/shifts/9')).toEqual({ scope: 'shifts' });
    expect(liveEventFor('post', '/invoices/9a/pay')).toEqual({ scope: 'invoices' });
  });
  it('đọc dữ liệu / đường dẫn ngoài danh sách → không phát', () => {
    expect(liveEventFor('GET', '/appointments')).toBeNull();
    expect(liveEventFor('POST', '/public/lookup')).toBeNull();
  });
});
