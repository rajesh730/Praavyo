import { calculateGpa, gradeFor, gradeForGpa } from '@pravyo/core/casGrading';
import { summariseRows } from './client/sheetTotals.js';

/**
 * The step-wise result sheet — theme, then subject, then GPA — laid out the
 * way the school's worked example (Pravyo_CAS_…_Grade3_Demo_Result.pdf) states
 * it:
 *
 *   theme      full marks = assessments × 4, obtained = sum of scores
 *   subject    percentage = total obtained / total full marks × 100
 *              (pooled across themes, NOT an average of theme percentages)
 *   GPA        Σ (credit hours × grade point) / Σ credit hours
 *
 * Only ASSESSED outcomes count as assessments. An outcome the teacher has not
 * reached yet is left out rather than scored zero, the same rule the book page
 * and `subjectResult` apply.
 *
 * Pure: no database, no React. The arithmetic itself is `summariseRows`, so a
 * theme's figure here cannot disagree with the footer of its book page.
 */

/**
 * The highest grade this calculation applies to.
 *
 * The owner confirmed on 2026-09-24 that the method above is for Grades 1-5
 * only. Grades 6-10 will be graded differently, by rules not yet agreed, so
 * for them CAS records and shows continuous assessment but computes no
 * percentage, grade or GPA — showing a primary-school figure there would be
 * a wrong number presented as a real one.
 */
export const RESULT_SHEET_MAX_GRADE = 5;

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** "Grade 3" → 3, "कक्षा ५" → 5; null when the name carries no number. */
export function gradeNumber(grade) {
  const latin = String(grade ?? '').replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS.indexOf(d));
  const match = /\d+/.exec(latin);
  return match ? Number(match[0]) : null;
}

/** Whether a grade's results are calculated by this step-wise sheet. */
export function usesResultSheet(grade) {
  const n = gradeNumber(grade);
  return n !== null && n >= 1 && n <= RESULT_SHEET_MAX_GRADE;
}

export const RESULT_SHEET_UNAVAILABLE =
  'Result calculation for Grades 6-10 has not been set up yet. Assessment can still be recorded.';

const isUnassessed = (level) => level === null || level === undefined;

/**
 * Totals over accepted levels. Normally an unassessed outcome is left out.
 * With `missingLevel` (0-4) — the exam's missing-work rule applied by "Publish
 * anyway" — each unassessed outcome instead counts as an assessment scored
 * that level: 0 adds 4 to full marks and nothing to marks obtained.
 */
function totalsFor(levels, missingLevel = null) {
  const base = summariseRows(
    levels.map((acceptedLevel, index) => ({ outcome: String(index), acceptedLevel })),
  );
  const filled = isUnassessed(missingLevel) ? 0 : levels.length - base.assessedCount;
  if (!filled) return { ...base, filled: 0 };
  const assessedCount = base.assessedCount + filled;
  const obtained = base.obtained + filled * missingLevel;
  const assessedFullMarks = assessedCount * 4;
  // Rounded exactly as summariseRows rounds.
  const percent = Math.round((obtained / assessedFullMarks) * 10000) / 100;
  const band = gradeFor(percent);
  return {
    ...base,
    assessedCount,
    assessedFullMarks,
    obtained,
    percent,
    grade: band?.grade || null,
    gradePoint: band?.gradePoint ?? null,
    remarkEn: band?.remarkEn || '',
    remarkNe: band?.remarkNe || '',
    filled,
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** One theme row: `levels` are accepted levels in outcome order, null if unassessed. */
export function themeResult({ levels = [], missingLevel = null, ...theme }) {
  const totals = totalsFor(levels, missingLevel);
  return {
    key: theme.key,
    titleEn: theme.titleEn || '',
    titleNe: theme.titleNe || '',
    sequence: theme.sequence ?? null,
    outcomeCount: totals.outcomeCount,
    assessments: totals.assessedCount,
    fullMarks: totals.assessedFullMarks,
    scores: isUnassessed(missingLevel)
      ? levels.filter((level) => !isUnassessed(level))
      : levels.map((level) => (isUnassessed(level) ? missingLevel : level)),
    obtained: totals.obtained,
    percent: totals.percent,
    grade: totals.grade,
    gradePoint: totals.gradePoint,
    filled: totals.filled,
  };
}

/**
 * One subject section: its theme table and the footer line under it.
 * `missingLevel` scores unassessed outcomes (see totalsFor); omit it for the
 * normal rule of leaving them out.
 */
export function subjectResultSheet({ creditHours = null, themes = [], missingLevel = null }) {
  const rows = themes.map((theme) => themeResult({ ...theme, missingLevel }));
  const totals = totalsFor(themes.flatMap((theme) => theme.levels || []), missingLevel);
  const weighted =
    totals.gradePoint !== null && Number.isFinite(creditHours) && creditHours > 0
      ? round2(creditHours * totals.gradePoint)
      : null;
  return {
    themes: rows,
    assessments: totals.assessedCount,
    fullMarks: totals.assessedFullMarks,
    obtained: totals.obtained,
    percent: totals.percent,
    grade: totals.grade,
    gradePoint: totals.gradePoint,
    remarkEn: totals.remarkEn,
    remarkNe: totals.remarkNe,
    creditHours,
    weightedGradePoint: weighted,
    filled: totals.filled,
  };
}

/**
 * The final summary across subjects. A subject with no grade point or no
 * credit hours is left out of both sums, as `calculateGpa` does, so the
 * printed "90.4 / 26" always divides to the printed GPA.
 */
export function finalResult(subjects = []) {
  let totalCreditHours = 0;
  let totalWeightedGradePoints = 0;
  for (const subject of subjects) {
    if (subject?.weightedGradePoint === null || subject?.weightedGradePoint === undefined) continue;
    totalCreditHours += subject.creditHours;
    totalWeightedGradePoints += subject.creditHours * subject.gradePoint;
  }
  const gpa = calculateGpa(subjects);
  const overall = gradeForGpa(gpa);
  return {
    totalCreditHours,
    totalWeightedGradePoints: round2(totalWeightedGradePoints),
    gpa,
    grade: overall?.grade || null,
    remarkEn: overall?.remarkEn || '',
    remarkNe: overall?.remarkNe || '',
  };
}
