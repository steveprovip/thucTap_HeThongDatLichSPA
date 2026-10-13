import { backgroundAllowed, markActivity, resetActivity } from './activity';

/** CSDL đám mây miễn phí được ngủ khi tiệm vắng (Neon Free: 100 CU-giờ/tháng). */
describe('Tác vụ nền theo hoạt động (IDLE_DB_SLEEP)', () => {
  const on = { IDLE_DB_SLEEP: 'true' } as NodeJS.ProcessEnv;
  beforeEach(() => resetActivity());

  it('máy tại tiệm (không bật biến): luôn chạy mỗi phút như cũ', () => {
    expect(backgroundAllowed('email-queue', 1_000, {} as NodeJS.ProcessEnv)).toBe(true);
    expect(backgroundAllowed('email-queue', 2_000, {} as NodeJS.ProcessEnv)).toBe(true);
  });

  it('có người dùng trong 15 phút: chạy mỗi lượt; vắng: tối đa 1 lần / giờ / tác vụ', () => {
    const t0 = 10 * 3_600_000;
    markActivity(t0);
    expect(backgroundAllowed('email-queue', t0 + 60_000, on)).toBe(true);
    expect(backgroundAllowed('email-queue', t0 + 14 * 60_000, on)).toBe(true);
    // vắng khách: lượt đầu được chạy (gửi nhắc lịch, dọn giữ chỗ), các lượt sau trong 1 giờ thì bỏ
    expect(backgroundAllowed('email-queue', t0 + 20 * 60_000, on)).toBe(true);
    expect(backgroundAllowed('email-queue', t0 + 21 * 60_000, on)).toBe(false);
    expect(backgroundAllowed('email-queue', t0 + 79 * 60_000, on)).toBe(false);
    expect(backgroundAllowed('email-queue', t0 + 81 * 60_000, on)).toBe(true);
    // mỗi tác vụ có nhịp riêng
    expect(backgroundAllowed('slot-holds', t0 + 21 * 60_000, on)).toBe(true);
  });
});
