import { listPublishedCards } from './internalExamService.js';
import { withBranding } from './casBranding.js';

/**
 * Internal Exam → Published Results: only published cards, with the school's
 * and each student's live details attached (casBranding). Section and search
 * filter on those live details, so a student's current roll and section (a
 * section only when the school configured it for the grade) decide what is
 * found, exactly as the card shows them.
 *
 * Order: exam (in the order the school created them), then roll number, then name.
 */
export async function publishedInternalCards(actor, { academicYear, grade, exam, section = '', search = '', student = '', ids } = {}) {
  const cards = await withBranding(actor.school, await listPublishedCards(actor, { academicYear, grade, exam, ids }));
  const wanted = String(search || '').trim().toLowerCase();
  return cards
    .filter((card) => !student || card.student === String(student))
    .filter((card) => !section || card.branding?.studentSection === section)
    .filter((card) => !wanted || [
      card.branding?.studentName || card.snapshot?.student?.name,
      card.branding?.studentRoll ?? card.snapshot?.student?.rollNumber,
      card.branding?.studentIemis,
      card.snapshot?.examTitle,
    ].some((value) => String(value || '').toLowerCase().includes(wanted)))
    .sort(byExamThenRoll);
}

function byExamThenRoll(a, b) {
  if (a.exam !== b.exam) {
    const order = examTime(a) - examTime(b);
    if (order) return order;
    return String(a.snapshot?.examTitle || '').localeCompare(String(b.snapshot?.examTitle || ''));
  }
  const ra = Number(a.branding?.studentRoll ?? a.snapshot?.student?.rollNumber);
  const rb = Number(b.branding?.studentRoll ?? b.snapshot?.student?.rollNumber);
  if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
  return String(a.branding?.studentName || a.snapshot?.student?.name || '').localeCompare(String(b.branding?.studentName || b.snapshot?.student?.name || ''));
}

/** When the card's exam was created; a card whose exam is gone sorts last. */
function examTime(card) {
  const time = card.examCreatedAt ? new Date(card.examCreatedAt).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}
