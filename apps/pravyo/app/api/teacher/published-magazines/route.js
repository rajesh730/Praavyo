import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import MagazineIssue from "@/models/MagazineIssue";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { getTeacherMagazineSchool } from "@/lib/teacherMagazineDesk";

/** The final school magazine is readable by every active teacher at school. */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load published magazines" }, async ({ session }) => {
  const school = await getTeacherMagazineSchool(session);
  const issues = await MagazineIssue.find({ school, status: "PUBLISHED" })
    .sort({ publishedAt: -1, weekStart: -1 })
    .lean();
  const issueIds = issues.map((issue) => issue._id);
  const articles = issueIds.length
    ? await SchoolMagazineArticle.find({
        school,
        magazineIssue: { $in: issueIds },
        isMagazinePublished: true,
        isDeleted: { $ne: true },
      })
        .select("magazineIssue title category coverImage tags")
        .sort({ magazinePublishedAt: 1, publishedAt: 1 })
        .lean()
    : [];
  const articlesByIssue = new Map();
  articles.forEach((article) => {
    const key = String(article.magazineIssue);
    articlesByIssue.set(key, [...(articlesByIssue.get(key) || []), article]);
  });

  return NextResponse.json({
    issues: issues
      .map((issue) => {
        const issueArticles = articlesByIssue.get(String(issue._id)) || [];
        return {
          ...serializeMagazineIssue(issue),
          articleCount: issueArticles.length,
          coverArticle: issueArticles[0]
            ? {
                title: issueArticles[0].title,
                category: issueArticles[0].category,
                coverImage: issueArticles[0].coverImage || null,
                tags: issueArticles[0].tags || [],
              }
            : null,
        };
      })
      .filter((issue) => issue.articleCount > 0),
  });
});
