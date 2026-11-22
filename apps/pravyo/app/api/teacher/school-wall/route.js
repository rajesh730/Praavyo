import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import "@/models/Student";
import { serializeAuthoredEra } from "@/lib/writingProvenance";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";

export const dynamic = "force-dynamic";

/**
 * The School Wall for the school chosen in the teacher's session: the same
 * posts students of that school read on /student/school-wall. Access follows
 * TeacherMembership, never Teacher.school.
 */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load school wall" }, async ({ session }) => {
  const school = session.user.schoolId;
  if (!school) throw new APIError("Choose the school you are working in", 409, "SCHOOL_REQUIRED");
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError("You no longer have access to this school", 403, "FORBIDDEN");
  }

  const articles = await SchoolMagazineArticle.find({
    school,
    status: { $in: ["SUBMITTED", "APPROVED"] },
    showOnSchoolWall: { $ne: false },
    isDeleted: { $ne: true },
  })
    .populate("authorStudent", "name grade")
    .sort({ submittedAt: -1, updatedAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({
    items: articles.map((article) => ({
      id: String(article._id),
      title: article.title,
      content: article.content,
      images: article.images || [],
      coverImage: article.coverImage || null,
      tags: article.tags || [],
      category: article.category,
      publishedAt: article.publishedAt || article.submittedAt || article.updatedAt,
      ...serializeAuthoredEra(article),
      authorStudent: article.authorStudent
        ? {
            id: String(article.authorStudent._id),
            name: article.authorStudent.name,
            grade: article.authorStudent.grade,
          }
        : null,
    })),
  });
});
