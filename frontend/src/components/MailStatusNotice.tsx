import { FormEvent, useEffect, useState } from 'react';
import { MailWarning, Send } from 'lucide-react';
import { getErrorMessage, notificationsApi } from '@/api';
import type { MailStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button, Input, Notice } from './ui';

/**
 * Ghi chú test 13/10 "email chưa nhận được thông báo": hệ thống mặc định gửi thư vào MailDev (hộp thư thử trên máy,
 * localhost:1025) nên khách / nhân viên KHÔNG nhận được gì dù hàng đợi báo "đã gửi". Thẻ này nói rõ điều đó, chỉ chỗ
 * thiết lập Gmail và cho chủ tiệm gửi thư thử để kiểm tra ngay. Ẩn khi thư đang gửi thật và không có lỗi.
 */
export function MailStatusNotice() {
  const { user } = useAuth();
  const toast = useToast();
  const canTest = user?.role === 'owner' || user?.role === 'admin';
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [to, setTo] = useState(user?.email ?? '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    notificationsApi.mailStatus().then((s) => { if (alive) setStatus(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!status || (status.mode === 'smtp' && status.failed24h === 0)) return null;

  const test = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await notificationsApi.mailTest(to.trim());
      toast.success(r.mode === 'test-inbox'
        ? 'Đã gửi vào hộp thư THỬ NGHIỆM (MailDev) — hộp thư thật chưa nhận được cho tới khi thiết lập Gmail.'
        : `Đã gửi thư thử tới ${to.trim()} — kiểm tra hộp thư (cả mục Spam / Quảng cáo).`);
      setStatus(await notificationsApi.mailStatus());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const testInbox = status.mode === 'test-inbox';
  return (
    <Notice tone={testInbox ? 'warning' : 'danger'} icon={<MailWarning size={18} />}
            title={testInbox ? 'Email chưa gửi ra ngoài — khách và nhân viên KHÔNG nhận được thư'
              : `${status.failed24h} email gửi lỗi trong 24 giờ qua`}>
      {testInbox ? (
        <p>
          Hệ thống đang gửi thư vào <strong>hộp thư thử nghiệm trên máy</strong> (MailDev, {status.sent24h} thư trong 24 giờ) nên thư xác nhận,
          nhắc lịch, mật khẩu tạm… không tới Gmail của khách. Chủ tiệm mở <strong>HoYoSalon → ⚙ Thiết lập cửa hàng → Gmail gửi thư</strong>,
          nhập Gmail của tiệm và <strong>mật khẩu ứng dụng 16 ký tự</strong> (Google → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng), lưu rồi
          bấm BẮT ĐẦU lại. {status.testInboxUrl && (
            <a href={status.testInboxUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Xem hộp thư thử nghiệm</a>
          )}
        </p>
      ) : (
        <p>Lỗi gần nhất: {status.lastError ?? 'không rõ'}. Hệ thống tự thử lại 3 lần, cách nhau 10 phút.</p>
      )}
      {canTest && (
        <form onSubmit={test} className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="email nhận thư thử"
                 aria-label="Email nhận thư thử" className="h-9 max-w-xs bg-white" />
          <Button type="submit" size="sm" variant="outline" loading={sending} icon={<Send size={14} />}>Gửi email thử</Button>
        </form>
      )}
    </Notice>
  );
}
