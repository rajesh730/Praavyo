import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { publishedInternalCards } from '@pravyo/cas/lib/internalPublishedResults';

export const dynamic = 'force-dynamic';

// Internal Exam → Published Results: published cards only, school admin only.
export const GET = internalExamHandler(({ actor, query }) => publishedInternalCards(actor, {
  academicYear: query.get('academicYear') || '',
  grade: query.get('grade') || '',
  exam: query.get('exam') || '',
  section: query.get('section') || '',
  search: query.get('search') || '',
  student: query.get('student') || '',
}));
