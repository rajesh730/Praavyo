"use client";

import { Calendar as FaRegCalendarAlt, Check } from "lucide-react";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate, formatWeekday } from "@/lib/nepaliDate";

const OPTIONS = [
  { value: "BS", label: "नेपाली", detail: "बिक्रम संवत् (बि.सं.)", short: "बि.सं." },
  { value: "AD", label: "English", detail: "Gregorian (AD)", short: "AD" },
];

/**
 * The AD / BS date setting. Persists per user and updates every date on
 * screen. BS shows dates fully in Nepali (कात्तिक २०, २०८३, शुक्रबार); AD in
 * English.
 *
 * variant "cards" (Settings): two choices with a live preview of today.
 * variant "compact" (inline): a small segmented switch.
 */
export default function CalendarToggle({ withLabel = true, className = "", variant = "compact" }) {
  const { calendar, setCalendar } = useCalendarPreference();
  const today = new Date();

  if (variant === "cards") {
    return (
      <div role="radiogroup" aria-label="Date calendar" className={`grid gap-3 sm:grid-cols-2 ${className}`}>
        {OPTIONS.map((option) => {
          const active = calendar === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCalendar(option.value)}
              className={`relative flex items-start gap-3 rounded-card border p-4 text-left transition-colors ${
                active
                  ? "border-brand bg-brand-soft shadow-[var(--ring)]"
                  : "border-line-strong bg-surface hover:border-brand-line hover:bg-surface-2"
              }`}
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                  active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface"
                }`}
                aria-hidden
              >
                {active && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink" lang={option.value === "BS" ? "ne" : "en"}>{option.label}</span>
                <span className="block text-xs text-muted" lang={option.value === "BS" ? "ne" : "en"}>{option.detail}</span>
                <span
                  className="mt-2 block text-sm font-semibold text-brand-strong"
                  lang={option.value === "BS" ? "ne" : "en"}
                  suppressHydrationWarning
                >
                  {formatWeekday(today, option.value)}, {formatDate(today, option.value)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {withLabel && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          <FaRegCalendarAlt className="text-brand-strong" />
          Dates
        </span>
      )}
      <div className="tabs" role="radiogroup" aria-label="Date calendar">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={calendar === option.value}
            onClick={() => setCalendar(option.value)}
            title={option.detail}
            className={`tab ${calendar === option.value ? "is-active" : ""}`}
            lang={option.value === "BS" ? "ne" : "en"}
          >
            {option.value === "BS" ? option.label : option.short}
          </button>
        ))}
      </div>
    </div>
  );
}
