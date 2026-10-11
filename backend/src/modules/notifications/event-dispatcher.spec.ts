import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import { AppointmentEventData, EventDispatcherService, signPayload } from './event-dispatcher.service';

const data: AppointmentEventData = {
  appointmentId: 'a1', code: 'K7M2PQ9X', status: 'pending', source: 'online', startAt: '2026-10-12T03:00:00.000Z',
  startAtText: '10:00 12/10/2026', customerName: 'Trần Bảo Ngân', customerPhone: '0983415276', stylistName: 'Lê Thu Hà',
  services: ['Cắt tóc nữ layer tạo kiểu'], estimatedTotal: 180000,
};
const dispatcher = (cfg: Record<string, unknown>) =>
  new EventDispatcherService({ get: (k: string) => cfg[k] } as unknown as ConfigService);

describe('Thông báo đa kênh — EventDispatcher (webhook Zalo ZNS / SMS)', () => {
  let server: Server;
  let url = '';
  let failNext = 0;
  const got: { headers: IncomingHttpHeaders; body: string }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        got.push({ headers: req.headers, body });
        if (failNext > 0) { failNext -= 1; res.statusCode = 503; return res.end(); }
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => { got.length = 0; failNext = 0; });

  it('gửi sự kiện kèm chữ ký HMAC-SHA256 kiểm chứng được, ghi kênh mock', async () => {
    const d = dispatcher({ 'dispatch.webhookUrls': [url], 'dispatch.secret': 's3cret', 'dispatch.timeoutMs': 2000 });
    const out = await d.emit('appointment.created', data);
    expect(out.map((r) => r.ok)).toEqual([true, true]);
    expect(got).toHaveLength(1);
    expect(got[0].headers['x-salon-event']).toBe('appointment.created');
    expect(got[0].headers['x-salon-signature']).toBe(signPayload('s3cret', got[0].body));
    expect(JSON.parse(got[0].body)).toMatchObject({ type: 'appointment.created', data: { code: 'K7M2PQ9X', customerPhone: '0983415276' } });
    expect(d.recent()[0].event.type).toBe('appointment.created');
  });

  it('lỗi 5xx thử lại 1 lần; webhook chết không bao giờ ném lỗi ra luồng đặt lịch', async () => {
    failNext = 1;
    const d = dispatcher({ 'dispatch.webhookUrls': [url, 'http://127.0.0.1:1/x'], 'dispatch.timeoutMs': 500 });
    const out = await d.emit('appointment.confirmed', data);
    const hook = out.find((r) => r.channel.includes(String((server.address() as AddressInfo).port)));
    expect(hook).toMatchObject({ ok: true, attempts: 2 });
    expect(out.find((r) => r.channel === 'webhook:127.0.0.1:1')).toMatchObject({ ok: false });
  });

  it('không cấu hình webhook → chỉ ghi kênh mock, giữ tối đa 50 sự kiện', async () => {
    const d = dispatcher({});
    for (let i = 0; i < 55; i += 1) await d.emit('appointment.created', { ...data, code: `C${i}` });
    expect(d.recent()).toHaveLength(50);
    expect(d.recent()[0].event.data.code).toBe('C54');
  });
});
