'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar as FaCalendar, ChevronLeft as FaChevronLeft, ChevronRight as FaChevronRight } from 'lucide-react';
import {
  adDayToBsNumeric,
  bsMonthLayout,
  formatAdDate,
  normalizeCalendar,
  parseBsNumeric,
  todayBsNumeric,
} from '@pravyo/core/nepaliDate';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAYS_NE = ['आ', 'सो', 'मं', 'बु', 'बि', 'शु', 'श'];
const pad = (value) => String(value).padStart(2, '0');

/** The month a picker opens on: the chosen date's, else today's. */
function startView(value, calendar) {
  const parsed = parseBsNumeric(value) || parseBsNumeric(todayBsNumeric());
  if (calendar === 'AD') return { year: parsed.ad.getFullYear(), month: parsed.ad.getMonth() };
  const [year, month] = parsed.bs.split('/').map(Number);
  return { year, month: month - 1 };
}

function monthOf(view, calendar, t) {
  if (calendar === 'AD') {
    const first = new Date(view.year, view.month, 1);
    return {
      title: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      firstWeekday: first.getDay(),
      days: new Date(view.year, view.month + 1, 0).getDate(),
      bsOf: (day) => adDayToBsNumeric(view.year, view.month, day),
    };
  }
  const layout = bsMonthLayout(view.year, view.month);
  if (!layout) return null;
  return {
    title: `${t(layout.name, layout.nameNe)} ${view.year}`,
    firstWeekday: layout.firstWeekday,
    days: layout.days,
    bsOf: (day) => `${view.year}/${pad(view.month + 1)}/${pad(day)}`,
  };
}

/**
 * A B.S. issue date: typed as YYYY/MM/DD, or picked from a calendar in the
 * school's chosen calendar setting. Whichever calendar is shown, the value
 * stays numeric B.S., since that is what the report card prints.
 */
export default function IssueDateInput({ value, onChange, calendar, t, ...rest }) {
  const system = normalizeCalendar(calendar);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startView(value, system));
  const wrapRef = useRef(null);
  const selected = parseBsNumeric(value)?.bs || '';
  const today = todayBsNumeric();
  const month = open ? monthOf(view, system, t) : null;

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

  function toggle() {
    if (!open) setView(startView(value, system));
    setOpen(!open);
  }

  function step(delta) {
    setView(({ year, month: index }) => {
      const next = index + delta;
      return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
    });
  }

  function pick(day) {
    onChange(month.bsOf(day));
    setOpen(false);
  }

  const adHint = system === 'AD' && selected ? formatAdDate(parseBsNumeric(selected).ad) : '';

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
        onClick={toggle}
      >
        <FaCalendar aria-hidden className="h-4 w-4" />
      </button>
      {adHint && <span className="mt-1 block text-xs text-muted">{adHint}</span>}

      {open && (
        <span
          role="dialog"
          aria-label={t('Issue date calendar', 'जारी मिति क्यालेन्डर')}
          className="card absolute right-0 top-full z-30 mt-1 block w-72 p-3 shadow-[var(--shadow-pop)]"
        >
          <span className="mb-2 flex items-center justify-between gap-2">
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={t('Previous month', 'अघिल्लो महिना')} onClick={() => step(-1)}>
              <FaChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-ink">
              {month?.title || t('Outside the supported range', 'समर्थित दायराबाहिर')}
            </span>
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={t('Next month', 'अर्को महिना')} onClick={() => step(1)}>
              <FaChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </span>
          {month && (
            <span className="grid grid-cols-7 gap-0.5 text-center">
              {(system === 'BS' ? WEEKDAYS_NE : WEEKDAYS).map((day, index) => (
                <span key={day} className={`py-1 text-xs font-semibold ${index === 6 ? 'text-danger' : 'text-muted'}`}>{system === 'BS' ? t(WEEKDAYS[index], day) : day}</span>
              ))}
              {Array.from({ length: month.firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
              {Array.from({ length: month.days }, (_, index) => {
                const day = index + 1;
                const bs = month.bsOf(day);
                const isSelected = bs === selected;
                const isToday = bs === today;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`h-8 rounded-md text-sm tabular-nums ${
                      isSelected
                        ? 'bg-brand font-semibold text-white'
                        : `hover:bg-surface-2 ${isToday ? 'font-semibold text-brand ring-1 ring-brand' : 'text-ink'}`
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => pick(day)}
                  >
                    {day}
                  </button>
                );
              })}
            </span>
          )}
          <span className="mt-2 flex justify-between border-t border-line pt-2 text-xs text-muted">
            <span>{system === 'BS' ? t('Bikram Sambat (B.S.)', 'विक्रम संवत्') : t('Gregorian (A.D.)', 'ईस्वी संवत्')}</span>
            <button type="button" className="font-semibold text-brand hover:underline" onClick={() => { onChange(today); setOpen(false); }}>
              {t('Today', 'आज')}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
