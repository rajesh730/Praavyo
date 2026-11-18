import { jsonBody } from '@pravyo/cas/lib/casRoute';
import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { createExam, deleteExam, updateExam } from '@pravyo/cas/lib/internalExamService';
import * as internal from '@/lib/exams/internalExamEndpoints';

export const dynamic = 'force-dynamic';

// GET is shared with the teacher API (/api/teacher/exams/...): see lib/exams/.
export const GET = internalExamHandler(internal.examsOrGrades);
export const POST = internalExamHandler(async ({ actor, request }) => createExam(actor, await jsonBody(request)));
export const PATCH = internalExamHandler(async ({ actor, request }) => updateExam(actor, await jsonBody(request)));
export const DELETE = internalExamHandler(async ({ actor, request }) => deleteExam(actor, await jsonBody(request)));
