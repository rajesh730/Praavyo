import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { saveMarks } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

export const PUT = handler(async ({ actor, request }) => saveMarks(actor, await jsonBody(request)));
