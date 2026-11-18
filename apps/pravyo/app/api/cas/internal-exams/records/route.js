import { jsonBody } from '@pravyo/cas/lib/casRoute';
import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { loadRecords, saveRecords } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// Attendance and extra activities for one internal exam (school admin only).
export const GET = internalExamHandler(({ actor, query }) => loadRecords(actor, {
  exam: query.get('exam') || '',
  section: query.get('section') || '',
}));

export const POST = internalExamHandler(async ({ actor, request }) => saveRecords(actor, await jsonBody(request)));
