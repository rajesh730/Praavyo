import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { assignThemeExams, createExam, deleteExam, restoreExam, setCurrentExam, updateExam } from '@pravyo/cas/lib/casExamService';
import * as cas from '@/lib/exams/casEndpoints';

export const dynamic = 'force-dynamic';

// GET is shared with the teacher API (/api/teacher/exams/...): see lib/exams/.
export const GET = handler(cas.exams);
export const POST = handler(async ({ actor, request }) => createExam(actor, await jsonBody(request)));
export const PATCH = handler(async ({ actor, request }) => {
  const body = await jsonBody(request);
  if (body.action === 'restore') return restoreExam(actor, body);
  // { action: 'set-current', exam, current: true | false }
  if (body.action === 'set-current') return setCurrentExam(actor, body);
  return updateExam(actor, body);
});
export const PUT = handler(async ({ actor, request }) => assignThemeExams(actor, await jsonBody(request)));
export const DELETE = handler(async ({ actor, request }) => deleteExam(actor, await jsonBody(request)));
