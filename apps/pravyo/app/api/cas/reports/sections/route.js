import { handler, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadPublishedSections } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  if (!academicYear || !grade) throw new HttpError('Choose a grade and academic year');
  return loadPublishedSections(actor, { academicYear, grade });
});
