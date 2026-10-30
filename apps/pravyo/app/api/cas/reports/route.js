import { handler, jsonBody, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadReports, generateReports } from '@pravyo/cas/lib/casReportService';
import { requireSchoolAdmin } from '@pravyo/cas/lib/casAccess';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => {
  requireSchoolAdmin(actor);
  const academicYear = query.get('academicYear');
  if (!academicYear) throw new HttpError('Choose an academic year');
  return loadReports(actor, {
    academicYear,
    grade: query.get('grade') || undefined,
    status: query.get('status') || undefined,
    section: query.get('section') || undefined,
    exam: query.get('exam') || undefined,
    format: query.get('format') || undefined,
    search: query.get('search') || undefined,
  });
});

export const POST = handler(async ({ actor, request }) =>
  generateReports(actor, await jsonBody(request)),
);
