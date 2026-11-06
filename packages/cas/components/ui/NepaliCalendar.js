'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BS_MONTHS_EN,
  BS_MONTHS_NE,
  WEEKDAYS_NE,
  WEEKDAYS_NE_SHORT,
  bsMonthLayout,
  bsParts,
  formatDate,
  formatWeekday,
  normalizeCalendar,
  parseBsNumeric,
  toNepaliDigits,
} from '@pravyo/core/nepaliDate';

/**
 * One month of the school's calendar, for picking a day.
 *
 * BS (the "Nepali" setting) is fully Nepali, the way a wall calendar reads:
 * बैशाख…चैत, आइत…शनि, Devanagari digits, with the matching English day in
 * the corner of each cell. AD is fully English, with the BS day in the corner.
 * In both, Saturday — the weekly holiday — is red, today is ringed and the
 * chosen day is filled.
 *
 * Values are AD calendar days as "YYYY-MM-DD", the same as <input type="date">,
 * so a screen can switch to this without changing what it saves.
 */

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AD_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value) => String(value).padStart(2, '0');

export function isoOfDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-11-06" → a local Date at midday (midday avoids DST/zone edge days). */
export function dateOfIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function viewOf(iso, calendar) {
  const date = dateOfIso(iso) || new Date();
  if (calendar === 'BS') {
    const parts = bsParts(date);
    if (parts) return { year: parts.year, month: parts.month };
  }
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Cells for the month on view: each has its AD iso, main and corner numbers. */
function monthOf(view, calendar) {
  if (calendar === 'BS') {
    const layout = bsMonthLayout(view.year, view.month);
    if (!layout) return null;
    const cells = Array.from({ length: layout.days }, (_, index) => {
      const day = index + 1;
      const ad = parseBsNumeric(`${view.year}/${pad(view.month + 1)}/${pad(day)}`)?.ad;
      const date = ad ? new Date(ad.getFullYear(), ad.getMonth(), ad.getDate(), 12) : null;
      return date && { iso: isoOfDate(date), main: toNepaliDigits(day), corner: String(date.getDate()), weekday: date.getDay() };
    }).filter(Boolean);
    const first = dateOfIso(cells[0]?.iso);
    const last = dateOfIso(cells.at(-1)?.iso);
    // The English months the BS month spans, e.g. "Oct – Nov 2026".
    const span = first && last
      ? first.getMonth() === last.getMonth()
        ? `${AD_MONTHS_SHORT[first.getMonth()]} ${first.getFullYear()}`
        : `${AD_MONTHS_SHORT[first.getMonth()]}${first.getFullYear() === last.getFullYear() ? '' : ` ${first.getFullYear()}`} – ${AD_MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`
      : '';
    return {
      title: `${BS_MONTHS_NE[view.month]} ${toNepaliDigits(view.year)}`,
      subtitle: span,
      firstWeekday: layout.firstWeekday,
      cells,
    };
  }

  const first = new Date(view.year, view.month, 1, 12);
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const cells = Array.from({ length: days }, (_, index) => {
    const date = new Date(view.year, view.month, index + 1, 12);
    const bs = bsParts(date);
    return { iso: isoOfDate(date), main: String(index + 1), corner: bs ? String(bs.day) : '', weekday: date.getDay() };
  });
  const startBs = bsParts(first);
  const endBs = bsParts(new Date(view.year, view.month, days, 12));
  const span = startBs && endBs
    ? startBs.month === endBs.month
      ? `${BS_MONTHS_EN[startBs.month]} ${startBs.year}`
      : `${BS_MONTHS_EN[startBs.month]} – ${BS_MONTHS_EN[endBs.month]} ${endBs.year}`
    : '';
  return {
    title: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    subtitle: span,
    firstWeekday: first.getDay(),
    cells,
  };
}

export default function NepaliCalendar({ value = '', onChange, calendar, min = '', max = '', className = '' }) {
  const system = normalizeCalendar(calendar);
  const nepali = system === 'BS';
  const [view, setView] = useState(() => viewOf(value, system));
  const month = monthOf(view, system);
  const today = isoOfDate(new Date());
  const todayDate = dateOfIso(today);

  function step(delta) {
    setView(({ year, month: index }) => {
      const next = index + delta;
      return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
    });
  }

  const outOfRange = (iso) => (min && iso < min) || (max && iso > max);

  return (
    <div className={`w-full select-none ${className}`} lang={nepali ? 'ne' : 'en'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" className="btn-icon btn-ghost btn-sm" aria-label={nepali ? 'अघिल्लो महिना' : 'Previous month'} onClick={() => step(-1)}>
          <ChevronLeft aria-hidden />
        </button>
        <div className="min-w-0 text-center leading-tight">
          <p className="text-base font-semibold text-ink">{month?.title || (nepali ? 'समर्थित दायराबाहिर' : 'Outside the supported range')}</p>
          {month?.subtitle && <p className="text-2xs font-medium text-muted">{month.subtitle}</p>}
        </div>
        <button type="button" className="btn-icon btn-ghost btn-sm" aria-label={nepali ? 'अर्को महिना' : 'Next month'} onClick={() => step(1)}>
          <ChevronRight aria-hidden />
        </button>
      </div>

      {month && (
        <div className="grid grid-cols-7 gap-1 text-center" role="grid">
          {(nepali ? WEEKDAYS_NE_SHORT : WEEKDAYS_EN).map((label, index) => (
            <span
              key={label}
              role="columnheader"
              title={nepali ? WEEKDAYS_NE[index] : undefined}
              className={`pb-1 text-2xs font-semibold ${index === 6 ? 'text-danger' : 'text-muted'}`}
            >
              {label}
            </span>
          ))}
          {Array.from({ length: month.firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden />)}
          {month.cells.map((cell) => {
            const selected = cell.iso === value;
            const isToday = cell.iso === today;
            const holiday = cell.weekday === 6;
            const disabled = outOfRange(cell.iso);
            const label = `${formatWeekday(dateOfIso(cell.iso), system)}, ${formatDate(dateOfIso(cell.iso), system)}`;
            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                disabled={disabled}
                aria-selected={selected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={label}
                title={label}
                onClick={() => onChange?.(cell.iso)}
                className={`relative flex h-10 items-center justify-center rounded-control text-sm tabular-nums transition-colors disabled:opacity-35 ${
                  selected
                    ? 'bg-brand font-semibold text-white shadow-sm'
                    : isToday
                      ? `bg-brand-soft font-semibold ring-2 ring-brand ring-inset ${holiday ? 'text-danger' : 'text-brand-strong'}`
                      : `hover:bg-surface-2 ${holiday ? 'font-medium text-danger' : 'text-ink'}`
                }`}
              >
                <span className="text-[0.95rem] leading-none">{cell.main}</span>
                {cell.corner && (
                  <span className={`absolute right-1 top-0.5 text-[0.5625rem] leading-none ${selected ? 'text-white/80' : 'text-subtle'}`}>
                    {cell.corner}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span className="min-w-0 truncate text-muted">
          {nepali ? 'आज' : 'Today'}: <span className="font-semibold text-ink">{formatWeekday(todayDate, system)}, {formatDate(todayDate, system)}</span>
        </span>
        <button
          type="button"
          className="shrink-0 font-semibold text-brand hover:underline disabled:opacity-40"
          disabled={outOfRange(today)}
          onClick={() => { setView(viewOf(today, system)); onChange?.(today); }}
        >
          {nepali ? 'आज छान्नुहोस्' : 'Pick today'}
        </button>
      </div>
    </div>
  );
}
