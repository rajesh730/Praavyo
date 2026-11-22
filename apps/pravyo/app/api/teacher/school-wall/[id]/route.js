import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import "@/models/Student";
import { serializeAuthoredEra } from "@/lib/writingProvenance";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";

export const dynamic = "force-dynamic";

// Only what the teacher's current school shows on its wall.
function wallFilter(school) {
  return {
    school,
    status: { $in: ["SUBMITTED", "APPROVED"] },
    showOnSchoolWall: { $ne: false },
    isDeleted: { $ne: true },
  };
}

function serializeArticle(article) {
  return {
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
          rollNumber: article.authorStudent.rollNumber,
        }
      : null,
  };
}

/** One School Wall post, read by a teacher of that school. */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load writing" }, async ({ session, params }) => {
  const school = session.user.schoolId;
  if (!school) throw new APIError("Choose the school you are working in", 409, "SCHOOL_REQUIRED");
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError("You no longer have access to this school", 403, "FORBIDDEN");
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    throw new APIError("Writing not found", 404, "NOT_FOUND");
  }

  const article = await SchoolMagazineArticle.findOne({ _id: params.id, ...wallFilter(school) })
    .populate("authorStudent", "name grade rollNumber")
    .lean();
  if (!article) throw new APIError("Writing not found", 404, "NOT_FOUND");

  const relatedArticles = await SchoolMagazineArticle.find({
    _id: { $ne: article._id },
    category: article.category,
    ...wallFilter(school),
  })
    .populate("authorStudent", "name grade rollNumber")
    .sort({ submittedAt: -1, updatedAt: -1 })
    .limit(3)
    .lean();

  return NextResponse.json({
    article: serializeArticle(article),
    relatedArticles: relatedArticles.map(serializeArticle),
  });
});
