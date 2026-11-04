import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import Student from "@/models/Student";
import UserSurfaceSeenState from "@/models/UserSurfaceSeenState";
import "@/models/MagazineIssue";
import { buildMagazineLifecycle } from "@/lib/lifecycle";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { buildPagination, escapeRegex, parsePagination } from "@/lib/pagination";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";

export async function GET(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "ALL").toUpperCase();
    const search = String(searchParams.get("search") || "").trim();
    const grade = String(searchParams.get("grade") || "ALL").trim();
    const year = Number.parseInt(searchParams.get("year") || "", 10);
    const { page, limit, skip } = parsePagination(searchParams, {
      limit: 20,
      maxLimit: 100,
    });

    // Free writing only: pieces sent to the magazine are handled inside
    // their magazine.
    const query = { school: session.user.id, isDeleted: { $ne: true }, submissionSource: { $ne: "MAGAZINE" } };
    if (status === "POSTED") {
      query.status = { $in: ["SUBMITTED", "APPROVED"] };
    } else if (status !== "ALL") {
      query.status = status;
    }
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { content: { $regex: safeSearch, $options: "i" } },
      ];
    }
    // Academic year = the session the student wrote it in (stamped on the
    // writing). Older writings without the stamp fall back to when they were
    // created; a session runs April to March.
    if (Number.isFinite(year)) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { authorAcademicYearStart: year },
            {
              authorAcademicYearStart: null,
              createdAt: { $gte: new Date(year, 3, 1), $lt: new Date(year + 1, 3, 1) },
            },
          ],
        },
      ];
    }
    if (grade && grade.toUpperCase() !== "ALL") {
      const gradeValues = getEquivalentGradeValues(grade);
      const studentIds = await Student.find({
        school: session.user.id,
        isDeleted: { $ne: true },
        grade: { $in: gradeValues },
      }).distinct("_id");
      query.authorStudent = { $in: studentIds };
    }

    // "New" = posted since the school last opened the wall (Instagram-style).
    const wallSeenState = await UserSurfaceSeenState.findOne({
      user: session.user.id,
      surface: "school.schoolWall",
    })
      .select("seenAt")
      .lean();
    const wallSeenAt = wallSeenState?.seenAt ? new Date(wallSeenState.seenAt) : null;

    const yearsPromise = SchoolMagazineArticle.aggregate([
      { $match: { school: new SchoolMagazineArticle.base.Types.ObjectId(String(session.user.id)), isDeleted: { $ne: true }, submissionSource: { $ne: "MAGAZINE" }, status: { $in: ["SUBMITTED", "APPROVED"] } } },
      {
        $group: {
          _id: {
            $ifNull: [
              "$authorAcademicYearStart",
              { $cond: [{ $gte: [{ $month: "$createdAt" }, 4] }, { $year: "$createdAt" }, { $subtract: [{ $year: "$createdAt" }, 1] }] },
            ],
          },
        },
      },
    ]);

    const [totalSubmissions, submissions, newCount, yearRows] = await Promise.all([
      SchoolMagazineArticle.countDocuments(query),
      SchoolMagazineArticle.find(query)
        .populate("authorStudent", "name grade rollNumber")
        .populate("magazineIssue")
        // Newest post first (the time the student posted it).
        .sort({ submittedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      wallSeenAt
        ? SchoolMagazineArticle.countDocuments({
            ...query,
            submittedAt: { $gt: wallSeenAt },
          })
        : Promise.resolve(0),
      yearsPromise,
    ]);
    const pagination = buildPagination({
      page,
      limit,
      total: totalSubmissions,
    });

    const isNewArticle = (article) =>
      Boolean(
        wallSeenAt &&
          article.submittedAt &&
          new Date(article.submittedAt) > wallSeenAt
      );

    return NextResponse.json({
      submissions: submissions.map((article) => ({
        id: String(article._id),
        title: article.title,
        content: article.content,
        category: article.category,
        // The school reviews the photo alongside the words before it goes live.
        images: article.images || [],
        coverImage: article.coverImage?.url ? article.coverImage : null,
        tags: article.tags || [],
        submissionSource: article.submissionSource || "FREE_WRITE",
        status: article.status,
        isNew: isNewArticle(article),
        // Per-post unread: a wall post the school has not opened/read yet.
        isUnread: article.status !== "DRAFT" && !article.schoolReadAt,
        schoolReadAt: article.schoolReadAt || null,
        showOnSchoolWall:
          article.status !== "DRAFT" && article.showOnSchoolWall !== false,
        isPublished: Boolean(article.isPublished),
        isMagazinePublished: Boolean(article.isMagazinePublished),
        isGlobalWallPublished: Boolean(article.isGlobalWallPublished),
        magazineIssue: serializeMagazineIssue(article.magazineIssue),
        magazineIssueAssignedAt: article.magazineIssueAssignedAt,
        submittedAt: article.submittedAt,
        firstSubmittedAt: article.firstSubmittedAt,
        lastResubmittedAt: article.lastResubmittedAt,
        reviewedAt: article.reviewedAt,
        updatedAt: article.updatedAt,
        lifecycle: buildMagazineLifecycle(article),
        authorStudent: article.authorStudent
          ? {
              id: String(article.authorStudent._id),
              name: article.authorStudent.name,
              grade: article.authorStudent.grade,
              rollNumber: article.authorStudent.rollNumber,
            }
          : null,
      })),
      pagination: {
        ...pagination,
        totalSubmissions,
      },
      newCount,
      years: yearRows.map((row) => row._id).filter((value) => Number.isFinite(value)).sort((a, b) => b - a),
    });
  } catch (error) {
    console.error("GET /api/school/magazine-submissions error:", error);
    return NextResponse.json(
      { message: "Failed to load school wall posts" },
      { status: 500 }
    );
  }
}
