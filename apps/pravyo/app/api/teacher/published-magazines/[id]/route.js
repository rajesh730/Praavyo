import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import MagazineIssue from "@/models/MagazineIssue";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { serializeAuthoredEra } from "@/lib/writingProvenance";
import { getTeacherMagazineSchool } from "@/lib/teacherMagazineDesk";

function serializeArticle(article) {
  return {
    id: String(article._id),
    title: article.title,
    content: article.content,
    images: article.images || [],
    coverImage: article.coverImage || null,
    tags: article.tags || [],
    category: article.category,
    publishedAt: article.publishedAt || article.magazinePublishedAt || article.updatedAt,
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

export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load published magazine" }, async ({ session, params }) => {
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    throw new APIError("Magazine not found", 404, "NOT_FOUND");
  }
  const school = await getTeacherMagazineSchool(session);
  const issue = await MagazineIssue.findOne({
    _id: params.id,
    school,
    status: "PUBLISHED",
  }).lean();
  if (!issue) throw new APIError("Magazine not found", 404, "NOT_FOUND");

  const articles = await SchoolMagazineArticle.find({
    school,
    magazineIssue: issue._id,
    isMagazinePublished: true,
    isDeleted: { $ne: true },
  })
    .populate("authorStudent", "name grade rollNumber")
    .sort({ magazinePublishedAt: 1, publishedAt: 1, updatedAt: 1 })
    .lean();

  if (!articles.length) throw new APIError("This magazine has no published writing yet", 404, "NOT_FOUND");
  return NextResponse.json({
    issue: serializeMagazineIssue(issue),
    articles: articles.map(serializeArticle),
  });
});
