import { useState } from 'react';
import { Info, MailWarning, ShieldCheck } from 'lucide-react';
import { DEPOSIT_THRESHOLD, depositAmount } from '@/utils/opsHelpers';
import { Field, Input, Textarea } from '@/components';
import { formatDuration, formatVnd, formatWeekdayDate, VN_PHONE_MESSAGE, VN_PHONE_REGEX } from '@/utils/format';
import { useBooking } from '@/contexts/BookingContext';

export interface Step4Errors {
  fullName?: string;
  phone?: string;
  email?: string;
  note?: string;
}

/**
 * Bước 4 — điền tên, số điện thoại và chốt lịch, không cần tạo tài khoản (S2-07).
 * Email: chủ tiệm bật BOOKING_REQUIRE_EMAIL để bắt buộc; nếu không bắt buộc mà khách bỏ trống thì nói rõ
 * khách mất gì (mã tra cứu, thông báo đổi giờ/đổi thợ/huỷ, nhắc lịch) — phản hồi QA 11/10.
 */
export function Step4Confirm({ errors, requireEmail = false }: { errors: Step4Errors; requireEmail?: boolean }) {
  const { selected, date, time, customer, setCustomer, totalDuration, totalPrice } = useBooking();
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const phoneError =
    errors.phone ??
    (touched.phone && customer.phone && !VN_PHONE_REGEX.test(customer.phone)
      ? VN_PHONE_MESSAGE
      : undefined);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-gold/25 bg-white/40 p-4 sm:p-5">
        <div aria-hidden className="gold-rule absolute inset-x-6 top-0" />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="eyebrow">Tóm tắt lịch hẹn</h3>
          <p className="tnum text-sm font-medium text-slate-900">{time} · {formatWeekdayDate(`${date}T00:00:00+07:00`)}</p>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {selected.map((s) => (
            <li key={s.id} className="flex items-baseline gap-3">
              <span className="min-w-0 truncate text-slate-800">{s.name}</span>
              <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-slate-300" />
              <span className="tnum shrink-0 text-slate-500">{s.durationMinutes}′</span>
              <span className="tnum w-24 shrink-0 text-right font-medium text-slate-900">{s.priceText}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-200/70 pt-3">
          <span className="text-sm text-slate-500">Tạm tính · <span className="tnum">{formatDuration(totalDuration)}</span></span>
          <span className="tnum font-display text-[2rem] font-semibold leading-none text-slate-900">{formatVnd(totalPrice)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          Đây là số tiền tạm tính, giá cuối do tiệm chốt khi thanh toán.
        </p>
        {depositAmount(totalPrice) > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Chính sách cọc giữ lịch:</strong> lịch trên {formatVnd(DEPOSIT_THRESHOLD)} cọc 30%
              ({formatVnd(depositAmount(totalPrice))}) qua VietQR trong 2 giờ sau khi đặt, nội dung
              {' '}<span className="font-mono">COC {customer.phone || '[SĐT]'} [MÃ LỊCH]</span>. Cọc trừ vào hoá đơn; huỷ trước 24 giờ được hoàn.
            </span>
          </p>
        )}
      </section>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Họ và tên" required error={errors.fullName} htmlFor="bk-name">
          <Input
            id="bk-name"
            value={customer.fullName}
            onChange={(e) => setCustomer({ fullName: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
            placeholder="Nguyễn Thị Mai"
            autoComplete="name"
            invalid={!!errors.fullName}
          />
        </Field>

        <Field label="Số điện thoại" required error={phoneError} htmlFor="bk-phone"
               hint="Tiệm dùng số này để liên hệ và để bạn tra cứu lịch">
          <Input
            id="bk-phone"
            value={customer.phone}
            onChange={(e) => setCustomer({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            placeholder="0901234567"
            inputMode="numeric"
            autoComplete="tel"
            invalid={!!phoneError}
          />
        </Field>
      </div>

      <Field label={requireEmail ? 'Email nhận xác nhận' : 'Email nhận xác nhận (khuyến nghị)'} required={requireEmail}
             error={errors.email} htmlFor="bk-email"
             hint="Gửi ngay chi tiết lịch hẹn, mã tra cứu, đường đi và liên kết đổi/huỷ lịch; nhắc lịch trước 24 giờ">
        <Input
          id="bk-email"
          type="email"
          value={customer.email}
          onChange={(e) => setCustomer({ email: e.target.value })}
          placeholder="ban@example.com"
          autoComplete="email"
          invalid={!!errors.email}
        />
      </Field>
      {!requireEmail && !customer.email.trim() && (
        <p className="-mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <MailWarning size={15} className="mt-0.5 shrink-0" />
          <span>
            Không có email, bạn sẽ <strong>không nhận được mã tra cứu</strong> qua thư và <strong>không được báo</strong> khi
            tiệm đổi giờ, đổi thợ hoặc huỷ lịch. Hãy ghi lại mã lịch ở bước sau.
          </span>
        </p>
      )}

      <Field
        label="Ghi chú cho thợ (tuỳ chọn)"
        error={errors.note}
        htmlFor="bk-note"
        hint={`${customer.note.length}/300 ký tự`}
      >
        <Textarea
          id="bk-note"
          value={customer.note}
          maxLength={300}
          onChange={(e) => setCustomer({ note: e.target.value })}
          placeholder="Ví dụ: tóc em đang yếu, xin làm nhẹ tay giúp em."
        />
      </Field>
    </div>
  );
}
