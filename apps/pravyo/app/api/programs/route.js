import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import { getSessionSchoolId } from "@/lib/authz";
import PerformanceProgram from "@/models/PerformanceProgram";
import {
  createProgram,
  populateProgram,
  serializeProgram,
} from "@/lib/performancePrograms";

/**
 * GET  /api/programs — the school's performance programs.
 *   School admin: every program. Teacher: only programs assigned to them.
 *   ?year=<academicYearStart> filters by session; ?upcoming=1 keeps only
 *   programs from today on (used by the Overview countdown).
 * POST /api/programs — school admin creates a program.
 */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"] },
  async ({ request, session }) => {
    const schoolId = getSessionSchoolId(session);
    if (!schoolId) return successResponse(200, "Programs loaded", { programs: [], years: [] });

    const url = new URL(request.url);
    const filter = { school: schoolId };
    if (session.user.role === "TEACHER") filter.assignedTeachers = session.user.id;

    const years = (await PerformanceProgram.distinct("academicYear", filter)).filter(Boolean);

    const year = url.searchParams.get("year");
    if (year) filter.academicYear = year;
    if (url.searchParams.get("upcoming") === "1") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filter.date = { $gte: today };
    }

    // The list shows the newest program first; the Overview countdown
    // (?upcoming=1) shows the soonest first.
    const programs = await populateProgram(
      PerformanceProgram.find(filter).sort(
        url.searchParams.get("upcoming") === "1" ? { date: 1 } : { createdAt: -1, _id: -1 }
      )
    );

    return successResponse(200, "Programs loaded", {
      programs: programs.map((program) => serializeProgram(program, { session })),
      years: years.sort().reverse(),
    });
  }
);

export const POST = defineRoute(
  { roles: ["SCHOOL_ADMIN"] },
  async ({ request, session }) => {
    const body = await request.json().catch(() => null);
    if (!body) throw new APIError("Invalid request", 400, "VALIDATION_ERROR");
    const program = await createProgram(session, body);
    const populated = await populateProgram(PerformanceProgram.findById(program._id));
    return successResponse(201, "Program created", {
      program: serializeProgram(populated, { session }),
    });
  }
);
