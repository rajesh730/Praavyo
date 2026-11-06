"use client";

import { dateTileParts, formatDate, formatWeekday, normalizeCalendar } from "@/lib/nepaliDate";
import useCalendarPreference from "@/lib/client/useCalendarPreference";

/**
 * A highlighted date block, like a tear-off calendar leaf: the month across
 * the top and the day large beneath it. Follows the viewer's AD/BS setting —
 * under BS it is fully Nepali ("कात्तिक" over "२०").
 *
 * tone: "brand" (default), "danger" (urgent), "muted" (draft / not sent).
 */
const TONES = {
  brand: { band: "bg-brand text-white", body: "border-brand-line text-brand-strong" },
  danger: { band: "bg-danger text-white", body: "border-danger-line text-danger" },
  muted: { band: "bg-line-strong text-body", body: "border-line-strong border-dashed text-muted" },
};

export default function DateTile({ value, calendar, tone = "brand", size = "md", className = "" }) {
  const { calendar: preferred } = useCalendarPreference();
  const system = normalizeCalendar(calendar || preferred);
  const parts = dateTileParts(value, system);
  if (!parts) return null;
  const colors = TONES[tone] || TONES.brand;
  const large = size === "lg";

  return (
    <time
      dateTime={new Date(value).toISOString()}
      title={`${formatWeekday(value, system)}, ${formatDate(value, system)}`}
      lang={system === "BS" ? "ne" : "en"}
      // self-start: in a flex row the tile keeps its own height instead of
      // stretching to the row's, which left an empty white column under it.
      className={`flex shrink-0 flex-col self-start overflow-hidden rounded-control border bg-surface text-center shadow-[var(--shadow-card)] ${colors.body} ${
        large ? "w-[4.5rem]" : "w-14"
      } ${className}`}
      suppressHydrationWarning
    >
      <span className={`block truncate px-1 font-semibold leading-5 ${large ? "text-xs" : "text-2xs"} ${colors.band}`}>
        {parts.month}
      </span>
      <span className={`block font-bold leading-none tabular-nums ${large ? "pt-2 text-3xl" : "pt-1.5 text-2xl"}`}>
        {parts.day}
      </span>
      <span className={`block truncate px-1 pb-1.5 pt-1 font-medium text-muted ${large ? "text-2xs" : "text-[0.625rem]"}`}>
        {parts.year}
      </span>
    </time>
  );
}
