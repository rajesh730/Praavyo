import { catalogGrade, gradeRank, nextCatalogGrade, sortGrades } from "@pravyo/core/gradeLevels";

// Academic-year + grade-progression helpers.
//
// Each school chooses a calendar (AD or BS). Internally we always store the
// canonical AD start year (`yearStart`, a number) so batches can be sorted and
// compared across schools regardless of which calendar they display. The human
// label (`year`) is derived deterministically from (calendar, yearStart).

export const AY_CALENDARS = ["AD", "BS"];

// Nepali academic sessions start around Baisakh (mid-April), so the AD year maps
// to roughly BS = AD + 57 for the session start. Schools can re-pick the year if
// their convention differs; this only drives the displayed label.
const BS_OFFSET = 57;

export function normalizeCalendar(value) {
  const calendar = String(value || "").toUpperCase();
  return AY_CALENDARS.includes(calendar) ? calendar : "AD";
}

export function getCurrentAdYear() {
  return new Date().getFullYear();
}

// Display label for a given canonical AD start year, e.g.
//   AD → "2025",  BS → "2082"
export function formatAcademicYear(yearStart, calendar = "AD") {
  const start = Number.parseInt(yearStart, 10);
  if (!Number.isFinite(start)) return "";

  if (normalizeCalendar(calendar) === "BS") {
    const bs = start + BS_OFFSET;
    return String(bs);
  }
  return String(start);
}

// Build a complete academic-year descriptor from the canonical AD start year.
export function buildAcademicYear(yearStart, calendar = "AD") {
  const cal = normalizeCalendar(calendar);
  const start = Number.parseInt(yearStart, 10);
  const resolvedStart = Number.isFinite(start) ? start : getCurrentAdYear();
  return {
    yearStart: resolvedStart,
    calendar: cal,
    year: formatAcademicYear(resolvedStart, cal),
  };
}

// The session that follows the given one (yearStart + 1).
export function nextAcademicYear({ yearStart, calendar = "AD" }) {
  const start = Number.parseInt(yearStart, 10);
  const resolvedStart = Number.isFinite(start) ? start : getCurrentAdYear();
  return buildAcademicYear(resolvedStart + 1, calendar);
}

// ── Grade progression ─────────────────────────────────────────────────────

// A grade's place in the school ladder: Nursery -2, LKG -1, UKG 0,
// Grade N → N (packages/core/gradeLevels.js); null when unknown. Used to
// group, sort and compare grades, so pre-primary levels stay apart.
export function getGradeNumber(grade) {
  return gradeRank(grade);
}

// Ordered, de-duplicated grade list ascending: Nursery, LKG, UKG, Grade 1, …
export function getOrderedGrades(schoolGrades = []) {
  return sortGrades(
    (Array.isArray(schoolGrades) ? schoolGrades : []).map((grade) => catalogGrade(grade)).filter(Boolean)
  );
}

export function getMaxGradeNumber(schoolGrades = []) {
  const ordered = getOrderedGrades(schoolGrades);
  if (ordered.length === 0) return null;
  return getGradeNumber(ordered[ordered.length - 1]);
}

// The next grade up (Nursery → LKG → UKG → Grade 1 → …), or null when this is
// the school's highest grade (→ a student promoted out of the top grade
// graduates instead of moving up).
export function getNextGrade(grade, schoolGrades = []) {
  const current = getGradeNumber(grade);
  if (!Number.isFinite(current)) return null;

  const max = getMaxGradeNumber(schoolGrades);
  if (Number.isFinite(max) && current >= max) return null;

  return nextCatalogGrade(grade);
}

export function isTopGrade(grade, schoolGrades = []) {
  return getNextGrade(grade, schoolGrades) === null;
}
