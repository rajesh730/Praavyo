import connectDB from "@/lib/db";
import Student from "@/models/Student";
import { successResponse, internalServerError } from "@/lib/apiResponse";
import { requireParentChild } from "@/lib/parentAccess";
import { loadChildProgress } from "@pravyo/cas/lib/casProgressAccess";
import { buildStudentSubjectProgress } from "@pravyo/cas/lib/casSheetService";

export const dynamic = "force-dynamic";

/**
 * A guardian's view of their own child's continuous-assessment progress this
 * year (Grades 1–5): each subject, each theme's achievement and the level per
 * learning outcome. Only children linked to this guardian, and only with
 * portfolio access — the same gate as the rest of "My Child".
 */
export async function GET(request) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId");
    const { student, error } = await requireParentChild(studentId, "canViewPortfolio");
    if (error) return error;

    await connectDB();
    // The access check's select has no section or optional-subject choices.
    const row = await Student.findById(student._id)
      .select("school section subjectChoices enrollments")
      .lean();
    const progress = await loadChildProgress({ ...row, _id: student._id }, buildStudentSubjectProgress);
    return successResponse(200, "Progress loaded", progress);
  } catch (err) {
    console.error("GET /api/parent/progress error:", err);
    return internalServerError("Failed to load progress");
  }
}
