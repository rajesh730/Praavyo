import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { createSubject, updateSubject, deleteSubject } from '@pravyo/cas/lib/casCurriculumService';

export const dynamic = 'force-dynamic';

export const POST = handler(async ({ actor, request }) =>
  createSubject(actor, await jsonBody(request)),
);
export const PATCH = handler(async ({ actor, request }) =>
  updateSubject(actor, await jsonBody(request)),
);
export const DELETE = handler(async ({ actor, request }) =>
  deleteSubject(actor, await jsonBody(request)),
);
