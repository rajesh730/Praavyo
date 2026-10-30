import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { unpublishGradeResults } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/** Take the chosen students' published results back from parents and students. */
export const POST = handler(async ({ actor, request }) =>
  unpublishGradeResults(actor, await jsonBody(request)),
);
