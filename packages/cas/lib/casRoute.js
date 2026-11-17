import { ZodError } from 'zod';
import { getActor, errorResponse, ok, HttpError } from './casAccess.js';
import { firstIssue } from './casValidation.js';
import { CasDateError } from '@pravyo/core/casDates';

const LIBRARY_PATHS = ['/api/cas/context', '/api/cas/curriculum'];

/**
 * Wrap a route handler: resolve the actor, check they may use this API,
 * normalize errors, standardize the response envelope.
 *
 * Every private CAS route goes through one of the two wrappers below, which is
 * what makes the "authorize on the server, every time" rule structural rather
 * than a habit: there is no way to add a route that skips the actor lookup
 * without noticing.
 *
 * Two doors, one set of rules:
 *   - `handler`        the SCHOOL's API (/api/cas/...). School admins only.
 *   - `teacherHandler` the TEACHER's API (/api/teacher/exams/...). Teachers only.
 * Both call the same endpoint definitions (apps/pravyo/lib/exams/*Endpoints.js)
 * and the same services, so marks a teacher saves are the very records the
 * school, results and report cards read. The services still decide what each
 * teacher may see and change (their grades, their subjects).
 */
function wrap(fn, { allows, refusal }) {
  return async function route(request, context) {
    try {
      const actor = await getActor();
      if (!allows(actor)) throw new HttpError(refusal, 403);
      // The default theme library may only be read and edited as curriculum.
      if (actor.library && !LIBRARY_PATHS.some((path) => new URL(request.url).pathname.startsWith(path))) {
        throw new HttpError('The default theme library only has a curriculum', 403);
      }
      const params = context?.params ? await context.params : {};
      const result = await fn({ actor, request, params, query: searchParams(request) });
      // A handler may return a Response directly (file downloads, redirects).
      return result instanceof Response ? result : ok(result);
    } catch (error) {
      return errorResponse(normalize(error));
    }
  };
}

/** The school's assessment API. Teachers have their own (teacherHandler). */
export function handler(fn) {
  return wrap(fn, {
    allows: (actor) => actor.role === 'SCHOOL_ADMIN',
    refusal: 'Teachers enter marks from their own dashboard (Exams).',
  });
}

/** The teacher's assessment API: mark entry and progress for their own classes. */
export function teacherHandler(fn) {
  return wrap(fn, {
    allows: (actor) => actor.role === 'TEACHER',
    refusal: 'This is the teacher assessment API. School accounts use the school area.',
  });
}

function searchParams(request) {
  return new URL(request.url).searchParams;
}

/** Read and parse a JSON body, rejecting anything that is not an object. */
export async function jsonBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError('Send a valid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError('Send a valid JSON object');
  }
  return body;
}

/** Turn validation and domain failures into HTTP errors with usable messages. */
function normalize(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError) return new HttpError(firstIssue(error), 400);
  if (error instanceof CasDateError) return new HttpError(error.message, 400);
  // Services throw plain Errors with a `status` for expected failures.
  if (typeof error?.status === 'number') {
    return new HttpError(error.message, error.status);
  }
  if (error?.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0];
    return new HttpError(first?.message || 'The submitted data was not valid', 400);
  }
  if (error?.code === 11000) {
    return new HttpError('That record already exists', 409);
  }
  if (error?.name === 'CastError') {
    return new HttpError('Invalid record identifier', 400);
  }
  return error;
}

export { ok, HttpError };
