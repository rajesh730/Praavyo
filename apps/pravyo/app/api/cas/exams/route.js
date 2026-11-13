import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { assignThemeExams, createExam, deleteExam, listExams, restoreExam, setCurrentExam, updateExam } from '@pravyo/cas/lib/casExamService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => listExams(actor, {
  academicYear: query.get('academicYear') || undefined,
  grade: query.get('grade') || undefined,
  includeArchived: query.get('includeArchived') === 'true',
}));

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
