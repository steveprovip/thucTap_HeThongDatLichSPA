import { ArgumentsHost, ConflictException, HttpStatus, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { MSG } from '../constants/messages.constant';

interface Captured { status?: number; body?: Record<string, unknown>; headers: Record<string, string> }

const hostFor = (captured: Captured): ArgumentsHost => {
  const response = {
    status(code: number) { captured.status = code; return this; },
    json(body: Record<string, unknown>) { captured.body = body; return this; },
    setHeader(k: string, v: string) { captured.headers[k] = v; },
  };
  const request = { method: 'POST', url: '/api/x' };
  return {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('QA-01: giữ mã lỗi ACCOUNT_LOCKED + thời điểm mở khoá và đặt Retry-After', () => {
    const c: Captured = { headers: {} };
    filter.catch(new UnauthorizedException({
      message: MSG.ACCOUNT_LOCKED(15), code: 'ACCOUNT_LOCKED',
      details: { lockedUntil: '2026-10-02T10:15:00.000Z', retryAfterSeconds: 900 },
    }), hostFor(c));
    expect(c.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(c.body?.code).toBe('ACCOUNT_LOCKED');
    expect(c.body?.details).toEqual({ lockedUntil: '2026-10-02T10:15:00.000Z', retryAfterSeconds: 900 });
    expect(c.headers['Retry-After']).toBe('900');
  });

  it('QA-09: chuyển nguyên danh sách lịch hẹn bị ảnh hưởng cho giao diện', () => {
    const c: Captured = { headers: {} };
    const appointments = [{ id: '1', code: 'ABCD2345', startTime: '09:00', endTime: '10:00', customerName: 'An' }];
    filter.catch(new ConflictException({ message: 'x', code: 'SHIFT_HAS_APPOINTMENTS', details: { appointments } }), hostFor(c));
    expect(c.status).toBe(409);
    expect((c.body?.details as { appointments: unknown[] }).appointments).toEqual(appointments);
  });

  it('QA-22: lỗi vượt dung lượng của multer trả thông điệp tiếng Việt', () => {
    const c: Captured = { headers: {} };
    filter.catch(new PayloadTooLargeException('File too large'), hostFor(c));
    expect(c.status).toBe(413);
    expect(c.body?.message).toBe(MSG.FILE_TOO_LARGE(2));
  });
});
