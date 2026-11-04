import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import PerformanceProgram from "@/models/PerformanceProgram";
import Achievement from "@/models/Achievement";
import {
  applyStudentAction,
  isPerformanceLocked,
  loadProgram,
  programStage,
} from "@/lib/performancePrograms";

/**
 * GET  /api/student/programs — the student's school programs that are still
 *      ahead or that the student took part in, plus their certificates.
 * POST /api/student/programs — `{ programId, performanceId, action: join|leave }`
 *      while the participant list is open.
 *
 * Students only see performance names and their own place in them, never the
 * other performers' details.
 */
export const GET = defineRoute({ roles: ["STUDENT"] }, async ({ session }) => {
  const studentId = String(session.user.id);
  const schoolId = session.user.schoolId;
  if (!schoolId) return successResponse(200, "Programs loaded", { programs: [] });

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [programs, certificates] = await Promise.all([
    PerformanceProgram.find({
      school: schoolId,
      $or: [{ date: { $gte: since } }, { "performances.performers.student": studentId }],
    })
      .sort({ date: -1 })
      .limit(30)
      .lean(),
    Achievement.find({ student: studentId, program: { $ne: null } })
      .select("program performanceId certificateUrl certificateCode")
      .lean(),
  ]);

  const certificateFor = new Map(
    certificates.map((c) => [`${c.program}:${c.performanceId}`, c])
  );

  return successResponse(200, "Programs loaded", {
    programs: programs.map((program) => ({
      _id: String(program._id),
      title: program.title,
      description: program.description || "",
      venue: program.venue || "",
      date: program.date,
      academicYear: program.academicYear || "",
      stage: programStage(program),
      performances: (program.performances || []).map((performance) => {
        const mine = (performance.performers || []).find((p) => String(p.student) === studentId);
        const certificate = certificateFor.get(`${program._id}:${performance._id}`);
        return {
          _id: String(performance._id),
          title: performance.title,
          performanceType: performance.performanceType,
          locked: isPerformanceLocked(program, performance),
          performerCount: (performance.performers || []).length,
          joined: Boolean(mine),
          myStatus: mine?.status || "",
          certificateUrl: certificate?.certificateUrl || "",
          certificateCode: certificate?.certificateCode || "",
        };
      }),
    })),
  });
});

export const POST = defineRoute({ roles: ["STUDENT"] }, async ({ request, session }) => {
  const body = await request.json().catch(() => null);
  if (!body?.programId || !body?.performanceId) {
    throw new APIError("Invalid request", 400, "VALIDATION_ERROR");
  }
  const program = await loadProgram(body.programId);
  await applyStudentAction(session, program, body);
  return successResponse(200, body.action === "join" ? "You are in" : "Removed", { ok: true });
});
