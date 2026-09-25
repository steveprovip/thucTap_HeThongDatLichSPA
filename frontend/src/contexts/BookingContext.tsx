import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
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
  clearServices: () => void;
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
const draft = (): { selected?: PublicService[]; date?: string; time?: string; stylistId?: string | null; customer?: BookingCustomer } => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<PublicService[]>(() => draft().selected ?? []);
  const [date, setDate] = useState(() => draft().date ?? '');
  const [time, setTime] = useState(() => draft().time ?? '');
  const [stylistId, setStylistId] = useState<string | null>(() => draft().stylistId ?? null);
  const [customer, setCustomerState] = useState<BookingCustomer>(() => draft().customer ?? EMPTY_CUSTOMER);

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

  const totalDuration = useMemo(
    () => selected.reduce((sum, s) => sum + s.durationMinutes, 0),
    [selected],
  );
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
      step, setStep, selected, toggleService, clearServices: () => setSelected([]),
      totalDuration, totalPrice, estimatedEndTime, date, setDate, time, setTime,
      stylistId, setStylistId, customer, setCustomer, reset, canGoToStep,
    }),
    [step, selected, toggleService, totalDuration, totalPrice, estimatedEndTime, date, time, stylistId, customer, setCustomer, reset, canGoToStep],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking phải nằm trong BookingProvider');
  return ctx;
}
