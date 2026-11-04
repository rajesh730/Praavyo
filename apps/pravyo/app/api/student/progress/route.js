import connectDB from "@/lib/db";
import Student from "@/models/Student";
import { successResponse, errorResponse, internalServerError } from "@/lib/apiResponse";
import { requireApiSession } from "@/lib/authz";
import { buildStudentLookupForSession } from "@/lib/studentIdentity";
import { loadChildProgress } from "@pravyo/cas/lib/casProgressAccess";
import { buildStudentSubjectProgress } from "@pravyo/cas/lib/casSheetService";

export const dynamic = "force-dynamic";

/**
 * The signed-in student's own progress this year, from PUBLISHED results
 * only — the same view their parents have (Grades 1–5, CAS).
 */
export async function GET() {
  try {
    const { session, error } = await requireApiSession(["STUDENT"]);
    if (error) return error;
    await connectDB();
    const row = await Student.findOne({ ...buildStudentLookupForSession(session), isDeleted: { $ne: true } })
      .select("school section subjectChoices enrollments")
      .lean();
    if (!row) return errorResponse(404, "Student record not found.");
    const progress = await loadChildProgress(row, buildStudentSubjectProgress, { role: "STUDENT" });
    return successResponse(200, "Progress loaded", progress);
  } catch (err) {
    console.error("GET /api/student/progress error:", err);
    return internalServerError("Failed to load progress");
  }
}
