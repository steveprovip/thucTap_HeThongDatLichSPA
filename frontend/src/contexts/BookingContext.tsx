import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
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

export function BookingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<PublicService[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [customer, setCustomerState] = useState<BookingCustomer>(EMPTY_CUSTOMER);

  const toggleService = useCallback(
    (service: PublicService) => {
      let result: { ok: boolean; reason?: string } = { ok: true };
      setSelected((list) => {
        const exists = list.some((s) => s.id === service.id);
        if (exists) return list.filter((s) => s.id !== service.id);
        if (list.length >= MAX_SERVICES_PER_BOOKING) {
          result = { ok: false, reason: `Mỗi lượt đặt chỉ được chọn tối đa ${MAX_SERVICES_PER_BOOKING} dịch vụ` };
          return list;
        }
        return [...list, service];
      });
      // Đổi dịch vụ thì khung giờ đã chọn không còn hợp lệ
      setTime('');
      return result;
    },
    [],
  );

  const totalDuration = useMemo(
    () => selected.reduce((sum, s) => sum + s.durationMinutes, 0),
    [selected],
  );
  const totalPrice = useMemo(() => selected.reduce((sum, s) => sum + s.price, 0), [selected]);

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
      totalDuration, totalPrice, date, setDate, time, setTime,
      stylistId, setStylistId, customer, setCustomer, reset, canGoToStep,
    }),
    [step, selected, toggleService, totalDuration, totalPrice, date, time, stylistId, customer, setCustomer, reset, canGoToStep],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking phải nằm trong BookingProvider');
  return ctx;
}
