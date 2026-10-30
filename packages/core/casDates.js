/**
 * Assessment date rules.
 *
 * Every date that reaches the database passes through here. Dates arrive from a
 * browser as text and are never trusted: a mistyped assessment date silently
 * files a result under the wrong period, and a future-dated one claims a lesson
 * that has not happened.
 *
 * Canonical storage is the ISO calendar day `YYYY-MM-DD` in the school's local
 * (Asia/Kathmandu) frame. Display in AD or BS is a presentation concern and
 * uses Pravyo's existing converter; nothing here stores a localized string.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CasDateError extends Error {}

/**
 * Today in Kathmandu. A teacher assessing at 09:00 NPT on the 10th is on the
 * 10th; using the server's UTC day would call that the 9th and reject a
 * perfectly valid same-day entry.
 */
export function kathmanduToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Parse and validate a calendar day.
 *
 * Rejects malformed text AND dates that do not exist. The round-trip check is
 * what catches 2026-02-31: `new Date` happily rolls it forward to March 3, so
 * comparing the normalized value back against the input is the only way to
 * notice the day was never real.
 */
export function parseDay(value, field = 'Date') {
  const text = String(value ?? '').trim();
  if (!DAY_PATTERN.test(text)) {
    throw new CasDateError(`${field} must be a date in YYYY-MM-DD form`);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new CasDateError(`${field} is not a real calendar date`);
  }
  return text;
}

/** Inclusive range check on two already-parsed days. */
export function withinRange(day, start, end) {
  return day >= start && day <= end;
}

/**
 * Validate the date on an assessment attempt.
 *
 * Rules, in the order a teacher would hit them:
 *  1. a real date;
 *  2. not in the future (Kathmandu today is the latest valid day);
 *  3. inside the selected assessment period;
 *  4. inside the academic year, when the year's bounds are known;
 *  5. for a reassessment, on or after the previous attempt — a reassessment
 *     dated before the original is a data-entry error, not history.
 */
export function validateAssessmentDate({
  value,
  period,
  academicYear,
  previousAttempt,
  now = new Date(),
}) {
  const day = parseDay(value, 'Assessment date');
  const today = kathmanduToday(now);

  if (day > today) {
    throw new CasDateError('An assessment cannot be dated in the future');
  }

  if (period?.startDate && period?.endDate) {
    if (!withinRange(day, period.startDate, period.endDate)) {
      throw new CasDateError(
        `The date must fall inside ${period.titleEn || 'the assessment period'} (${period.startDate} to ${period.endDate})`,
      );
    }
  }

  if (academicYear?.startDate && academicYear?.endDate) {
    if (!withinRange(day, academicYear.startDate, academicYear.endDate)) {
      throw new CasDateError('The date must fall inside the selected academic year');
    }
  }

  if (previousAttempt?.assessmentDate && day < previousAttempt.assessmentDate) {
    throw new CasDateError(
      `A reassessment cannot be dated before the previous attempt (${previousAttempt.assessmentDate})`,
    );
  }

  return day;
}

/**
 * Validate an assessment period's own window against the academic year.
 * Sibling periods must not overlap; a date inside two periods has no single
 * correct home.
 */
export function validatePeriodWindow({ startDate, endDate, academicYear, siblings = [] }) {
  const start = parseDay(startDate, 'Start date');
  const end = parseDay(endDate, 'End date');

  if (start > end) {
    throw new CasDateError('The start date must come before the end date');
  }

  if (academicYear?.startDate && academicYear?.endDate) {
    if (!withinRange(start, academicYear.startDate, academicYear.endDate) ||
        !withinRange(end, academicYear.startDate, academicYear.endDate)) {
      throw new CasDateError('Assessment periods must fall inside the academic year');
    }
  }

  for (const other of siblings) {
    if (!other?.startDate || !other?.endDate) continue;
    if (start <= other.endDate && end >= other.startDate) {
      throw new CasDateError(
        `This window overlaps ${other.titleEn || 'another assessment period'} (${other.startDate} to ${other.endDate})`,
      );
    }
  }

  return { startDate: start, endDate: end };
}
