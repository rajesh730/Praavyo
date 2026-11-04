import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import PerformanceProgram from "@/models/PerformanceProgram";
import {
  applyProgramAction,
  canManageProgram,
  deleteProgram,
  loadProgram,
  populateProgram,
  serializeProgram,
} from "@/lib/performancePrograms";

const STAFF = ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"];

async function respond(session, id, message) {
  const program = await populateProgram(PerformanceProgram.findById(id));
  return successResponse(200, message, { program: serializeProgram(program, { session }) });
}

/** GET /api/programs/[id] — one program, for the school or an assigned teacher. */
export const GET = defineRoute({ roles: STAFF }, async ({ params, session }) => {
  const program = await loadProgram(params.id);
  if (!canManageProgram(session, program)) throw new APIError("Program not found", 404, "NOT_FOUND");
  return respond(session, program._id, "Program loaded");
});

/**
 * PATCH /api/programs/[id] — `{ action, ... }`. Actions: update, setTeachers,
 * addPerformance, updatePerformance, removePerformance, addPerformers,
 * removePerformer, markPerformer, lock, unlock, publish, unpublish.
 * See lib/performancePrograms.js for who may run each one.
 */
export const PATCH = defineRoute({ roles: STAFF }, async ({ request, params, session }) => {
  const body = await request.json().catch(() => null);
  if (!body?.action) throw new APIError("Invalid request", 400, "VALIDATION_ERROR");
  const program = await loadProgram(params.id);
  await applyProgramAction(session, program, body);
  return respond(session, program._id, "Program updated");
});

/** DELETE /api/programs/[id] — school only; removes its certificates too. */
export const DELETE = defineRoute({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }, async ({ params, session }) => {
  const program = await loadProgram(params.id);
  await deleteProgram(session, program);
  return successResponse(200, "Program deleted", { id: params.id });
});
