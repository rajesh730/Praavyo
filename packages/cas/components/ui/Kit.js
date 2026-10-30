'use client';

import { TriangleAlert as FaExclamationTriangle, Inbox as FaInbox } from 'lucide-react';

/**
 * Small shared primitives, styled with the Pravyo design tokens so CAS screens
 * match the main dashboard without importing its component tree.
 */

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="eyebrow mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className = '' }) {
  return (
    <section className={`card mb-[var(--section-gap)] p-[var(--card-pad)] ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}) {
  const base = 'btn';
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, children, required = false }) {
  return (
    <label className="mb-3 block">
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

// Controls take their look from the shared form styles in globals.css.
const CONTROL = 'w-full';

export function Input({ className = '', ...rest }) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${CONTROL} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/**
 * What each achievement level means.
 *
 * These are levels, not grades. Keeping the words next to the number stops the
 * 1-4 scale being read as a mark out of four.
 */
export const LEVEL_LABELS = {
  1: 'Below Basic',
  2: 'Basic',
  3: 'Proficient',
  4: 'Advanced',
};

/**
 * The Nepali terms are the ones printed in the Grade 3 evaluation record
 * (विद्यार्थीको सिकाइ उपलब्धि स्तर र त्यसको सामान्य व्याख्या) — कमजोर / सामान्य /
 * राम्रो / उच्च — not a translation of the English. A school reading the Nepali
 * report should see the same words as the workbook it already uses.
 */
export const LEVEL_LABELS_NE = {
  1: 'कमजोर',
  2: 'सामान्य',
  3: 'राम्रो',
  4: 'उच्च',
};

/** The 1-4 key, shown beside any sheet where levels are recorded. */
export function LevelLegend({ lang = 'en' }) {
  const labels = lang === 'ne' ? LEVEL_LABELS_NE : LEVEL_LABELS;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {[1, 2, 3, 4].map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span className={`cas-level cas-level-${level} cas-level-sm`}>{level}</span>
          <span className={`text-2xs text-muted ${lang === 'ne' ? 'cas-ne' : ''}`}>
            {labels[level]}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Achievement level 1-4. Never rendered as a letter grade or a percentage. */
export function LevelChip({ level, size = '' }) {
  if (!level) {
    return <span className={`cas-level cas-level-none ${size}`} title="Not yet assessed">—</span>;
  }
  return (
    <span className={`cas-level cas-level-${level} ${size}`} title={`Level ${level}`}>
      {level}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'badge-neutral',
    info: 'badge-brand',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
  };
  return (
    <span
      className={`badge ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = 'warning', children }) {
  if (!children) return null;
  const tones = {
    warning: 'border-warning-line bg-warning-soft [&>svg]:text-warning',
    danger: 'border-danger-line bg-danger-soft [&>svg]:text-danger',
    success: 'border-success-line bg-success-soft [&>svg]:text-success',
    info: 'border-brand-line bg-brand-soft [&>svg]:text-brand',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`mb-4 flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 text-sm text-body ${tones[tone]}`}
    >
      {tone !== 'success' && (
        <FaExclamationTriangle className="mt-0.5 shrink-0 text-base" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon = FaInbox }) {
  return (
    <div className="empty-state px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-xl text-subtle ring-1 ring-line">
        <Icon />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
      <span
        className="spinner text-brand"
        aria-hidden
      />
      {label}
    </div>
  );
}

/**
 * Responsive table.
 *
 * On a phone a five-column table is unusable either way — horizontal scrolling
 * hides the columns that matter, and squeezing them makes every cell two
 * characters wide. So below the `sm` breakpoint each row collapses into a
 * stacked card labelled by `cas-table` in globals.css, and from `sm` up it is a
 * normal table. Wide content still scrolls rather than pushing the page.
 */
export function TableWrap({ children, minWidth = '36rem' }) {
  return (
    <div className="cas-table-scroll sm:rounded-card sm:border sm:border-line sm:bg-surface">
      <table
        className="cas-table w-full border-collapse text-left text-sm"
        style={{ '--cas-table-min': minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th
      className={className || undefined}
    >
      {children}
    </th>
  );
}

/**
 * `label` is echoed as the field name in the stacked mobile layout, where the
 * header row is hidden. Without it a cell on a phone is a value with nothing
 * saying what it is.
 */
export function Td({ children, className = '', label, colSpan }) {
  return (
    <td
      data-label={label}
      colSpan={colSpan}
      className={`align-top ${className}`}
    >
      {children}
    </td>
  );
}

