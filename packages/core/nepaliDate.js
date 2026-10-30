import NepaliDateModule from "nepali-date-converter";

// The package is CommonJS: bundlers hand back the class, plain Node ESM the
// module object around it.
const NepaliDate = NepaliDateModule.default || NepaliDateModule;

// Date display in the user's chosen calendar: Gregorian (AD) or Bikram Sambat
// (BS). BS uses an exact, table-based conversion (via nepali-date-converter),
// not the +57 year approximation used for academic-year *labels*. Month names
// are Romanized (e.g. "Asar 10, 2083") to suit schools registered in English.

// Bikram Sambat (BS) is the platform default; only an explicit "AD" opts out.
export function normalizeCalendar(value) {
  return String(value || "").toUpperCase() === "AD" ? "AD" : "BS";
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// AD short date, e.g. "Jun 24, 2026".
export function formatAdDate(value, { withYear = true } = {}) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

// Exact BS date, Romanized, e.g. "Asar 10, 2083".
export function formatBsDate(value, { withYear = true } = {}) {
  const date = toDate(value);
  if (!date) return "";
  try {
    return new NepaliDate(date).format(withYear ? "MMMM D, YYYY" : "MMMM D");
  } catch {
    // Out of the converter's supported range — fall back to AD rather than fail.
    return formatAdDate(value, { withYear });
  }
}

// Numeric BS date, e.g. "2083/04/10". Report cards print the issue date this
// way rather than "Asar 10, 2083" — it is what the school's own marksheet
// shows, and a fixed-width numeric date keeps the signature block aligned.
export function formatBsNumeric(value) {
  const date = toDate(value);
  if (!date) return "";
  try {
    return new NepaliDate(date).format("YYYY/MM/DD");
  } catch {
    // Out of the converter's supported range — an AD date is better than none.
    return formatAdDate(value);
  }
}

// Format a date in the requested calendar ("AD" | "BS").
export function formatDate(value, calendar = "AD", options = {}) {
  return normalizeCalendar(calendar) === "BS"
    ? formatBsDate(value, options)
    : formatAdDate(value, options);
}

// Date + time, e.g. "Asar 10, 2083, 2:14 PM" / "Jun 24, 2026, 2:14 PM". The time
// part is calendar-agnostic; only the date switches with the calendar.
export function formatDateTime(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return "";
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDate(value, calendar)}, ${time}`;
}

// Month + year only, e.g. "Asar 2083" / "June 2026" — for "since"/range labels.
export function formatMonthYear(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return "";
  if (normalizeCalendar(calendar) === "BS") {
    try {
      return new NepaliDate(date).format("MMMM YYYY");
    } catch {
      /* fall through to AD */
    }
  }
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Today's date in Kathmandu as numeric BS, e.g. "2083/06/08".
export function todayBsNumeric(now = new Date()) {
  const kathmandu = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
  const midday = new Date(Date.UTC(
    kathmandu.getUTCFullYear(), kathmandu.getUTCMonth(), kathmandu.getUTCDate(), 12,
  ));
  return formatBsNumeric(midday);
}

// One BS month laid out for a date picker: its name, the weekday its 1st falls
// on (0 = Sunday) and how many days it has (29-32, it varies year to year).
// Null outside the converter's supported range.
export function bsMonthLayout(year, monthIndex) {
  try {
    const first = new NepaliDate(year, monthIndex, 1);
    let days = 32;
    // A day past the month's end rolls over into the next month.
    while (days > 29 && new NepaliDate(year, monthIndex, days).getMonth() !== monthIndex) days -= 1;
    return {
      name: first.format("MMMM"),
      nameNe: first.format("MMMM", "np"),
      firstWeekday: first.getDay(),
      days,
    };
  } catch {
    return null;
  }
}

// The numeric BS date an AD calendar day falls on, e.g. (2026, 9, 27) -> "2083/07/10".
export function adDayToBsNumeric(year, monthIndex, day) {
  return formatBsNumeric(new Date(year, monthIndex, day, 12));
}

// Read a numeric BS date typed by a school ("2083/6/8" or "2083/06/08").
// Returns the canonical "YYYY/MM/DD" and the AD date it falls on, or null when
// it is not a real BS date (Asoj has no 33rd day, for instance).
export function parseBsNumeric(value) {
  const match = /^(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  try {
    const date = new NepaliDate(year, month - 1, day);
    if (date.getYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return {
      bs: `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
      ad: date.toJsDate(),
    };
  } catch {
    return null;
  }
}

// The running B.S. academic year, e.g. "2083". Sessions start around Baisakh,
// so the canonical AD start year maps to BS by adding 57. The end year is not
// shown: Nepalese schools identify a session by its running year.
export function bsAcademicYearLabel(yearStart) {
  const start = Number.parseInt(yearStart, 10);
  if (!Number.isFinite(start)) return "";
  // A start year already in BS (2060 onward) is used as it is.
  const bs = start >= 2060 ? start : start + 57;
  return String(bs);
}

// One display label for both new academic-year records and historical labels.
// `yearStart` is canonical for sorting and matching; `value` handles older
// records that still carry a range such as "2083/84" or "2026-27".
export function academicYearDisplayLabel(value, { yearStart, calendar = "BS" } = {}) {
  const saved = String(value || "").trim();
  const savedStart = /^(\d{4})/.exec(saved)?.[1];
  if (savedStart) return savedStart;

  const start = Number.parseInt(yearStart, 10);
  if (!Number.isFinite(start)) return saved;
  return normalizeCalendar(calendar) === "BS"
    ? bsAcademicYearLabel(start)
    : String(start);
}
