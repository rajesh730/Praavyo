'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const date = dateOfIso(value);

  // The calendar is rendered on <body> with fixed positioning, so a card or
  // modal with overflow:hidden around the field can never cut it off. It sits
  // under the field, or above it when there is not enough room below.
  const place = useCallback(() => {
    const field = wrapRef.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!field || !pop) return;
    const gap = 6;
    const margin = 8;
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const below = window.innerHeight - field.bottom - gap - margin;
    const above = field.top - gap - margin;
    const top = below >= height || below >= above
      ? Math.min(field.bottom + gap, Math.max(margin, window.innerHeight - height - margin))
      : Math.max(margin, field.top - gap - height);
    const wanted = align === 'right' ? field.right - width : field.left;
    const left = Math.min(Math.max(margin, wanted), Math.max(margin, window.innerWidth - width - margin));
    setPos({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') setOpen(false);
        return;
      }
      if (!wrapRef.current?.contains(event.target) && !popRef.current?.contains(event.target)) setOpen(false);
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

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={nepali ? 'क्यालेन्डर' : 'Calendar'}
          className="card fixed w-[19.5rem] max-w-[calc(100vw-1rem)] p-3 shadow-[var(--shadow-pop)]"
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            zIndex: 1000,
            // Measured first, shown once placed — no flash in the corner.
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <NepaliCalendar
            value={value}
            calendar={system}
            min={min}
            max={max}
            onChange={(iso) => { onChange?.(iso); setOpen(false); }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
