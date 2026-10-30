import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { publishReports } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/**
 * DRAFT -> PUBLISHED. Published reports become visible in the existing Pravyo
 * parent and student dashboards; nothing is copied to another database.
 */
export const POST = handler(async ({ actor, request }) =>
  publishReports(actor, await jsonBody(request)),
);
