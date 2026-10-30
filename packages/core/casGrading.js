/**
 * The grade sheet: achievement percentage → grade point, letter grade, remark,
 * and a credit-hour weighted GPA.
 *
 * Transcribed from the Grade 3 evaluation record (विद्यार्थी मूल्याङ्कन अभिलेख
 * कार्यसञ्चयिका, Asmita Publication) — the scale on page 6 and the worked
 * example on page 62. Both are pinned by tests.
 *
 * This is presentation, not assessment. Levels 1-4 remain the unit a teacher
 * records; letter grades exist only on the summary sheet, because that is the
 * document schools and parents already recognise.
 *
 * Dependency-free on purpose, so both apps can import it.
 */

/**
 * Ordered high to low. `min` is inclusive; the first band a percentage reaches
 * wins, so the boundaries read exactly as the book states them
 * ("९० र सोभन्दा माथि", "८० र सोभन्दा माथि ९० भन्दा कम", …).
 */
export const GRADE_BANDS = [
  { min: 90, gradePoint: 4.0, grade: 'A+', remarkEn: 'Outstanding', remarkNe: 'सर्वोत्तम' },
  { min: 80, gradePoint: 3.6, grade: 'A', remarkEn: 'Excellent', remarkNe: 'अत्युत्तम' },
  { min: 70, gradePoint: 3.2, grade: 'B+', remarkEn: 'Very good', remarkNe: 'उत्कृष्ट' },
  { min: 60, gradePoint: 2.8, grade: 'B', remarkEn: 'Good', remarkNe: 'उत्तम' },
  { min: 50, gradePoint: 2.4, grade: 'C+', remarkEn: 'Satisfactory', remarkNe: 'सन्तोषजनक' },
  { min: 40, gradePoint: 2.0, grade: 'C', remarkEn: 'Acceptable', remarkNe: 'प्राप्य' },
  { min: 35, gradePoint: 1.6, grade: 'D', remarkEn: 'Basic', remarkNe: 'आधारभूत' },
];

/** Below the lowest band. Carries no grade point, so it cannot enter the GPA. */
export const NOT_GRADED = {
  min: 0,
  gradePoint: null,
  grade: 'NG',
  remarkEn: 'Not graded',
  remarkNe: 'अवर्गीकृत',
};

/**
 * Grade a subject's achievement percentage.
 *
 * Null in, null out: a subject with nothing assessed has no achievement to
 * grade, and must not be reported as NG — "not assessed" and "assessed and
 * below 35%" are different statements about a child.
 */
export function gradeFor(achievementPercent) {
  if (achievementPercent === null || achievementPercent === undefined) return null;
  if (!Number.isFinite(achievementPercent)) return null;

  const band = GRADE_BANDS.find((b) => achievementPercent >= b.min) || NOT_GRADED;
  return {
    gradePoint: band.gradePoint,
    grade: band.grade,
    remarkEn: band.remarkEn,
    remarkNe: band.remarkNe,
  };
}

/**
 * Credit-hour weighted grade point average.
 *
 * Subjects with no achievement, no credit hours, or an NG grade are left out of
 * both the numerator and the denominator — averaging in a zero for a subject
 * that was never assessed would understate the child.
 *
 * Verified against the book's own example (page 62):
 *   Nepali 5×3.6, English 4×4.0, Mathematics 4×4.0,
 *   Our Surrounding 8×3.2, Local Subject 5×3.2  →  91.6 / 26 = 3.52
 */
export function calculateGpa(subjects) {
  let weighted = 0;
  let credits = 0;

  for (const subject of subjects || []) {
    const gradePoint = subject?.gradePoint;
    const creditHours = subject?.creditHours;
    if (gradePoint === null || gradePoint === undefined) continue;
    if (!Number.isFinite(creditHours) || creditHours <= 0) continue;
    weighted += gradePoint * creditHours;
    credits += creditHours;
  }

  if (credits === 0) return null;
  // Two decimals, matching the printed sheet.
  return Math.round((weighted / credits) * 100) / 100;
}

/** The overall grade a GPA corresponds to, for the summary line. */
export function gradeForGpa(gpa) {
  if (gpa === null || gpa === undefined || !Number.isFinite(gpa)) return null;
  // Bands are stated in percentage terms; a grade point maps back through the
  // same table by finding the highest band whose point value it reaches.
  const band = GRADE_BANDS.find((b) => gpa >= b.gradePoint) || NOT_GRADED;
  return {
    grade: band.grade,
    remarkEn: band.remarkEn,
    remarkNe: band.remarkNe,
  };
}
