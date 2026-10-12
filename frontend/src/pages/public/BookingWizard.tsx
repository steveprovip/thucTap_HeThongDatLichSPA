import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock, Wallet } from 'lucide-react';
import { getErrorField, getErrorMessage, publicApi } from '@/api';
import type { BookingResult, Quote } from '@/types';
import { BackButton, Button, CustomerAiAssistant } from '@/components';
import { formatDuration, formatVnd, todayISO, VN_PHONE_MESSAGE, VN_PHONE_REGEX } from '@/utils/format';
import { emailError } from '@/utils/validators';
import { useSalonInfo } from '@/utils/salonInfo';
import { useBooking } from '@/contexts/BookingContext';
import { useToast } from '@/contexts/ToastContext';
import { Step1Services } from './steps/Step1Services';
import { Step2Slot } from './steps/Step2Slot';
import { Step3Stylist } from './steps/Step3Stylist';
import { Step4Confirm, Step4Errors } from './steps/Step4Confirm';
import { BookingSuccess } from './steps/BookingSuccess';
import { SplitBookingWarning } from './steps/SplitBookingWarning';
import { HoldBanner } from './steps/HoldBanner';
import { useSlotHold } from './useSlotHold';

const STEPS = [
  { n: 1, label: 'Dịch vụ' },
  { n: 2, label: 'Khung giờ' },
  { n: 3, label: 'Chọn thợ' },
  { n: 4, label: 'Xác nhận' },
];

/** Luồng đặt lịch 4 bước, tối ưu cho màn hình rộng 360px và dùng một tay. */
export function BookingWizard() {
  const booking = useBooking();
  const requireEmail = useSalonInfo().info?.booking?.requireEmail ?? false;
  const { step, setStep, selected, date, time, stylistId, customer, totalDuration, totalPrice, reset } = booking;
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [errors, setErrors] = useState<Step4Errors>({});
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselected = useRef(false);

  useEffect(() => {
    const serviceId = searchParams.get('service');
    if (!serviceId || preselected.current) return;
    preselected.current = true;
    void publicApi.catalog().then(groups => {
      const service = groups.flatMap(group => group.services).find(item => item.id === serviceId);
      if (service && !selected.some(item => item.id === serviceId)) booking.toggleService(service);
    }).catch(error => toast.error(getErrorMessage(error)));
  }, [searchParams, booking, selected, toast]);

  // TASK v3 · NV1: trợ lý tư vấn chọn dịch vụ → điền giỏ theo giá / thời lượng HIỆN HÀNH rồi sang bước chọn giờ
  const { replaceServices, setDate } = booking;
  /** `date` (yyyy-MM-dd): ngày trợ lý vừa tra giờ trống → bước chọn giờ mở sẵn đúng ngày đó. */
  const applyServices = useCallback(async (ids: string[], date?: string | null) => {
    try {
      const all = (await publicApi.catalog()).flatMap((g) => g.services);
      const list = ids.map((id) => all.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
      if (!list.length) { toast.warning('Dịch vụ vừa chọn hiện không còn nhận đặt online'); return; }
      replaceServices(list);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayISO()) setDate(date);
      setStep(2);
      toast.success(`Đã điền ${list.length} dịch vụ — chọn ngày giờ phù hợp nhé`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }, [replaceServices, setDate, setStep, toast]);
  const servicesParam = searchParams.get('services');
  const appliedParam = useRef<string | null>(null);
  useEffect(() => {
    if (!servicesParam || appliedParam.current === servicesParam) return;
    appliedParam.current = servicesParam;
    void applyServices(servicesParam.split(',').filter(Boolean).slice(0, 5), searchParams.get('date'));
  }, [servicesParam, applyServices, searchParams]);

  // QA-01: hỏi máy chủ tổng thời lượng so với ca dài nhất trong tuần ngay khi giỏ thay đổi
  const [quote, setQuote] = useState<Quote | null>(null);
  const cartKey = selected.map((s) => s.id).join(',');
  useEffect(() => {
    if (!cartKey) { setQuote(null); return; }
    let alive = true;
    publicApi.quote(cartKey.split(','))
      .then((q) => { if (alive) setQuote(q); })
      .catch(() => { if (alive) setQuote(null); }); // cảnh báo là phụ, lỗi mạng không chặn khách đặt lịch
    return () => { alive = false; };
  }, [cartKey]);

  // Mentor S2 · mục 11: giữ chỗ khung giờ trong lúc khách điền thông tin ở bước 4
  const serviceIds = useMemo(() => (cartKey ? cartKey.split(',') : []), [cartKey]);
  const slotHold = useSlotHold({
    active: step === 4 && !result,
    serviceIds,
    date,
    time,
    stylistId,
    onLost: (message) => {
      toast.error(message);
      booking.setTime('');
      setStep(2);
    },
  });

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
      next.phone = VN_PHONE_MESSAGE;
    }
    const invalidEmail = emailError(customer.email, requireEmail);
    if (invalidEmail) next.email = invalidEmail;
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
        holdToken: slotHold.token,
      });
      slotHold.forget();
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
        phone={customer.phone}
        email={customer.email.trim() || undefined}
        onBookAgain={() => { setResult(null); reset(); }}
      />
    );
  }

  return (
    <div className={`space-y-4 ${quote?.exceedsLongestShift ? 'pb-60' : 'pb-28'} sm:pb-4`}>
      {/* Lỗi 8: nút quay lại rõ ràng ở đầu wizard — lùi một bước, ở bước 1 thì về trang trước */}
      <BackButton
        label={step > 1 ? `Quay lại bước ${step - 1}` : 'Quay lại'}
        onClick={step > 1 ? () => setStep(step - 1) : undefined}
        to="/"
      />
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
                className={`flex w-full min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold
                  transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-xs
                  ${active ? 'border-teal-600 bg-teal-600 text-white shadow-sm' : done ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-500'}
                  ${booking.canGoToStep(s.n) ? '' : 'cursor-not-allowed opacity-60'}`}
                aria-current={active ? 'step' : undefined}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]
                  ${active ? 'bg-white text-teal-700' : done ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {done ? <Check size={12} strokeWidth={3} /> : s.n}
                </span>
                <span className="w-full truncate text-center sm:text-left">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div key={step} className="card animate-fade-in p-4 sm:p-6">
        {step === 1 && <Step1Services />}
        {step === 2 && <Step2Slot />}
        {step === 3 && <Step3Stylist />}
        {step === 4 && (
          <div className="space-y-4">
            <HoldBanner hold={slotHold.hold} state={slotHold.state} remainingMs={slotHold.remainingMs}
                        onExtend={() => void slotHold.extend()} />
            <Step4Confirm errors={errors} requireEmail={requireEmail} />
          </div>
        )}
      </div>

      {/* Thanh tổng kết + điều hướng, dính đáy màn hình trên điện thoại */}
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur
                      sm:sticky sm:bottom-4 sm:rounded-2xl sm:border sm:px-5 sm:py-3.5 sm:shadow-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          {/* Cố định ngay trên giỏ dịch vụ và nút "Tiếp tục", ở mọi bước */}
          <SplitBookingWarning quote={quote} className="w-full" />
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Clock size={14} /> {selected.length} dịch vụ · {formatDuration(totalDuration)}
            </span>
            <span className="inline-flex items-center gap-1 text-base font-bold text-slate-900">
              <Wallet size={15} className="text-teal-600" /> <span key={totalPrice} className="animate-fade-in-scale inline-block">{formatVnd(totalPrice)}</span>
            </span>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {/* Bước 1 vẫn có đường lui về trang chủ cho khách lỡ bấm nhầm vào */}
            <Button variant="outline" size="sm" icon={<ArrowLeft size={15} />}
                    onClick={() => (step > 1 ? setStep(step - 1) : navigate('/'))}>
              {step > 1 ? 'Quay lại' : 'Trang chủ'}
            </Button>
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
      {/* Nâng nút tư vấn lên trên thanh "Tiếp tục" dính đáy trên điện thoại */}
      <CustomerAiAssistant liftPx={110} onBook={(services, date) => void applyServices(services.map((s) => s.id), date)} />
    </div>
  );
}
