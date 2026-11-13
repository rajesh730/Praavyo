import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { changeExamPublishing, loadExamPublishing } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/**
 * Manage Exams publishing for one grade.
 * GET ?academicYear&grade          -> published student count per exam
 * GET ?academicYear&grade&exam     -> one exam's summary before publishing
 */
export const GET = handler(({ actor, query }) =>
  loadExamPublishing(actor, {
    academicYear: query.get('academicYear') || '',
    grade: query.get('grade') || '',
    ...(query.get('exam') ? { exam: query.get('exam') } : {}),
  }),
);

/** POST { academicYear, grade, exam, action: 'publish' | 'unpublish' } */
export const POST = handler(async ({ actor, request }) =>
  changeExamPublishing(actor, await jsonBody(request)),
);
