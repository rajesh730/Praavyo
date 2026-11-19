import { handler, HttpError } from '@pravyo/cas/lib/casRoute';

export const dynamic = 'force-dynamic';

/**
 * Retired (owner, 2026-11-20): CAS results are published and unpublished
 * only in Manage Exams (POST /api/cas/results/exam-publishing), a whole exam
 * for a whole grade at a time. Student Result only checks, prints and
 * downloads. Kept so an old open page gets a clear answer instead of a 404.
 */
export const POST = handler(() => {
  throw new HttpError('Results are published only in Manage Exams. Open Manage Exams and choose Publish on the exam.', 410);
});
