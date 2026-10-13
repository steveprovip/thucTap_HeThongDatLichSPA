import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmailQueueItem } from '../../database/entities/email-queue.entity';
import { explainMailError, MailService } from './mail.service';

/** Hosting miễn phí chặn cổng SMTP → gửi qua API HTTPS của Brevo khi có BREVO_API_KEY. */
describe('Gửi email qua API Brevo', () => {
  const cfg = (extra: Record<string, unknown>) => ({
    get: (k: string) => ({
      'mail.host': 'smtp.example.com', 'mail.port': 587, 'mail.secure': false, 'mail.user': '', 'mail.password': '',
      'mail.fromName': 'Salon & Spa Hương Sen', 'mail.fromAddress': 'tiem@huongsen.vn', 'app.salonName': 'Hương Sen', ...extra,
    } as Record<string, unknown>)[k],
  }) as unknown as ConfigService;
  const fetchMock = jest.fn();
  beforeEach(() => { fetchMock.mockReset(); (global as { fetch: unknown }).fetch = fetchMock; });

  it('có BREVO_API_KEY → chế độ "api", gửi đúng người nhận / tiêu đề / nội dung qua HTTPS', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    const mail = new MailService(cfg({ 'mail.brevoApiKey': 'xkeysib-test' }), {} as Repository<EmailQueueItem>);
    mail.onModuleInit();
    expect(mail.mode).toBe('api');
    await mail.deliver({ toEmail: 'khach@gmail.com', toName: 'Nguyễn Lan', subject: 'Xác nhận lịch', bodyHtml: '<p>Chào</p>' } as EmailQueueItem);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'Salon & Spa Hương Sen', email: 'tiem@huongsen.vn' },
      to: [{ email: 'khach@gmail.com', name: 'Nguyễn Lan' }], subject: 'Xác nhận lịch', htmlContent: '<p>Chào</p>',
    });
  });

  it('Brevo từ chối key → lỗi có lời giải thích; không có key → dùng SMTP như cũ', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Key not found' });
    const mail = new MailService(cfg({ 'mail.brevoApiKey': 'sai' }), {} as Repository<EmailQueueItem>);
    mail.onModuleInit();
    await expect(mail.sendTest('a@b.vn')).rejects.toThrow(/Brevo từ chối API key/);
    expect(explainMailError(Object.assign(new Error('Brevo từ chối gửi thư (HTTP 401)'), { code: 'EAUTH' }))).toMatch(/BREVO_API_KEY/);
    const smtp = new MailService(cfg({ 'mail.brevoApiKey': '' }), {} as Repository<EmailQueueItem>);
    expect(smtp.mode).toBe('smtp');
  });
});
