import { handler } from '@pravyo/cas/lib/casRoute';
import { loadCurriculum } from '@pravyo/cas/lib/casCurriculumService';

export const dynamic = 'force-dynamic';

/** Subjects for a grade, each with its learning outcomes. */
export const GET = handler(({ actor, query }) =>
  loadCurriculum(actor, {
    grade: query.get('grade') || undefined,
    subject: query.get('subject') || undefined,
    academicYear: query.get('academicYear') || undefined,
  }),
);
