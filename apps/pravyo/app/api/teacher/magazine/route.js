import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";

/**
 * Magazine submissions by the teacher's class grades, for the magazines still
 * open for writing — the only ones a class teacher can work on. Closed and
 * published magazines are left out so the list does not grow every year.
 */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load class magazine writing" }, async ({ session }) => {
  const scope = await getTeacherMagazineScope(session);
  const openIssueIds = await MagazineIssue.find({
    school: scope.school,
    status: "DRAFT",
    acceptingSubmissions: true,
  }).distinct("_id");
  if (!openIssueIds.length) return NextResponse.json({ articles: [] });

  const articles = await SchoolMagazineArticle.find({
    school: scope.school,
    requestedIssue: { $in: openIssueIds },
    submissionSource: "MAGAZINE",
    status: { $in: ["SUBMITTED", "APPROVED"] },
    isDeleted: { $ne: true },
    $and: [scope.writingFilter],
  })
    .populate("authorStudent", "name grade rollNumber")
    .populate("requestedIssue")
    .populate("magazineIssue")
    .sort({ submittedAt: -1, createdAt: -1, _id: -1 })
    .lean();
  return NextResponse.json({
    articles: articles.map((article) => ({
      id: String(article._id),
      title: article.title,
      category: article.category,
      content: article.content,
      // The teacher sees the student's photos before selecting the writing.
      images: article.images || [],
      coverImage: article.coverImage?.url ? article.coverImage : null,
      tags: article.tags || [],
      status: article.status,
      isMagazinePublished: Boolean(article.isMagazinePublished),
      classTeacherSelectedAt: article.classTeacherSelectedAt || null,
      requestedIssue: serializeMagazineIssue(article.requestedIssue),
      magazineIssue: serializeMagazineIssue(article.magazineIssue),
      authorStudent: article.authorStudent ? { id: String(article.authorStudent._id), name: article.authorStudent.name, grade: article.authorStudent.grade, rollNumber: article.authorStudent.rollNumber } : null,
    })),
  });
});
