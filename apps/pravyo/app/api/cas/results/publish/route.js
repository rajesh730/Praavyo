import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { publishGradeResults } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/**
 * Snapshot and publish the chosen students' results. Each guardian then sees
 * only their own child's result, through ParentStudentLink.
 */
export const POST = handler(async ({ actor, request }) =>
  publishGradeResults(actor, await jsonBody(request)),
);
