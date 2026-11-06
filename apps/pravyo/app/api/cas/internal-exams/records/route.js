import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { loadRecords, saveRecords } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// Attendance and extra activities for one internal exam (school admin only).
export const GET = handler(({ actor, query }) => loadRecords(actor, {
  exam: query.get('exam') || '',
  section: query.get('section') || '',
}));

export const POST = handler(async ({ actor, request }) => saveRecords(actor, await jsonBody(request)));
