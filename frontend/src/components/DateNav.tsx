import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysISO, formatWeekdayDate, todayISO } from '@/utils/format';

export function DateNav({ value, onChange, className = '' }: {
  value: string; onChange: (d: string) => void; className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button className="btn btn-outline btn-sm" onClick={() => onChange(addDaysISO(value, -1))}
              aria-label="Ngày hôm trước">
        <ChevronLeft size={16} /> Hôm trước
      </button>
      <div className="relative flex items-center">
        <CalendarDays size={16} className="pointer-events-none absolute left-3 text-ink-muted" />
        <input
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="field-input min-h-[44px] pl-9 sm:min-h-[36px]"
          aria-label="Chọn ngày"
        />
      </div>
      <button className="btn btn-outline btn-sm" onClick={() => onChange(addDaysISO(value, 1))}
              aria-label="Ngày hôm sau">
        Hôm sau <ChevronRight size={16} />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(todayISO())}>Hôm nay</button>
      <span className="text-sm font-semibold text-ink">{formatWeekdayDate(`${value}T00:00:00+07:00`)}</span>
    </div>
  );
}
