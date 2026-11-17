import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { createExam, deleteExam, updateExam } from '@pravyo/cas/lib/internalExamService';
import * as internal from '@/lib/exams/internalExamEndpoints';

export const dynamic = 'force-dynamic';

// GET is shared with the teacher API (/api/teacher/exams/...): see lib/exams/.
export const GET = handler(internal.examsOrGrades);
export const POST = handler(async ({ actor, request }) => createExam(actor, await jsonBody(request)));
export const PATCH = handler(async ({ actor, request }) => updateExam(actor, await jsonBody(request)));
export const DELETE = handler(async ({ actor, request }) => deleteExam(actor, await jsonBody(request)));
