'use client';

import { useState } from 'react';
import { Download, ListFilter, Search } from 'lucide-react';
import PaginationControls from '@/components/PaginationControls';

/**
 * Presentation pieces for the teacher workspace, built from the same classes
 * the school admin dashboard uses (StudentManager, DashboardOverview,
 * EventFilterBar), so both dashboards look and filter the same way.
 */

const TONES = {
  brand: 'border-brand-line bg-brand-soft text-brand-strong',
  success: 'border-success-line bg-success-soft text-success',
  warning: 'border-warning-line bg-warning-soft text-warning',
  neutral: 'border-line bg-surface-2 text-muted',
};

/** The row of numbers at the top of a school screen. */
export function MetricGrid({ cards, className = '' }) {
  const columns = cards.length >= 5 ? 'xl:grid-cols-5' : cards.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 gap-3 ${columns} ${className}`}>
      {cards.map(({ label, value, note, icon: Icon, tone = 'brand', small = false }) => (
        <div key={label} className="rounded-card border border-line-strong bg-surface p-3 shadow-card">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-control border text-lg sm:flex ${TONES[tone] || TONES.brand}`}>
                <Icon aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0">
              {/* `small` for text values such as a date, which would not fit at number size. */}
              <strong className={`block font-semibold tabular-nums text-ink ${small ? 'py-1 text-base leading-6' : 'text-2xl'}`}>{value}</strong>
              <span className="block truncate text-sm font-semibold text-ink">{label}</span>
              {note && <span className="mt-1 block truncate text-xs font-semibold text-muted">{note}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Title row of a section card, as on the school overview. */
export function CardHeading({ icon: Icon, title, description, action, iconClassName = 'text-brand-strong' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm font-semibold text-muted">{description}</p>}
      </div>
      {action || (Icon && <Icon aria-hidden="true" className={`shrink-0 text-2xl ${iconClassName}`} />)}
    </div>
  );
}

/**
 * Underlined tabs with counts, as at the top of the school's event lists
 * (EventFilterBar). `tabs`: [{ key, label, icon, count, hint }].
 */
export function FilterTabs({ tabs, active, onChange, label }) {
  return (
    <div className="overflow-x-auto border-b border-line" role="tablist" aria-label={label}>
      <div className="flex min-w-max gap-0 px-2 sm:px-4">
        {tabs.map(({ key, label: tabLabel, icon: Icon, count, hint }) => {
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(key)}
              className={`relative inline-flex min-h-12 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold transition-colors sm:min-h-14 sm:px-5 ${
                selected
                  ? 'text-brand-strong after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:rounded-full after:bg-brand'
                  : 'text-ink hover:bg-surface-2'
              }`}
            >
              {Icon && <Icon aria-hidden="true" size={16} />}
              {tabLabel}
              {hint}
              {typeof count === 'number' && (
                <span className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold ${
                  selected ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-muted'
                }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The bordered filter bar: search first, then dropdowns, then buttons. */
export function FilterPanel({ children, columns = 'xl:grid-cols-[minmax(240px,1fr)_180px_180px_auto]' }) {
  return (
    <div className="rounded-card border border-line-strong bg-surface p-3 shadow-card">
      {/* Phones: fields full width, the buttons side by side underneath. */}
      <div className={`grid grid-cols-2 gap-3 max-sm:[&>*]:col-span-2 max-sm:[&>button]:col-span-1 ${columns}`}>{children}</div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoCorrect="off"
        spellCheck={false}
        className="input w-full pl-11 pr-4 transition-colors"
      />
    </label>
  );
}

/**
 * A filter dropdown. `options` are strings or { value, label }; "ALL" is the
 * no-filter value. Always shown, as on the school screens, so the bar keeps
 * its shape; with one choice it simply cannot narrow anything.
 */
export function SelectField({ label, value, onChange, options, allLabel, hideAll = false }) {
  return (
    <select className="input transition-colors" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      {/* `hideAll` for a required choice, e.g. the exam whose results are shown. */}
      {(!hideAll || options.length === 0) && <option value="ALL">{allLabel}</option>}
      {options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option;
        return <option key={item.value} value={item.value}>{item.label}</option>;
      })}
    </select>
  );
}

export function ClearFiltersButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
    >
      <ListFilter aria-hidden="true" size={16} />
      Clear Filters
    </button>
  );
}

export function ExportButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
    >
      <Download aria-hidden="true" size={16} />
      Export CSV
    </button>
  );
}

/** Table frame with the school's header style; the table itself is passed in. */
export function TableCard({ children, footer }) {
  return (
    <div className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
      {children}
      {footer}
    </div>
  );
}

export const TH = 'px-4 py-2.5';
export const THEAD = 'border-b border-line-strong bg-surface text-2xs uppercase text-muted';

export function Initials({ name, large = false }) {
  const letters = String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ST';
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-strong ${large ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'}`}>
      {letters}
    </span>
  );
}

/** A count line above a list, e.g. "Showing 12 of 40 students". */
export function ResultCount({ shown, total, noun }) {
  const word = total === 1 ? noun : `${noun}s`;
  return (
    <p className="text-xs font-semibold text-muted">
      {shown === total ? `${total} ${word}` : `Showing ${shown} of ${total} ${word}`}
    </p>
  );
}

/**
 * Client-side pages for a filtered list. Changing `resetKey` (the filters)
 * starts again from page 1.
 */
export function usePagedList(items, { pageSize = 15, resetKey = '' } = {}) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(state.key === resetKey ? state.page : 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  const pagination = (
    <div className="px-4 pb-3">
      <PaginationControls
        currentPage={page}
        totalPages={totalPages}
        onPageChange={(next) => setState({ key: resetKey, page: next })}
        totalItems={items.length}
        start={items.length ? startIndex + 1 : 0}
        end={startIndex + pageItems.length}
      />
    </div>
  );

  return { pageItems, pagination };
}

/** Save rows as a CSV file — only what is already on the teacher's screen. */
export function downloadCsv(fileName, headers, rows) {
  const cell = (value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // The BOM lets Excel read Nepali names correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
