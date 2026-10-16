import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock } from 'lucide-react';
import { getErrorField, getErrorMessage, publicApi } from '@/api';
import type { BookingResult, Quote } from '@/types';
import { AnimatedNumber, BackButton, Button, CustomerAiAssistant } from '@/components';
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
import { playCue } from '@/utils/sound';

const STEPS = [
  { n: 1, label: 'Dịch vụ', title: 'Bạn muốn được chăm sóc', accent: 'điều gì?' },
  { n: 2, label: 'Khung giờ', title: 'Chọn thời điểm', accent: 'thư thái nhất' },
  { n: 3, label: 'Chọn thợ', title: 'Chuyên viên', accent: 'đồng hành cùng bạn' },
  { n: 4, label: 'Xác nhận', title: 'Một bước nữa là', accent: 'xong' },
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  // Hướng chuyển bước: tiến trượt từ phải, lùi trượt từ trái (khách luôn biết mình đang đi tới hay quay lại)
  const prevStep = useRef(step);
  const stepMotion = step >= prevStep.current ? 'step-forward' : 'step-back';
  useEffect(() => { prevStep.current = step; }, [step]);

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
  const { replaceServices, setDate, setTime } = booking;
  /**
   * `date` (yyyy-MM-dd): ngày trợ lý vừa tra giờ trống → bước chọn giờ mở sẵn đúng ngày đó.
   * `time` (HH:mm): giờ trợ lý ĐÃ TRA THẬT còn trống → chọn sẵn; bước 2 tự bỏ chọn nếu giờ đó vừa bị đặt mất.
   */
  const applyServices = useCallback(async (ids: string[], date?: string | null, time?: string | null) => {
    try {
      const all = (await publicApi.catalog()).flatMap((g) => g.services);
      const list = ids.map((id) => all.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
      if (!list.length) { toast.warning('Dịch vụ vừa chọn hiện không còn nhận đặt online'); return; }
      replaceServices(list);
      const validDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayISO();
      if (validDate) setDate(date);
      if (validDate && time && TIME_RE.test(time)) setTime(time);
      setStep(2);
      toast.success(validDate && time ? `Đã điền ${list.length} dịch vụ và chọn sẵn giờ ${time} — kiểm tra rồi bấm Tiếp tục nhé`
        : `Đã điền ${list.length} dịch vụ — chọn ngày giờ phù hợp nhé`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }, [replaceServices, setDate, setTime, setStep, toast]);
  const servicesParam = searchParams.get('services');
  const appliedParam = useRef<string | null>(null);
  useEffect(() => {
    if (!servicesParam || appliedParam.current === servicesParam) return;
    appliedParam.current = servicesParam;
    void applyServices(servicesParam.split(',').filter(Boolean).slice(0, 5), searchParams.get('date'), searchParams.get('time'));
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
      playCue('confirm');
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

  const current = STEPS[step - 1];
  return (
    <div className={`space-y-6 ${quote?.exceedsLongestShift ? 'pb-64' : 'pb-36'} sm:pb-6`}>
      {/* Lỗi 8: nút quay lại rõ ràng ở đầu wizard — lùi một bước, ở bước 1 thì về trang trước */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <BackButton
            label={step > 1 ? `Quay lại bước ${step - 1}` : 'Quay lại'}
            onClick={step > 1 ? () => setStep(step - 1) : undefined}
            to="/"
          />
          <p className="eyebrow mt-6">Đặt lịch · Bước <span className="tnum">{step}</span>/4</p>
          <h1 key={step} className="animate-spring-in mt-2 font-display text-[2.1rem] font-medium leading-[1.05] text-slate-900 sm:text-[2.7rem]">
            {current.title} <em className="italic text-gold">{current.accent}</em>
          </h1>
        </div>
      </div>

      {/* Thanh bước: chấm số + nhãn, đường vàng chạy theo tiến độ (chỉ transform scaleX — GPU, không reflow) */}
      <div className="relative">
        <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[17px] h-px bg-slate-200">
          <div className="h-full origin-left bg-gold transition-transform duration-spring ease-spring"
               style={{ transform: `scaleX(${(step - 1) / (STEPS.length - 1)})` }} />
        </div>
        <ol className="relative grid grid-cols-4" aria-label="Các bước đặt lịch">
          {STEPS.map((s) => {
            const done = step > s.n;
            const active = step === s.n;
            const reachable = booking.canGoToStep(s.n);
            return (
              <li key={s.n} className="min-w-0">
                <button type="button" onClick={() => reachable && setStep(s.n)} disabled={!reachable} aria-current={active ? 'step' : undefined}
                        className={`group flex w-full flex-col items-center gap-2 text-[11px] font-medium sm:text-xs ${reachable ? '' : 'cursor-not-allowed'}`}>
                  <span className={`tnum flex h-[34px] w-[34px] items-center justify-center rounded-full border text-[13px] transition-[background-color,border-color,color,transform,box-shadow] duration-spring ease-spring
                    ${active ? 'scale-110 border-transparent bg-teal-700 text-white shadow-glow' : done ? 'border-gold/60 bg-canvas text-gold group-hover:scale-105' : 'border-slate-200 bg-canvas text-slate-400'}`}>
                    {done ? <Check size={15} strokeWidth={2.6} className="animate-spring-pop" /> : s.n}
                  </span>
                  <span className={`w-full truncate text-center ${active ? 'text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div key={step} className={`rounded-[24px] border border-slate-200/70 bg-white/40 p-4 shadow-card backdrop-blur-sm sm:p-6 ${stepMotion}`}>
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

      {/* "Dynamic Island": thanh tóm tắt kính mờ nổi — điện thoại bám ngay trên dock điều hướng, máy tính là viên thuốc dính đáy */}
      <div className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-h)+10px+env(safe-area-inset-bottom))] z-20 sm:sticky sm:inset-x-auto sm:bottom-5">
        <SplitBookingWarning quote={quote} className="mb-2" />
        <div className="glass glass-strong mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[22px] px-3.5 py-3 sm:flex-nowrap sm:rounded-full sm:py-2.5 sm:pl-6 sm:pr-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 leading-tight">
              <p className="tnum flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <Clock size={12} className="text-gold" /> {selected.length} dịch vụ · {formatDuration(totalDuration)}
                {time && <span className="hidden normal-case tracking-normal text-slate-700 sm:inline">· {time} {date.slice(8, 10)}/{date.slice(5, 7)}</span>}
              </p>
              <AnimatedNumber value={totalPrice} format={formatVnd} className="font-display text-[1.65rem] font-semibold leading-none text-slate-900" />
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {/* Bước 1 vẫn có đường lui về trang chủ cho khách lỡ bấm nhầm vào */}
            <Button variant="ghost" size="sm" className="rounded-full" icon={<ArrowLeft size={15} />}
                    onClick={() => (step > 1 ? setStep(step - 1) : navigate('/'))}>
              {step > 1 ? 'Quay lại' : 'Trang chủ'}
            </Button>
            {step < 4 ? (
              <Button size="sm" className="rounded-full px-5" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Tiếp tục <ArrowRight size={15} />
              </Button>
            ) : (
              <Button size="sm" className="sheen rounded-full px-5 shadow-glow" loading={submitting} onClick={submit}>
                Chốt lịch hẹn <Check size={15} />
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Nâng nút tư vấn lên trên thanh tóm tắt nổi trên điện thoại */}
      <CustomerAiAssistant liftPx={124} onBook={(services, date, time) => void applyServices(services.map((s) => s.id), date, time)} />
    </div>
  );
}
