import { jsonBody } from '@pravyo/cas/lib/casRoute';
import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { getScheme, saveScheme, useCurrentScheme } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// A grade's marks structure (TH/INT split + internal fields), used by every
// internal exam of the grade. School admin only: teachers get the structure
// with the mark sheet and can never change it.
export const GET = internalExamHandler(({ actor, query }) => getScheme(actor, { grade: query.get('grade') || '' }));
export const PUT = internalExamHandler(async ({ actor, request }) => saveScheme(actor, await jsonBody(request)));
// { exam }: a once-published, now unpublished exam goes back to the current structure.
export const POST = internalExamHandler(async ({ actor, request }) => useCurrentScheme(actor, await jsonBody(request)));
