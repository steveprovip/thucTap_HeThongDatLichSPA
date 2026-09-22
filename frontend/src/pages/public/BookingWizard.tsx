import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, Wallet } from 'lucide-react';
import { getErrorField, getErrorMessage, publicApi } from '@/api';
import type { BookingResult } from '@/types';
import { Button } from '@/components';
import { formatDuration, formatVnd, VN_PHONE_REGEX } from '@/utils/format';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';
import { Step1Services } from './steps/Step1Services';
import { Step2Slot } from './steps/Step2Slot';
import { Step3Stylist } from './steps/Step3Stylist';
import { Step4Confirm, Step4Errors } from './steps/Step4Confirm';
import { BookingSuccess } from './steps/BookingSuccess';

const STEPS = [
  { n: 1, label: 'Dịch vụ' },
  { n: 2, label: 'Khung giờ' },
  { n: 3, label: 'Chọn thợ' },
  { n: 4, label: 'Xác nhận' },
];

/** Luồng đặt lịch 4 bước, tối ưu cho màn hình rộng 360px và dùng một tay. */
export function BookingWizard() {
  const booking = useBooking();
  const { step, setStep, selected, date, time, stylistId, customer, totalDuration, totalPrice, reset } = booking;
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [errors, setErrors] = useState<Step4Errors>({});
  const toast = useToast();

  const canNext = useMemo(() => {
    if (step === 1) return selected.length > 0;
    if (step === 2) return !!date && !!time;
    if (step === 3) return true; // "thợ bất kỳ" luôn hợp lệ
    return true;
  }, [step, selected.length, date, time]);

  const validateStep4 = (): boolean => {
    const next: Step4Errors = {};
    if (!customer.fullName.trim()) next.fullName = 'Vui lòng nhập họ tên';
    if (!VN_PHONE_REGEX.test(customer.phone)) {
      next.phone = 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0';
    }
    if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) {
      next.email = 'Email không đúng định dạng';
    }
    if (customer.note.length > 300) next.note = 'Ghi chú tối đa 300 ký tự';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validateStep4()) return;
    setSubmitting(true);
    try {
      const res = await publicApi.createBooking({
        serviceIds: selected.map((s) => s.id),
        date,
        time,
        stylistId: stylistId ?? undefined,
        fullName: customer.fullName.trim(),
        phone: customer.phone,
        email: customer.email.trim() || undefined,
        note: customer.note.trim() || undefined,
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const message = getErrorMessage(e);
      const field = getErrorField(e);
      if (field) setErrors({ [field]: message } as Step4Errors);
      toast.error(message);
      // Khung giờ vừa bị người khác đặt mất -> quay lại bước chọn giờ và nạp lại danh sách
      if (/khung giờ/i.test(message)) {
        booking.setTime('');
        setStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <BookingSuccess
        result={result}
        onBookAgain={() => { setResult(null); reset(); }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-28 sm:pb-4">
      {/* Thanh bước */}
      <ol className="grid grid-cols-4 gap-1 sm:gap-2" aria-label="Các bước đặt lịch">
        {STEPS.map((s) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n} className="min-w-0">
              <button
                type="button"
                onClick={() => booking.canGoToStep(s.n) && setStep(s.n)}
                disabled={!booking.canGoToStep(s.n)}
                className={`flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold
                  transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-xs
                  ${active ? 'bg-brand-700 text-white' : done ? 'bg-brand-100 text-brand-800' : 'bg-white text-ink-muted'}
                  ${booking.canGoToStep(s.n) ? '' : 'cursor-not-allowed opacity-60'}`}
                aria-current={active ? 'step' : undefined}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]
                  ${active ? 'bg-white text-brand-800' : done ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-700'}`}>
                  {done ? <Check size={12} strokeWidth={3} /> : s.n}
                </span>
                <span className="w-full truncate text-center sm:text-left">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="card p-4 sm:p-5">
        {step === 1 && <Step1Services />}
        {step === 2 && <Step2Slot />}
        {step === 3 && <Step3Stylist />}
        {step === 4 && <Step4Confirm errors={errors} />}
      </div>

      {/* Thanh tổng kết + điều hướng, dính đáy màn hình trên điện thoại */}
      <div className="fixed inset-x-0 bottom-[58px] z-20 border-t border-brand-100 bg-white px-3 py-2.5
                      sm:static sm:rounded-2xl sm:border sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-ink-soft">
              <Clock size={14} /> {selected.length} dịch vụ · {formatDuration(totalDuration)}
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-brand-800">
              <Wallet size={14} /> {formatVnd(totalPrice)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} icon={<ArrowLeft size={15} />}>
                Quay lại
              </Button>
            )}
            {step < 4 ? (
              <Button size="sm" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Tiếp tục <ArrowRight size={15} />
              </Button>
            ) : (
              <Button size="sm" loading={submitting} onClick={submit}>
                Chốt lịch hẹn <Check size={15} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
