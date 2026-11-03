/**
 * Internal (school) exam results: plain marks out of the full marks the school
 * chose, turned into a percentage and graded on the same bands as CAS.
 *
 * Marks are always read as a percentage of the subject's full marks, so a
 * school that sets its First Terminal out of 50 and its Final out of 100 gets
 * grades on one scale: 40/50 and 80/100 are both 80% — grade A.
 *
 * Kept separate from casResultSheet on purpose: CAS grades learning-outcome
 * levels, this grades written-paper marks. Only the grading scale is shared.
 *
 * Dependency-free apart from casGrading, so the server and the report card
 * can both use it.
 */
import { calculateGpa, gradeFor, gradeForGpa } from './casGrading.js';

export const DEFAULT_FULL_MARKS = 100;
export const DEFAULT_PASS_PERCENT = 35;

const round2 = (value) => Math.round(value * 100) / 100;

/** Full marks for one subject of an exam: its override, else the exam default. */
export function subjectFullMarks(exam, subjectId) {
  const override = (exam?.subjectFullMarks || []).find((row) => String(row.subject) === String(subjectId));
  return Number(override?.fullMarks) || Number(exam?.fullMarks) || DEFAULT_FULL_MARKS;
}

/** Pass marks for a subject, as printed on the sheet (two decimals at most). */
export function passMarksFor(fullMarks, passPercent = DEFAULT_PASS_PERCENT) {
  return round2((fullMarks * passPercent) / 100);
}

/**
 * One subject's line. `entry` is `{ marks, absent }` or undefined (not entered).
 * An absent student scores 0, is not graded, and has not passed.
 */
export function subjectLine(subject, entry, passPercent = DEFAULT_PASS_PERCENT) {
  const fullMarks = Number(subject.fullMarks) || DEFAULT_FULL_MARKS;
  const passMarks = passMarksFor(fullMarks, passPercent);
  const base = {
    id: String(subject.id),
    code: subject.code || '',
    titleEn: subject.titleEn || '',
    titleNe: subject.titleNe || '',
    creditHours: Number.isFinite(subject.creditHours) ? subject.creditHours : null,
    fullMarks,
    passMarks,
  };

  if (entry?.absent) {
    return { ...base, entered: true, absent: true, obtained: 0, percent: 0, grade: 'ABS', gradePoint: null, passed: false };
  }
  if (entry?.marks === null || entry?.marks === undefined || !Number.isFinite(Number(entry.marks))) {
    return { ...base, entered: false, absent: false, obtained: null, percent: null, grade: null, gradePoint: null, passed: false };
  }

  const obtained = Number(entry.marks);
  const percent = round2((obtained / fullMarks) * 100);
  const graded = gradeFor(percent);
  return {
    ...base,
    entered: true,
    absent: false,
    obtained,
    percent,
    grade: graded.grade,
    gradePoint: graded.gradePoint,
    passed: obtained >= passMarks,
  };
}

/**
 * A student's whole result for one exam.
 *
 * `subjects` are only the subjects this student takes, each with its
 * `fullMarks` already resolved. `marks` maps subject id → `{ marks, absent }`.
 *
 * GPA is weighted by credit hours like CAS. When the school has set no credit
 * hours at all for the grade (common for Grades 6–10 until they do), every
 * subject counts equally instead of the GPA disappearing.
 */
export function internalExamResult({ subjects = [], marks = {}, passPercent = DEFAULT_PASS_PERCENT }) {
  const lines = subjects.map((subject) => subjectLine(subject, marks[String(subject.id)], passPercent));
  const complete = lines.length > 0 && lines.every((line) => line.entered);
  const fullMarks = lines.reduce((sum, line) => sum + line.fullMarks, 0);
  const obtained = lines.reduce((sum, line) => sum + (line.obtained || 0), 0);
  const anyCredit = lines.some((line) => line.creditHours > 0);
  const gpa = complete
    ? calculateGpa(lines.map((line) => ({ gradePoint: line.gradePoint, creditHours: anyCredit ? line.creditHours : 1 })))
    : null;
  const overall = gradeForGpa(gpa);

  return {
    subjects: lines,
    complete,
    fullMarks,
    obtained: round2(obtained),
    percent: complete && fullMarks ? round2((obtained / fullMarks) * 100) : null,
    gpa,
    overallGrade: overall?.grade || null,
    passed: complete && lines.every((line) => line.passed),
  };
}
