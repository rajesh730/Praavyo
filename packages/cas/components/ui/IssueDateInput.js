'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar as FaCalendar } from 'lucide-react';
import { formatAdDate, formatBsDate, formatBsNumeric, normalizeCalendar, parseBsNumeric } from '@pravyo/core/nepaliDate';
import NepaliCalendar, { dateOfIso, isoOfDate } from './NepaliCalendar.js';

/**
 * A B.S. issue date: typed as YYYY/MM/DD, or picked from the school's
 * calendar (fully Nepali under the BS setting, English under AD). Whichever
 * calendar is shown, the value stays numeric B.S. in ASCII digits, since that
 * is what the report card prints.
 */
export default function IssueDateInput({ value, onChange, calendar, t, ...rest }) {
  const system = normalizeCalendar(calendar);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const parsed = parseBsNumeric(value);
  const ad = parsed ? new Date(parsed.ad.getFullYear(), parsed.ad.getMonth(), parsed.ad.getDate(), 12) : null;
  const selectedIso = ad ? isoOfDate(ad) : '';

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

  // Under the typed numbers, the date in words in the viewer's calendar.
  const hint = ad ? (system === 'BS' ? formatBsDate(ad) : formatAdDate(ad)) : '';

  return (
    <span ref={wrapRef} className="relative block">
      <input
        className="w-full"
        style={{ paddingRight: '2.5rem' }}
        inputMode="numeric"
        maxLength={10}
        placeholder="2083/06/08"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        aria-label={t('Choose issue date from calendar', 'क्यालेन्डरबाट जारी मिति छान्नुहोस्')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FaCalendar aria-hidden className="h-4 w-4" />
      </button>
      {hint && <span className="mt-1 block text-xs text-muted" lang={system === 'BS' ? 'ne' : undefined}>{hint}</span>}

      {open && (
        <span
          role="dialog"
          aria-label={t('Issue date calendar', 'जारी मिति क्यालेन्डर')}
          className="card absolute right-0 top-full z-30 mt-1 block w-[19.5rem] max-w-[calc(100vw-2rem)] p-3 shadow-[var(--shadow-pop)]"
        >
          <NepaliCalendar
            value={selectedIso}
            calendar={system}
            onChange={(iso) => {
              onChange(formatBsNumeric(dateOfIso(iso)));
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}
