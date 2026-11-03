import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { unpublishExamResults } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/** Unpublish (delete) a whole exam's report cards for one grade. */
export const POST = handler(async ({ actor, request }) =>
  unpublishExamResults(actor, await jsonBody(request)),
);
