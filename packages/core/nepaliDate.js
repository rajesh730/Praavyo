import NepaliDateModule from "nepali-date-converter";

// The package is CommonJS: bundlers hand back the class, plain Node ESM the
// module object around it.
const NepaliDate = NepaliDateModule.default || NepaliDateModule;

// Date display in the user's chosen calendar: Gregorian (AD) or Bikram Sambat
// (BS). BS uses an exact, table-based conversion (via nepali-date-converter),
// not the +57 year approximation used for academic-year *labels*.
//
// Choosing BS means a fully Nepali date: Devanagari digits, Nepali month and
// weekday names — "कात्तिक २०, २०८३", "शुक्रबार". AD stays English.
//
// Only the CONVERSION comes from the package. Its own Nepali output is not
// used: it spells months formally (श्रावण, भाद्र, फाल्गुण) where Nepali
// calendars and schools write साउन, भदौ, फागुन, and its weekday token appends
// a stray digit ("शुक्रबार५"). The names below are the everyday ones.
//
// Numeric BS ("2083/07/20") stays in ASCII digits: it is what schools type,
// what report cards print and what the API stores.

export const BS_MONTHS_NE = ["बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
export const BS_MONTHS_EN = ["Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Asoj", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
export const WEEKDAYS_NE = ["आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहिबार", "शुक्रबार", "शनिबार"];
export const WEEKDAYS_NE_SHORT = ["आइत", "सोम", "मंगल", "बुध", "बिहि", "शुक्र", "शनि"];

const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

/** 2083 → "२०८३". Any non-digit characters are kept as they are. */
export function toNepaliDigits(value) {
  return String(value ?? "").replace(/[0-9]/g, (digit) => NEPALI_DIGITS[digit]);
}

// Bikram Sambat (BS) is the platform default; only an explicit "AD" opts out.
export function normalizeCalendar(value) {
  return String(value || "").toUpperCase() === "AD" ? "AD" : "BS";
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The BS date a moment falls on (in the viewer's local time), with its
 * Nepali names. Null when invalid or outside the converter's range.
 */
export function bsParts(value) {
  const date = toDate(value);
  if (!date) return null;
  try {
    const bs = new NepaliDate(date);
    const month = bs.getMonth();
    return {
      year: bs.getYear(),
      month,
      day: bs.getDate(),
      weekday: date.getDay(),
      monthNe: BS_MONTHS_NE[month],
      monthEn: BS_MONTHS_EN[month],
    };
  } catch {
    return null;
  }
}

/** "दिउँसो २:१४" — the time of day the way it is said in Nepali. */
export function formatNepaliTime(value) {
  const date = toDate(value);
  if (!date) return "";
  const hours = date.getHours();
  const period = hours < 4 ? "राति" : hours < 12 ? "बिहान" : hours < 16 ? "दिउँसो" : hours < 19 ? "साँझ" : "राति";
  const hour12 = hours % 12 || 12;
  return `${period} ${toNepaliDigits(hour12)}:${toNepaliDigits(String(date.getMinutes()).padStart(2, "0"))}`;
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

// Exact BS date in Nepali, e.g. "असार १०, २०८३" (or "असार १०" without year).
export function formatBsDate(value, { withYear = true } = {}) {
  const parts = bsParts(value);
  // Out of the converter's supported range — fall back to AD rather than fail.
  if (!parts) return formatAdDate(value, { withYear });
  const dayMonth = `${parts.monthNe} ${toNepaliDigits(parts.day)}`;
  return withYear ? `${dayMonth}, ${toNepaliDigits(parts.year)}` : dayMonth;
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

// Date + time, e.g. "असार १०, २०८३, दिउँसो २:१४" / "Jun 24, 2026, 02:14 PM".
export function formatDateTime(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return "";
  if (normalizeCalendar(calendar) === "BS" && bsParts(date)) {
    return `${formatBsDate(date)}, ${formatNepaliTime(date)}`;
  }
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatAdDate(value)}, ${time}`;
}

// Month + year only, e.g. "असार २०८३" / "June 2026" — for "since"/range labels.
export function formatMonthYear(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return "";
  if (normalizeCalendar(calendar) === "BS") {
    const parts = bsParts(date);
    if (parts) return `${parts.monthNe} ${toNepaliDigits(parts.year)}`;
  }
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// "आज, दिउँसो २:१४" / "Today, 02:14 PM"; further away the full date and time.
export function formatRelativeDateTime(value, calendar = "AD", now = new Date()) {
  const date = toDate(value);
  if (!date) return "";
  const time = normalizeCalendar(calendar) === "BS" && bsParts(date)
    ? formatNepaliTime(date)
    : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${formatRelativeDay(date, calendar, now)}, ${time}`;
}

// Weekday name: "शुक्रबार" / "Friday".
export function formatWeekday(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return "";
  return normalizeCalendar(calendar) === "BS"
    ? WEEKDAYS_NE[date.getDay()]
    : date.toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * The pieces of a calendar-tile date, for a highlighted date block:
 * BS → { day: "२०", month: "कात्तिक", year: "२०८३", weekday: "शुक्रबार" },
 * AD → { day: "6", month: "Nov", year: "2026", weekday: "Friday" }.
 */
export function dateTileParts(value, calendar = "AD") {
  const date = toDate(value);
  if (!date) return null;
  const parts = normalizeCalendar(calendar) === "BS" ? bsParts(date) : null;
  if (parts) {
    return {
      day: toNepaliDigits(parts.day),
      month: parts.monthNe,
      year: toNepaliDigits(parts.year),
      weekday: WEEKDAYS_NE[parts.weekday],
    };
  }
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString("en-US", { month: "short" }),
    year: String(date.getFullYear()),
    weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

/**
 * Near dates in words, else the full date: "आज", "हिजो", "३ दिन अघि" /
 * "Today", "Yesterday", "3 days ago". Days are counted on the local calendar.
 */
export function formatRelativeDay(value, calendar = "AD", now = new Date()) {
  const date = toDate(value);
  if (!date) return "";
  const startOf = (moment) => new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86400000);
  const nepali = normalizeCalendar(calendar) === "BS";
  if (days === 0) return nepali ? "आज" : "Today";
  if (days === -1) return nepali ? "हिजो" : "Yesterday";
  if (days === 1) return nepali ? "भोलि" : "Tomorrow";
  if (days < 0 && days > -7) return nepali ? `${toNepaliDigits(-days)} दिन अघि` : `${-days} days ago`;
  if (days > 0 && days < 7) return nepali ? `${toNepaliDigits(days)} दिन पछि` : `in ${days} days`;
  return formatDate(date, calendar);
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
      name: BS_MONTHS_EN[monthIndex],
      nameNe: BS_MONTHS_NE[monthIndex],
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

// An academic year shown in the VIEWER's calendar, from its canonical start
// year: BS → "२०८३" (Devanagari, like every BS date), AD → "2026". The year a
// school saved its session under does not matter — only the viewer's choice.
export function academicYearInCalendar(yearStart, calendar = "BS") {
  const start = Number.parseInt(yearStart, 10);
  if (!Number.isFinite(start)) return "";
  if (normalizeCalendar(calendar) === "BS") return toNepaliDigits(bsAcademicYearLabel(start));
  // A start year already in BS (2060 onward) is turned back into AD.
  return String(start >= 2060 ? start - 57 : start);
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
