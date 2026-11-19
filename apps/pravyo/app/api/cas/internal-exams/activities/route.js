import { jsonBody } from '@pravyo/cas/lib/casRoute';
import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { getActivities, saveActivities } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// The school's extra-activity list (names + full marks), used by every
// internal exam. School admin only.
export const GET = internalExamHandler(({ actor }) => getActivities(actor));
export const PUT = internalExamHandler(async ({ actor, request }) => saveActivities(actor, await jsonBody(request)));
