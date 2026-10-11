import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import type { PublicService } from '@/types';
import { MAX_SERVICES_PER_BOOKING } from '@/utils/constants';

export interface BookingCustomer {
  fullName: string;
  phone: string;
  email: string;
  note: string;
}

interface BookingContextValue {
  step: number;
  setStep: (n: number) => void;
  selected: PublicService[];
  toggleService: (service: PublicService) => { ok: boolean; reason?: string };
  /** Đối chiếu giỏ với danh mục đang bán: bỏ dịch vụ không còn, làm mới giá và thời lượng. */
  syncServices: (catalog: PublicService[]) => void;
  clearServices: () => void;
  /** TASK v3 · NV1: trợ lý tư vấn điền sẵn giỏ dịch vụ (thay giỏ cũ, bỏ giờ đã chọn vì tổng thời lượng đổi). */
  replaceServices: (services: PublicService[]) => void;
  totalDuration: number;
  totalPrice: number;
  estimatedEndTime: string | null;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  stylistId: string | null;
  setStylistId: (id: string | null) => void;
  customer: BookingCustomer;
  setCustomer: (c: Partial<BookingCustomer>) => void;
  reset: () => void;
  canGoToStep: (n: number) => boolean;
}

const BookingContext = createContext<BookingContextValue | null>(null);

const EMPTY_CUSTOMER: BookingCustomer = { fullName: '', phone: '', email: '', note: '' };
const STORAGE_KEY = 'salon.bookingDraft';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const minutesOf = (list: PublicService[]) => list.reduce((sum, s) => sum + s.durationMinutes, 0);

/**
 * Nạp lại bản nháp nhưng chỉ giữ phần còn đúng cấu trúc: bản nháp cũ/hỏng (vd. lưu từ bản Demo hay phiên bản khác)
 * từng làm giỏ "kẹt" 5/5 dịch vụ dù màn hình chỉ tick 2 dịch vụ.
 */
const draft = (): { selected: PublicService[]; date: string; time: string; stylistId: string | null; customer: BookingCustomer } => {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') ?? {}; } catch { /* bản nháp hỏng: coi như chưa có */ }
  const seen = new Set<string>();
  const selected = (Array.isArray(raw.selected) ? raw.selected : [])
    .filter((s): s is PublicService => !!s && typeof s.id === 'string' && typeof s.durationMinutes === 'number'
      && typeof s.price === 'number' && !seen.has(s.id) && !!seen.add(s.id))
    .slice(0, MAX_SERVICES_PER_BOOKING);
  const c = (raw.customer && typeof raw.customer === 'object' ? raw.customer : {}) as Record<string, unknown>;
  return {
    selected,
    date: DATE_RE.test(text(raw.date)) ? text(raw.date) : '',
    time: TIME_RE.test(text(raw.time)) ? text(raw.time) : '',
    stylistId: text(raw.stylistId) || null,
    customer: { fullName: text(c.fullName), phone: text(c.phone), email: text(c.email), note: text(c.note) },
  };
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(1);
  const [initial] = useState(draft);
  const [selected, setSelected] = useState<PublicService[]>(initial.selected);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [stylistId, setStylistId] = useState<string | null>(initial.stylistId);
  const [customer, setCustomerState] = useState<BookingCustomer>(initial.customer);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, date, time, stylistId, customer }));
  }, [selected, date, time, stylistId, customer]);

  const toggleService = useCallback(
    (service: PublicService) => {
      const exists = selected.some(s => s.id === service.id);
      if (!exists && selected.length >= MAX_SERVICES_PER_BOOKING)
        return { ok: false, reason: `Mỗi lượt đặt chỉ được chọn tối đa ${MAX_SERVICES_PER_BOOKING} dịch vụ` };
      setSelected(exists ? selected.filter(s => s.id !== service.id) : [...selected, service]);
      // Đổi dịch vụ thì khung giờ đã chọn không còn hợp lệ
      setTime('');
      return { ok: true };
    },
    [selected],
  );

  const syncServices = useCallback((catalog: PublicService[]) => {
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const current = selectedRef.current;
    const next = current.flatMap((s) => byId.get(s.id) ?? []);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    if (minutesOf(next) !== minutesOf(current)) setTime(''); // tổng thời lượng đổi thì khung giờ đã chọn hết hiệu lực
    setSelected(next);
  }, []);

  const totalDuration = useMemo(() => minutesOf(selected), [selected]);
  const totalPrice = useMemo(() => selected.reduce((sum, s) => sum + s.price, 0), [selected]);
  const estimatedEndTime = useMemo(() => {
    if (!time || !totalDuration) return null;
    const [hours, minutes] = time.split(':').map(Number);
    const end = hours * 60 + minutes + totalDuration;
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }, [time, totalDuration]);

  const setCustomer = useCallback((patch: Partial<BookingCustomer>) => {
    setCustomerState((c) => ({ ...c, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setStep(1);
    setSelected([]);
    setDate('');
    setTime('');
    setStylistId(null);
    setCustomerState(EMPTY_CUSTOMER);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const canGoToStep = useCallback(
    (n: number) => {
      if (n <= 1) return true;
      if (n === 2) return selected.length > 0;
      if (n === 3) return selected.length > 0 && !!date && !!time;
      if (n === 4) return selected.length > 0 && !!date && !!time;
      return false;
    },
    [selected.length, date, time],
  );

  const value = useMemo<BookingContextValue>(
    () => ({
      step, setStep, selected, toggleService, syncServices, clearServices: () => setSelected([]),
      replaceServices: (list: PublicService[]) => { setSelected(list.slice(0, MAX_SERVICES_PER_BOOKING)); setTime(''); },
      totalDuration, totalPrice, estimatedEndTime, date, setDate, time, setTime,
      stylistId, setStylistId, customer, setCustomer, reset, canGoToStep,
    }),
    [step, selected, toggleService, syncServices, totalDuration, totalPrice, estimatedEndTime, date, time, stylistId, customer, setCustomer, reset, canGoToStep],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking phải nằm trong BookingProvider');
  return ctx;
}
