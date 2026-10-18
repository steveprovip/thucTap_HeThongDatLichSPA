import { networkInterfaces } from 'node:os';
import { mailLinkBase } from './mail.service';

type Nets = ReturnType<typeof networkInterfaces>;
const nets = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  wifi: [{ address: '192.168.1.23', family: 'IPv4', internal: false }],
} as unknown as Nets;

describe('mailLinkBase — QA Sprint 4 · mục 4: link trong email mở được trên thiết bị khác', () => {
  it('localhost → IP mạng LAN, giữ cổng', () => {
    expect(mailLinkBase('http://localhost:5173', {}, nets)).toBe('http://192.168.1.23:5173');
  });
  it('MAIL_LINK_BASE_URL ưu tiên tuyệt đối', () => {
    expect(mailLinkBase('http://localhost:5173', { MAIL_LINK_BASE_URL: 'https://huongsen-salon.pages.dev/' }, nets))
      .toBe('https://huongsen-salon.pages.dev');
  });
  it('địa chỉ công khai giữ nguyên', () => {
    expect(mailLinkBase('https://huongsen-salon.pages.dev', {}, nets)).toBe('https://huongsen-salon.pages.dev');
  });
  it('không có mạng LAN / môi trường test → giữ nguyên', () => {
    expect(mailLinkBase('http://localhost:5173', {}, { lo: nets.lo } as Nets)).toBe('http://localhost:5173');
    expect(mailLinkBase('http://localhost:5173', { NODE_ENV: 'test' }, nets)).toBe('http://localhost:5173');
  });
});
