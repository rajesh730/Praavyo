import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { publishExam, unpublishExam } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// { exam, publish: true } publishes every card; { exam, publish: false } takes them down.
export const POST = handler(async ({ actor, request }) => {
  const body = await jsonBody(request);
  return body.publish === false ? unpublishExam(actor, body) : publishExam(actor, body);
});
