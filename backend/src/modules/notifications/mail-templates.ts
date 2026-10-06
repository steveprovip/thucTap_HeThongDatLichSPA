import { formatVnd } from '../../common/utils/currency.util';
import { formatDateTimeVN, formatTimeVN } from '../../common/utils/time.util';

export interface SalonInfo {
  name: string;
  address: string;
  hotline: string;
  frontendUrl: string;
}

export interface AppointmentMailData {
  code: string;
  /** 'pending' | 'confirmed'… — email xác nhận nói rõ tiệm đã chốt hay còn chờ xác nhận. */
  status?: string;
  /** Khách được tự huỷ / đổi khi còn ít nhất bao nhiêu phút trước giờ hẹn. */
  cancelCutoffMinutes?: number;
  customerName: string;
  stylistName: string;
  startAt: Date;
  endAt: Date;
  services: { name: string; durationMinutes: number; price: number }[];
  totalDuration: number;
  estimatedTotal: number;
}

/** Dữ liệu do khách tự nhập (họ tên, lý do…) phải escape trước khi chèn vào HTML email. */
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const wrap = (salon: SalonInfo, title: string, inner: string): string => `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f3f0;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#2b2b2b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
        <tr><td style="background:#8c5a3c;padding:20px 24px;color:#fff">
          <div style="font-size:18px;font-weight:700">${salon.name}</div>
          <div style="font-size:12px;opacity:.85">${salon.address}</div>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 16px;font-size:20px;color:#8c5a3c">${title}</h1>
          ${inner}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#faf7f4;font-size:12px;color:#7a6a5f">
          Mọi thắc mắc xin gọi <strong>${salon.hotline}</strong>.<br>
          Email này được gửi tự động, vui lòng không trả lời.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const serviceRows = (data: AppointmentMailData): string =>
  data.services
    .map(
      (s) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${esc(s.name)}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${s.durationMinutes} phút</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatVnd(s.price)}</td>
      </tr>`,
    )
    .join('');

const appointmentBlock = (data: AppointmentMailData): string => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:16px">
    <tr><td style="padding:4px 0;color:#7a6a5f;width:130px">Mã tra cứu</td>
        <td style="padding:4px 0"><strong style="font-size:18px;letter-spacing:2px">${data.code}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#7a6a5f">Thời gian</td>
        <td style="padding:4px 0"><strong>${formatDateTimeVN(data.startAt)}</strong> — dự kiến xong ${formatTimeVN(data.endAt)}</td></tr>
    <tr><td style="padding:4px 0;color:#7a6a5f">Thợ phụ trách</td><td style="padding:4px 0">${esc(data.stylistName)}</td></tr>
    <tr><td style="padding:4px 0;color:#7a6a5f">Tổng thời lượng</td><td style="padding:4px 0">${data.totalDuration} phút</td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:8px">
    <tr><th align="left" style="padding:6px 0;border-bottom:2px solid #8c5a3c">Dịch vụ</th>
        <th align="right" style="padding:6px 0;border-bottom:2px solid #8c5a3c">Thời lượng</th>
        <th align="right" style="padding:6px 0;border-bottom:2px solid #8c5a3c">Giá</th></tr>
    ${serviceRows(data)}
    <tr><td style="padding:8px 0"><strong>Tạm tính</strong></td><td></td>
        <td style="padding:8px 0;text-align:right"><strong>${formatVnd(data.estimatedTotal)}</strong></td></tr>
  </table>
  <p style="font-size:12px;color:#7a6a5f;margin:0 0 16px">
    Giá trên là tạm tính, số tiền cuối cùng do tiệm chốt khi thanh toán.
  </p>`;

/** yyyyMMddTHHmmssZ cho liên kết Google Calendar. */
const gcalStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Mentor S2 · mục 10: thông tin "việc cần làm tiếp" trong email xác nhận đặt lịch. */
const nextSteps = (salon: SalonInfo, data: AppointmentMailData): string => {
  const calendar = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${salon.name} - lịch hẹn ${data.code}`)}`
    + `&dates=${gcalStamp(data.startAt)}/${gcalStamp(data.endAt)}`
    + `&details=${encodeURIComponent(`Mã tra cứu ${data.code} · ${data.services.map((s) => s.name).join(', ')} · Thợ ${data.stylistName}`)}`
    + `&location=${encodeURIComponent(salon.address)}`;
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`;
  const tel = salon.hotline.replace(/[^\d+]/g, '');
  const status = data.status === 'pending'
    ? '<p style="font-size:14px;margin:0 0 12px;padding:10px 12px;background:#fff7e6;border-radius:8px;color:#8a5a00">Trạng thái: <strong>Chờ tiệm xác nhận</strong>. Tiệm sẽ xác nhận sớm và gửi email nhắc trước giờ hẹn 24 giờ.</p>'
    : data.status === 'confirmed'
      ? '<p style="font-size:14px;margin:0 0 12px;padding:10px 12px;background:#eaf7ef;border-radius:8px;color:#1f6b3a">Trạng thái: <strong>Đã xác nhận</strong>. Hẹn gặp bạn tại tiệm!</p>'
      : '';
  return `${status}
  <ul style="font-size:13px;color:#4a3f38;padding-left:18px;margin:0 0 12px">
    <li style="margin-bottom:4px">Vui lòng đến trước 5–10 phút; nhớ mang theo <strong>mã tra cứu ${data.code}</strong>.</li>
    ${data.cancelCutoffMinutes ? `<li style="margin-bottom:4px">Bạn tự huỷ được trên trang tra cứu khi còn ít nhất <strong>${Math.round(data.cancelCutoffMinutes / 60 * 10) / 10} giờ</strong> trước giờ hẹn; sát giờ hơn vui lòng gọi tiệm.</li>` : ''}
    <li style="margin-bottom:4px">Địa chỉ: <a href="${map}" style="color:#8c5a3c">${esc(salon.address)}</a> · Hotline: <a href="tel:${tel}" style="color:#8c5a3c">${esc(salon.hotline)}</a></li>
  </ul>
  <p style="font-size:13px;margin:0 0 4px"><a href="${calendar}" style="color:#8c5a3c;font-weight:600">+ Thêm vào Google Calendar</a></p>`;
};

const button = (url: string, label: string): string =>
  `<p style="margin:20px 0"><a href="${url}"
     style="display:inline-block;background:#8c5a3c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${label}</a></p>`;

export const MailTemplates = {
  bookingConfirmation(salon: SalonInfo, data: AppointmentMailData) {
    return {
      subject: `[${salon.name}] Xác nhận lịch hẹn ${data.code} — ${formatDateTimeVN(data.startAt)}`,
      html: wrap(
        salon,
        'Tiệm đã nhận lịch hẹn của bạn',
        `<p style="font-size:14px">Chào <strong>${esc(data.customerName)}</strong>, cảm ơn bạn đã đặt lịch.</p>
         ${appointmentBlock(data)}
         ${nextSteps(salon, data)}
         ${button(`${salon.frontendUrl}/tra-cuu?code=${data.code}`, 'Xem hoặc huỷ lịch hẹn')}`,
      ),
    };
  },

  bookingReminder(salon: SalonInfo, data: AppointmentMailData) {
    return {
      subject: `[${salon.name}] Nhắc lịch hẹn ${formatDateTimeVN(data.startAt)}`,
      html: wrap(
        salon,
        'Nhắc bạn buổi hẹn sắp tới',
        `<p style="font-size:14px">Chào <strong>${esc(data.customerName)}</strong>, tiệm xin nhắc bạn buổi hẹn sắp tới.</p>
         ${appointmentBlock(data)}
         <p style="font-size:14px">Nếu bạn bận đột xuất, vui lòng huỷ sớm để tiệm kịp nhận khách khác.</p>
         ${button(`${salon.frontendUrl}/tra-cuu?code=${data.code}`, 'Xem hoặc huỷ lịch hẹn')}`,
      ),
    };
  },

  bookingChanged(salon: SalonInfo, data: AppointmentMailData, changeSummary: string) {
    return {
      subject: `[${salon.name}] Thay đổi lịch hẹn ${data.code}`,
      html: wrap(
        salon,
        'Lịch hẹn của bạn vừa được điều chỉnh',
        `<p style="font-size:14px">Chào <strong>${esc(data.customerName)}</strong>, tiệm vừa điều chỉnh lịch hẹn của bạn:</p>
         <p style="font-size:14px;background:#fff6ed;border-left:4px solid #d98d4e;padding:10px 14px">${changeSummary}</p>
         ${appointmentBlock(data)}
         ${button(`${salon.frontendUrl}/tra-cuu?code=${data.code}`, 'Xem chi tiết lịch hẹn')}`,
      ),
    };
  },

  bookingCancelled(salon: SalonInfo, data: AppointmentMailData, reason: string) {
    return {
      subject: `[${salon.name}] Lịch hẹn ${data.code} đã được huỷ`,
      html: wrap(
        salon,
        'Lịch hẹn đã được huỷ',
        `<p style="font-size:14px">Chào <strong>${esc(data.customerName)}</strong>, lịch hẹn lúc
         <strong>${formatDateTimeVN(data.startAt)}</strong> đã được huỷ.</p>
         <p style="font-size:14px">Lý do: ${esc(reason)}</p>
         ${button(`${salon.frontendUrl}/dat-lich`, 'Đặt lịch mới')}`,
      ),
    };
  },

  reviewInvitation(salon: SalonInfo, data: AppointmentMailData, token: string) {
    return {
      subject: `[${salon.name}] Bạn thấy buổi dịch vụ hôm nay thế nào?`,
      html: wrap(
        salon,
        'Mời bạn chấm điểm buổi dịch vụ',
        `<p style="font-size:14px">Chào <strong>${esc(data.customerName)}</strong>, cảm ơn bạn đã tin tưởng tiệm.</p>
         <p style="font-size:14px">Bạn dành 30 giây chấm điểm cho thợ <strong>${esc(data.stylistName)}</strong> nhé.
         Liên kết dùng được một lần trong 7 ngày.</p>
         ${button(`${salon.frontendUrl}/danh-gia/${token}`, 'Chấm điểm ngay')}`,
      ),
    };
  },

  accountCreated(salon: SalonInfo, fullName: string, email: string, tempPassword: string) {
    return {
      subject: `[${salon.name}] Tài khoản của bạn đã được tạo`,
      html: wrap(
        salon,
        'Tài khoản đã sẵn sàng',
        `<p style="font-size:14px">Chào <strong>${esc(fullName)}</strong>, quản trị viên vừa tạo tài khoản cho bạn.</p>
         <table role="presentation" style="font-size:14px;margin:12px 0">
           <tr><td style="padding:4px 12px 4px 0;color:#7a6a5f">Email đăng nhập</td><td><strong>${esc(email)}</strong></td></tr>
           <tr><td style="padding:4px 12px 4px 0;color:#7a6a5f">Mật khẩu tạm</td>
               <td><strong style="letter-spacing:1px">${tempPassword}</strong></td></tr>
         </table>
         <p style="font-size:14px;background:#fff6ed;border-left:4px solid #d98d4e;padding:10px 14px">
           Vì lý do bảo mật, bạn buộc phải đổi mật khẩu ngay ở lần đăng nhập đầu tiên.</p>
         ${button(`${salon.frontendUrl}/dang-nhap`, 'Đăng nhập')}`,
      ),
    };
  },

  passwordReset(salon: SalonInfo, fullName: string, token: string) {
    return {
      subject: `[${salon.name}] Đặt lại mật khẩu`,
      html: wrap(
        salon,
        'Yêu cầu đặt lại mật khẩu',
        `<p style="font-size:14px">Chào <strong>${esc(fullName)}</strong>, bạn vừa yêu cầu đặt lại mật khẩu.</p>
         <p style="font-size:14px">Liên kết dưới đây <strong>hết hạn sau 30 phút</strong> và chỉ dùng được một lần.</p>
         ${button(`${salon.frontendUrl}/dat-lai-mat-khau?token=${token}`, 'Đặt lại mật khẩu')}
         <p style="font-size:12px;color:#7a6a5f">Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`,
      ),
    };
  },
};
