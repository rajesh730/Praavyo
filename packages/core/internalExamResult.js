/**
 * Internal (school) exam results.
 *
 * Each subject has a marks structure (internalMarkScheme.js): a theory paper
 * (TH) and an internal assessment (INT) made of school-defined fields, both
 * typed against their real full marks. Nothing is rescaled:
 *
 *   internalObtained = sum of the field marks
 *   finalObtained    = theoryObtained + internalObtained
 *   finalPercent     = finalObtained / (TH full + INT full) × 100
 *
 * TH, INT and the final mark are each graded on their own percentage with the
 * grading scale below. Grades and grade points are never averaged. A subject
 * from a grade with no structure is one theory mark out of the exam's full
 * marks, exactly as before the split existed.
 *
 * Grading scale (owner, 2026-11-19): the CAS bands from 90% A+ 4.0 down to
 * 35% D 1.6, and below 35% NG with grade point 0.0, which counts in the GPA.
 * Only the bands are shared with CAS; CAS's own NG rule is untouched.
 *
 * Dependency-free apart from casGrading, so the server, the mark-entry grid
 * and the report card all use it.
 */
import { GRADE_BANDS, calculateGpa, gradeFor, gradeForGpa } from './casGrading.js';
import { entryColumns, hasInternal, legacyStructure, totalFullMarks } from './internalMarkScheme.js';

export const DEFAULT_FULL_MARKS = 100;
export const DEFAULT_PASS_PERCENT = 35;
/** NG carries grade point 0.0 on internal exams. */
export const NG_GRADE_POINT = 0;

const round2 = (value) => Math.round(value * 100) / 100;
const isMarks = (value) => typeof value === 'number' && Number.isFinite(value);

/** The scale printed on the internal exam card. */
export const INTERNAL_GRADE_SCALE = [
  ...GRADE_BANDS.map((band, index) => ({
    range: index === 0 ? `${band.min} – 100` : `${band.min} – ${GRADE_BANDS[index - 1].min - 1}`,
    grade: band.grade,
    description: band.remarkEn.replace(/\b[a-z]/g, (c) => c.toUpperCase()),
    point: band.gradePoint.toFixed(1),
  })),
  { range: `Below ${GRADE_BANDS.at(-1).min}`, grade: 'NG', description: 'Not Graded', point: NG_GRADE_POINT.toFixed(1) },
];

/** Grade a percentage; NG gets grade point 0.0. Null in, null out. */
export function gradeOf(percent) {
  const graded = gradeFor(percent);
  if (!graded) return null;
  return { ...graded, gradePoint: graded.grade === 'NG' ? NG_GRADE_POINT : graded.gradePoint };
}

/** Full marks for one subject of an exam with no marks structure: its override, else the exam default. */
export function subjectFullMarks(exam, subjectId) {
  const override = (exam?.subjectFullMarks || []).find((row) => String(row.subject) === String(subjectId));
  return Number(override?.fullMarks) || Number(exam?.fullMarks) || DEFAULT_FULL_MARKS;
}

/** Pass marks for a full-marks figure, as printed on the sheet (two decimals at most). */
export function passMarksFor(fullMarks, passPercent = DEFAULT_PASS_PERCENT) {
  return round2((fullMarks * passPercent) / 100);
}

/** One graded part (TH or INT) once its marks are all in. */
function gradedPart(fullMarks, obtained, passPercent) {
  const passMarks = passMarksFor(fullMarks, passPercent);
  if (!isMarks(obtained)) return { fullMarks, passMarks, entered: false, obtained: null, percent: null, grade: null, gradePoint: null, passed: false };
  const percent = round2((obtained / fullMarks) * 100);
  const graded = gradeOf(percent);
  return { fullMarks, passMarks, entered: true, obtained: round2(obtained), percent, grade: graded.grade, gradePoint: graded.gradePoint, passed: obtained >= passMarks };
}

/**
 * The entry for a subject, normalised: `{ theory, internal: { key: n }, absent }`.
 * Accepts the old `{ marks }` shape, which is a theory mark.
 */
function normalizeEntry(entry) {
  if (!entry) return { theory: null, internal: {}, absent: false };
  const internal = {};
  for (const [key, value] of Object.entries(entry.internal || {})) if (isMarks(value)) internal[key] = value;
  const theory = isMarks(entry.theory) ? entry.theory : (isMarks(entry.marks) ? Number(entry.marks) : null);
  return { theory, internal, absent: Boolean(entry.absent) };
}

/**
 * One subject's line.
 *
 * `subject.structure` is its marks structure (or `subject.fullMarks` for a
 * single theory mark). `entry` is the student's marks, or undefined when
 * nothing is entered. A blank is never read as 0: the line stays unentered
 * until every part is typed. An absent student scores 0, grade ABS.
 *
 * `passEachPart`: theory and internal must each reach the pass percentage;
 * failing either makes the subject NG.
 */
export function subjectLine(subject, entry, passPercent = DEFAULT_PASS_PERCENT, { passEachPart = true } = {}) {
  const structure = subject.structure || legacyStructure(subject.fullMarks);
  const fullMarks = totalFullMarks(structure);
  const passMarks = passMarksFor(fullMarks, passPercent);
  const columns = entryColumns(structure);
  const split = hasInternal(structure) && Number(structure.theoryFullMarks) > 0;
  const { theory, internal, absent } = normalizeEntry(entry);
  const valueOf = (column) => (column.part === 'theory' ? theory : internal[column.key]);

  const internalColumns = columns.filter((column) => column.part === 'internal');
  const internalEntered = internalColumns.length > 0 && internalColumns.every((column) => isMarks(valueOf(column)));
  const internalSoFar = round2(internalColumns.reduce((sum, column) => sum + (isMarks(valueOf(column)) ? valueOf(column) : 0), 0));
  const theoryPart = Number(structure.theoryFullMarks) > 0
    ? gradedPart(Number(structure.theoryFullMarks), theory, passPercent)
    : null;
  const internalPart = hasInternal(structure)
    ? {
      ...gradedPart(Number(structure.internalFullMarks), internalEntered ? internalSoFar : null, passPercent),
      soFar: internalSoFar,
      fields: (structure.fields || []).map((field) => ({
        id: field.id, name: field.name, fullMarks: Number(field.fullMarks),
        obtained: isMarks(internal[field.id]) ? internal[field.id] : null,
      })),
    }
    : null;

  const base = {
    id: String(subject.id),
    code: subject.code || '',
    titleEn: subject.titleEn || '',
    titleNe: subject.titleNe || '',
    creditHours: Number.isFinite(subject.creditHours) ? subject.creditHours : null,
    fullMarks,
    passMarks,
    split,
    theory: theoryPart,
    internal: internalPart,
  };

  if (absent) {
    return { ...base, entered: true, partial: false, absent: true, obtained: 0, percent: 0, grade: 'ABS', gradePoint: NG_GRADE_POINT, passed: false };
  }
  const typed = columns.filter((column) => isMarks(valueOf(column))).length;
  if (!columns.length || typed < columns.length) {
    return { ...base, entered: false, partial: typed > 0, absent: false, obtained: null, percent: null, grade: null, gradePoint: null, passed: false };
  }

  const obtained = round2((theoryPart?.obtained || 0) + (internalPart?.obtained || 0));
  const percent = round2((obtained / fullMarks) * 100);
  const parts = [theoryPart, internalPart].filter(Boolean);
  const partFailed = parts.some((part) => !part.passed);
  const passed = passEachPart && parts.length > 1 ? !partFailed : obtained >= passMarks;
  const graded = passEachPart && parts.length > 1 && partFailed
    ? { grade: 'NG', gradePoint: NG_GRADE_POINT }
    : gradeOf(percent);
  return { ...base, entered: true, partial: false, absent: false, obtained, percent, grade: graded.grade, gradePoint: graded.gradePoint, passed };
}

/**
 * A student's whole result for one exam.
 *
 * `subjects` are only the subjects this student takes, each with its
 * structure (or `fullMarks`). `marks` maps subject id → entry.
 *
 * GPA is weighted by credit hours like CAS. When the school has set no credit
 * hours at all for the grade, every subject counts equally instead.
 */
export function internalExamResult({ subjects = [], marks = {}, passPercent = DEFAULT_PASS_PERCENT, passEachPart = true }) {
  const lines = subjects.map((subject) => subjectLine(subject, marks[String(subject.id)], passPercent, { passEachPart }));
  const complete = lines.length > 0 && lines.every((line) => line.entered);
  const fullMarks = round2(lines.reduce((sum, line) => sum + line.fullMarks, 0));
  const obtained = lines.reduce((sum, line) => sum + (line.obtained || 0), 0);
  const anyCredit = lines.some((line) => line.creditHours > 0);
  const gpa = complete
    ? calculateGpa(lines.map((line) => ({ gradePoint: line.gradePoint, creditHours: anyCredit ? line.creditHours : 1 })))
    : null;
  const overall = gradeForGpa(gpa);

  return {
    subjects: lines,
    complete,
    split: lines.some((line) => line.split),
    passEachPart,
    fullMarks,
    obtained: round2(obtained),
    percent: complete && fullMarks ? round2((obtained / fullMarks) * 100) : null,
    gpa,
    overallGrade: overall?.grade || null,
    passed: complete && lines.every((line) => line.passed),
  };
}
