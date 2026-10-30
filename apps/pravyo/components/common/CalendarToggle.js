"use client";

import { Calendar as FaRegCalendarAlt } from "lucide-react";
import useCalendarPreference from "@/lib/client/useCalendarPreference";

// Compact AD / BS switch. Persists per-user and updates every date on screen.
export default function CalendarToggle({ withLabel = true, className = "" }) {
  const { calendar, setCalendar } = useCalendarPreference();

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {withLabel && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          <FaRegCalendarAlt className="text-brand-strong" />
          Dates
        </span>
      )}
      <div className="card inline-flex items-center gap-0.5 p-0.5">
        {[
          ["AD", "AD"],
          ["BS", "BS"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCalendar(value)}
            aria-pressed={calendar === value}
            title={value === "BS" ? "Bikram Sambat (Nepali)" : "Gregorian (English)"}
            className={`btn btn-ghost btn-sm transition-colors ${
              calendar === value
                ? "bg-brand text-white"
                : "text-muted hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
