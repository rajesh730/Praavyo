import { jsonBody } from '@pravyo/cas/lib/casRoute';
import { listExamGrades, listExams, loadSheet, saveMarks } from '@pravyo/cas/lib/internalExamService';

/**
 * Internal exam endpoints shared by the two assessment APIs:
 *   - the school's  /api/cas/internal-exams/...     (school admins)
 *   - the teacher's /api/teacher/exams/internal/... (teachers)
 *
 * Defined once, served by both, so marks entered by a teacher are the same
 * records the school's ledger, results and report cards read. The service
 * limits a teacher to the grades they teach and the subjects assigned to them.
 */

/** Without a grade: which grades the actor may open (null = every grade). With one: its exams. */
export async function examsOrGrades({ actor, query }) {
  return query.get('grade')
    ? listExams(actor, { academicYear: query.get('academicYear') || undefined, grade: query.get('grade') })
    : { grades: await listExamGrades(actor) };
}

/** The mark ledger for one exam (and optional section). */
export function sheet({ actor, query }) {
  return loadSheet(actor, {
    exam: query.get('exam') || '',
    section: query.get('section') || '',
  });
}

/** Save typed marks. A teacher can only save their own subjects' columns. */
export async function marks({ actor, request }) {
  return saveMarks(actor, await jsonBody(request));
}
