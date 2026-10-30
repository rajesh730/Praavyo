import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { createOutcome, updateOutcome, deleteOutcome } from '@pravyo/cas/lib/casCurriculumService';

export const dynamic = 'force-dynamic';

export const POST = handler(async ({ actor, request }) =>
  createOutcome(actor, await jsonBody(request)),
);
export const PATCH = handler(async ({ actor, request }) =>
  updateOutcome(actor, await jsonBody(request)),
);
export const DELETE = handler(async ({ actor, request }) =>
  deleteOutcome(actor, await jsonBody(request)),
);
