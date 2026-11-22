import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import "@/models/MagazineIssue";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";

/** Magazine submissions only, restricted to students of the teacher's class. */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load class magazine writing" }, async ({ session }) => {
  const scope = await getTeacherMagazineScope(session);
  const articles = await SchoolMagazineArticle.find({
    school: scope.school,
    authorStudent: { $in: scope.studentIds },
    submissionSource: "MAGAZINE",
    status: { $in: ["SUBMITTED", "APPROVED"] },
    isDeleted: { $ne: true },
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
      status: article.status,
      isMagazinePublished: Boolean(article.isMagazinePublished),
      classTeacherSelectedAt: article.classTeacherSelectedAt || null,
      requestedIssue: serializeMagazineIssue(article.requestedIssue),
      magazineIssue: serializeMagazineIssue(article.magazineIssue),
      authorStudent: article.authorStudent ? { id: String(article.authorStudent._id), name: article.authorStudent.name, grade: article.authorStudent.grade, rollNumber: article.authorStudent.rollNumber } : null,
    })),
  });
});
