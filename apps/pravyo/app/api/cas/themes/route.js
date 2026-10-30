import { handler, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadThemes } from '@pravyo/cas/lib/casSheetService';

export const dynamic = 'force-dynamic';

/** The themes inside one subject, with how many outcomes each holds. */
export const GET = handler(({ actor, query }) => {
  const grade = query.get('grade');
  const subject = query.get('subject');
  if (!grade || !subject) throw new HttpError('Choose a grade and subject');
  return loadThemes(actor, {
    grade, subject,
    exam: query.get('exam') || undefined,
    academicYear: query.get('academicYear') || undefined,
  });
});
