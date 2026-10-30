import { handler, jsonBody, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadAssessmentSheet, recordLevel } from '@pravyo/cas/lib/casAssessService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const outcome = query.get('outcome');
  if (!academicYear || !grade || !outcome) {
    throw new HttpError('Choose an academic year, grade and learning outcome');
  }
  return loadAssessmentSheet(actor, { academicYear, grade, outcome });
});

/** Append one level. Never edits an existing attempt. */
export const POST = handler(async ({ actor, request }) =>
  recordLevel(actor, await jsonBody(request)),
);
