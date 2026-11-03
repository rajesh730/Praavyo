import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { createExam, deleteExam, listExamGrades, listExams, updateExam } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// Without a grade: which grades the actor may open (null = every grade).
export const GET = handler(async ({ actor, query }) => (query.get('grade')
  ? listExams(actor, { academicYear: query.get('academicYear') || undefined, grade: query.get('grade') })
  : { grades: await listExamGrades(actor) }));

export const POST = handler(async ({ actor, request }) => createExam(actor, await jsonBody(request)));
export const PATCH = handler(async ({ actor, request }) => updateExam(actor, await jsonBody(request)));
export const DELETE = handler(async ({ actor, request }) => deleteExam(actor, await jsonBody(request)));
