import { handler, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadProgressOptions } from '@pravyo/cas/lib/casProgressAccess';

export const dynamic = 'force-dynamic';

/** The grades, subjects and students this actor may see on Student Progress. */
export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  if (!academicYear) throw new HttpError('Choose an academic year');
  return loadProgressOptions(actor, {
    academicYear,
    grade: query.get('grade') || '',
    section: query.get('section') || '',
  });
});
