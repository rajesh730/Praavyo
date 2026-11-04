import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import Student from "@/models/Student";
import { buildStudentLookupForSession } from "@/lib/studentIdentity";
import { listOpenMagazineIssues } from "@/lib/magazineIssues";

export const dynamic = "force-dynamic";

/**
 * GET /api/student/magazine-issues — the magazines of the student's school
 * that are open for writing (created, not yet published). Shown in the
 * writing form when a student chooses "Send to: School magazine".
 */
export async function GET() {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || session.user.role !== "STUDENT") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const student = await Student.findOne({ ...buildStudentLookupForSession(session), isDeleted: { $ne: true } })
      .select("school")
      .lean();
    const issues = await listOpenMagazineIssues(student?.school);

    return NextResponse.json({
      issues: issues.map((issue) => ({ id: issue.id, title: issue.title, monthLabel: issue.monthLabel })),
    });
  } catch (error) {
    console.error("GET /api/student/magazine-issues error:", error);
    return NextResponse.json({ message: "Failed to load magazines" }, { status: 500 });
  }
}
