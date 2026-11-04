import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import { isActiveStudentQuery } from "@/lib/authz";
import Student from "@/models/Student";
import { canManageProgram, loadProgram } from "@/lib/performancePrograms";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/programs/[id]/students?q=&grade= — active students of the
 * program's school, for picking performers. Max 50 per search.
 */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"] },
  async ({ request, params, session }) => {
    const program = await loadProgram(params.id);
    if (!canManageProgram(session, program)) throw new APIError("Program not found", 404, "NOT_FOUND");

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
    const grade = String(url.searchParams.get("grade") || "").trim();

    const filter = isActiveStudentQuery({ school: program.school });
    if (grade) filter.grade = grade;
    if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };

    const [students, grades] = await Promise.all([
      Student.find(filter)
        .select("name grade section rollNumber")
        .sort({ grade: 1, section: 1, name: 1 })
        .limit(50)
        .lean(),
      Student.distinct("grade", isActiveStudentQuery({ school: program.school })),
    ]);

    return successResponse(200, "Students loaded", {
      students: students.map((s) => ({
        _id: String(s._id),
        name: s.name,
        grade: s.grade || "",
        section: s.section || "",
        rollNumber: s.rollNumber || "",
      })),
      grades: grades.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    });
  }
);
