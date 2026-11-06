'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { formatDate, formatWeekday, normalizeCalendar } from '@pravyo/core/nepaliDate';
import NepaliCalendar, { dateOfIso } from './NepaliCalendar.js';

/**
 * A date field that opens the school's calendar (see NepaliCalendar).
 *
 * The value is an AD day, "YYYY-MM-DD" — what <input type="date"> gives — so
 * it saves exactly as before; only what the person sees follows their AD/BS
 * setting: "शुक्रबार, कात्तिक २०, २०८३" or "Friday, Nov 6, 2026".
 */
export default function DatePickerField({
  value = '',
  onChange,
  calendar,
  min = '',
  max = '',
  placeholder,
  clearable = true,
  id,
  disabled = false,
  'aria-label': ariaLabel,
  align = 'left',
}) {
  const system = normalizeCalendar(calendar);
  const nepali = system === 'BS';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const date = dateOfIso(value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[var(--control-h)] w-full items-center gap-2 rounded-control border bg-surface px-3 text-left text-base transition-colors disabled:bg-surface-2 disabled:text-muted ${
          open ? 'border-brand shadow-[var(--ring)]' : 'border-line-strong hover:border-[#b8c3d3]'
        }`}
      >
        <CalendarDays className="shrink-0 text-brand" aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${date ? 'text-ink' : 'text-subtle'}`} lang={nepali && date ? 'ne' : undefined}>
          {date
            ? `${formatWeekday(date, system)}, ${formatDate(date, system)}`
            : placeholder || (nepali ? 'मिति छान्नुहोस्' : 'Choose a date')}
        </span>
        {clearable && date && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label={nepali ? 'मिति हटाउनुहोस्' : 'Clear date'}
            onClick={(event) => { event.stopPropagation(); onChange?.(''); setOpen(false); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onChange?.(''); }
            }}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={nepali ? 'क्यालेन्डर' : 'Calendar'}
          className={`card absolute top-full z-40 mt-1.5 w-[19.5rem] max-w-[calc(100vw-2rem)] p-3 shadow-[var(--shadow-pop)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <NepaliCalendar
            value={value}
            calendar={system}
            min={min}
            max={max}
            onChange={(iso) => { onChange?.(iso); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
