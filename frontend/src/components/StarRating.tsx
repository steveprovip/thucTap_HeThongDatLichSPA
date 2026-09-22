import { Star } from 'lucide-react';

export interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, size = 28, readOnly }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : 'radiogroup'} aria-label="Chấm điểm">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} sao`}
          aria-checked={value === n}
          role={readOnly ? undefined : 'radio'}
          className={`rounded-lg p-1 transition-transform ${readOnly ? 'cursor-default' : 'hover:scale-110'}`}
        >
          <Star
            size={size}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-brand-200'}
          />
        </button>
      ))}
    </div>
  );
}
