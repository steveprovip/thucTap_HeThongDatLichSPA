import { SelectHTMLAttributes, forwardRef, useMemo } from 'react';

/** Mọi mốc 24 giờ cách nhau `step` phút: 00:00, 00:15, … 23:45. */
export const timeOptions24h = (step = 15): string[] => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
};

const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Nhóm theo buổi để danh sách 96 mốc dễ tìm. */
const PERIODS: { label: string; from: number; to: number }[] = [
  { label: 'Rạng sáng (00:00–05:45)', from: 0, to: 6 * 60 },
  { label: 'Buổi sáng (06:00–11:45)', from: 6 * 60, to: 12 * 60 },
  { label: 'Buổi chiều (12:00–17:45)', from: 12 * 60, to: 18 * 60 },
  { label: 'Buổi tối (18:00–23:45)', from: 18 * 60, to: 24 * 60 },
];

export interface TimeSelect24Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Bước nhảy (phút), mặc định 15. */
  step?: number;
  /** Chỉ cho chọn từ mốc này trở đi ('HH:mm', bao gồm). */
  min?: string;
  /** Chỉ cho chọn tới mốc này ('HH:mm', bao gồm). */
  max?: string;
  invalid?: boolean;
}

/**
 * Mentor Sprint 2 · mục 3 — bộ chọn giờ 24 giờ, KHÔNG phụ thuộc định dạng SA/CH của trình duyệt / hệ điều hành
 * (ô <input type="time"> trên Windows tiếng Anh hiện 09:00 AM gây nhầm ca tối). 00:00 → 23:45, bước 15 phút.
 */
export const TimeSelect24 = forwardRef<HTMLSelectElement, TimeSelect24Props>(
  ({ value, onChange, step = 15, min, max, invalid, className = '', ...rest }, ref) => {
    const options = useMemo(() => timeOptions24h(step), [step]);
    const lo = min ? toMinutes(min) : 0;
    const hi = max ? toMinutes(max) : 24 * 60;
    const current = value?.slice(0, 5) ?? '';
    // Giá trị đang lưu không nằm trên lưới (vd. 09:07 nhập từ trước) vẫn hiện đúng thay vì nhảy sang mốc khác
    const offGrid = current && !options.includes(current);
    return (
      <select
        ref={ref}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={`field-input pr-8 tabular-nums ${invalid ? 'border-red-400' : ''} ${className}`}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {offGrid && <option value={current}>{current}</option>}
        {PERIODS.map((p) => {
          const inPeriod = options.filter((o) => {
            const m = toMinutes(o);
            return m >= p.from && m < p.to;
          });
          return (
            <optgroup key={p.label} label={p.label}>
              {inPeriod.map((o) => {
                const m = toMinutes(o);
                return <option key={o} value={o} disabled={m < lo || m > hi}>{o}</option>;
              })}
            </optgroup>
          );
        })}
      </select>
    );
  },
);
TimeSelect24.displayName = 'TimeSelect24';
