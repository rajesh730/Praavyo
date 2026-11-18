import { getAcceptedLevel } from '@pravyo/core/casResults';
import { gradeFor } from '@pravyo/core/casGrading';

/**
 * The footer block of a book page, recomputed as the teacher types.
 *
 * Built from the same two shared functions the server uses — `getAcceptedLevel`
 * for the accepted mark and `gradeFor` for the band — so the running figures on
 * screen cannot disagree with what gets stored. The server recomputes on save;
 * this is a preview, never the authority.
 */

/** A blank cell is "not assessed"; anything else must be a real level. */
function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/**
 * The accepted mark for one row, with any unsaved edits applied.
 *
 * Three things feed in, and the highest wins:
 *  - `acceptedLevel` already stored against the row (the best of every saved
 *    attempt, including older reassessments the page no longer shows),
 *  - the regular mark, and
 *  - the mark after extra support,
 * each overridden by the draft when the draft carries that key.
 *
 * A changed regular mark, or a cleared extra-support mark, is a CORRECTION
 * (allowed until the result is published): the saved best no longer counts,
 * only what the page now shows. A new extra-support mark is a reassessment and
 * keeps the best result already earned.
 *
 * Throws on a value that is neither blank nor a level 1-4, rather than quietly
 * scoring it.
 */
export function acceptedRowLevel(row = {}, draft) {
  const pick = (key) =>
    draft && Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : row[key];

  const saved = (key) => (isBlank(row[key]) ? null : row[key]);
  const regularCorrected = isBlank(pick('regularLevel'))
    ? saved('regularLevel') !== null
    : pick('regularLevel') !== saved('regularLevel');
  const remedialCleared = isBlank(pick('remedialLevel')) && saved('remedialLevel') !== null;
  const corrected = Boolean(draft) && (regularCorrected || remedialCleared);

  const candidates = [corrected ? null : row.acceptedLevel, pick('regularLevel'), pick('remedialLevel')];

  return getAcceptedLevel(
    candidates.filter((level) => !isBlank(level)).map((level) => ({ level })),
  );
}

/**
 * Totals for a whole page.
 *
 * `percent` is taken over what has actually been assessed, not over the theme's
 * full marks — an outcome the teacher has not reached yet is excluded rather
 * than scored zero, which is the same rule `subjectResult` applies to reports.
 * `fullMarks` is still reported so the page can print the book's
 * "थिमगत पूर्णाङ्क = N × ४" line.
 */
export function summariseRows(rows = [], draft) {
  const outcomeCount = rows.length;
  let obtained = 0;
  let assessedCount = 0;

  for (const row of rows) {
    const accepted = acceptedRowLevel(row, draft?.[row.outcome]);
    if (accepted === null) continue;
    obtained += accepted;
    assessedCount += 1;
  }

  const assessedFullMarks = assessedCount * 4;
  const percent =
    assessedCount > 0 ? Math.round((obtained / assessedFullMarks) * 10000) / 100 : null;
  const band = percent === null ? null : gradeFor(percent);

  return {
    outcomeCount,
    fullMarks: outcomeCount * 4,
    assessedFullMarks,
    assessedCount,
    obtained,
    percent,
    grade: band?.grade || null,
    gradePoint: band?.gradePoint ?? null,
    remarkEn: band?.remarkEn || '',
    remarkNe: band?.remarkNe || '',
    complete: outcomeCount > 0 && assessedCount === outcomeCount,
  };
}
