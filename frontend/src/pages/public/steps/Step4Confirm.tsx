import { useState } from 'react';
import { Info } from 'lucide-react';
import { Field, Input, Textarea } from '@/components';
import { formatDuration, formatVnd, formatWeekdayDate, VN_PHONE_REGEX } from '@/utils/format';
import { useBooking } from '@/contexts/BookingContext';

export interface Step4Errors {
  fullName?: string;
  phone?: string;
  email?: string;
  note?: string;
}

/** Bước 4 — điền tên, số điện thoại và chốt lịch, không cần tạo tài khoản (S2-07). */
export function Step4Confirm({ errors }: { errors: Step4Errors }) {
  const { selected, date, time, customer, setCustomer, totalDuration, totalPrice } = useBooking();
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const phoneError =
    errors.phone ??
    (touched.phone && customer.phone && !VN_PHONE_REGEX.test(customer.phone)
      ? 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0'
      : undefined);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-surface-alt p-4">
        <h3 className="text-sm font-bold text-brand-800">Tóm tắt lịch hẹn</h3>
        <dl className="mt-2.5 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Thời gian</dt>
            <dd className="text-right font-semibold">
              {time} · {formatWeekdayDate(`${date}T00:00:00+07:00`)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Tổng thời lượng</dt>
            <dd className="font-semibold">{formatDuration(totalDuration)}</dd>
          </div>
        </dl>
        <ul className="mt-3 space-y-1 border-t border-brand-200 pt-2.5 text-sm">
          {selected.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{s.name} <span className="text-ink-muted">({s.durationMinutes}′)</span></span>
              <span className="shrink-0 font-medium">{s.priceText}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-baseline justify-between border-t border-brand-200 pt-2.5">
          <span className="text-sm font-semibold">Tạm tính</span>
          <span className="text-lg font-bold text-brand-800">{formatVnd(totalPrice)}</span>
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          Đây là số tiền tạm tính, giá cuối do tiệm chốt khi thanh toán.
        </p>
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

      <Field label="Email (tuỳ chọn)" error={errors.email} htmlFor="bk-email"
             hint="Có email thì tiệm gửi xác nhận và nhắc lịch trước 24 giờ">
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
