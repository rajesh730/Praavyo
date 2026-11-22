import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import Student from "@/models/Student";
import "@/models/MagazineIssue";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { APIError } from "@/lib/apiResponse";
import { buildMagazineLifecycle } from "@/lib/lifecycle";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { buildPagination, escapeRegex, parsePagination } from "@/lib/pagination";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";
import { normalizeWritingCategory } from "@/lib/writingCategories";
import { normalizeWritingTags } from "@/lib/writingTags";

/**
 * The Free Writing side of the Publishing Desk, shared by the school
 * (/api/school/magazine-submissions, every grade) and class teachers
 * (/api/teacher/publishing, only the grades they are class teacher of).
 * Writing sent to the magazine is handled inside its magazine, not here.
 */

export const POSTED_STATUSES = ["SUBMITTED", "APPROVED"];

export function freeWritingQuery(school) {
  return { school, isDeleted: { $ne: true }, submissionSource: { $ne: "MAGAZINE" } };
}

/** Grades a teacher is class teacher of at this school (Teachers page). */
export async function classTeacherGrades(teacherId, school) {
  const rows = await TeacherTeachingAssignment.find({ school, teacher: teacherId, assignmentType: "CLASS_TEACHER" })
    .select("grade")
    .lean();
  return [...new Set(rows.map((row) => row.grade))];
}

export function gradeValuesFor(grades) {
  return [...new Set(grades.flatMap((grade) => getEquivalentGradeValues(grade)))];
}

/** Whether `grade` (any spelling) is one of `grades`. */
export function isGradeAllowed(grade, grades) {
  const allowed = gradeValuesFor(grades);
  return getEquivalentGradeValues(grade).some((value) => allowed.includes(value));
}

function studentIdsInGrades(school, grades) {
  return Student.find({
    school,
    isDeleted: { $ne: true },
    grade: { $in: gradeValuesFor(grades) },
  }).distinct("_id");
}

/**
 * Writing belongs to the grade it was WRITTEN in (the authorGrade snapshot),
 * not the author's grade today. Otherwise, after promotion, the Grade 3 desk
 * would fill with last year's Grade 2 writing and lose its own, and writing
 * by a student who later transfers out would drop off its grade's desk.
 * Older writings without the snapshot fall back to the author's current grade.
 * Returns a condition for `$and`.
 */
export async function writingGradeFilter(school, grades) {
  return {
    $or: [
      { authorGrade: { $in: gradeValuesFor(grades) } },
      { authorGrade: { $in: [null, ""] }, authorStudent: { $in: await studentIdsInGrades(school, grades) } },
    ],
  };
}

/** The same rule as writingGradeFilter, for one writing already loaded. */
export async function isWritingInGrades(article, grades, school) {
  if (!grades?.length) return false;
  const writtenIn = String(article.authorGrade || "").trim();
  if (writtenIn) return isGradeAllowed(writtenIn, grades);
  if (!article.authorStudent) return false;
  return Boolean(await Student.exists({
    _id: article.authorStudent,
    school,
    isDeleted: { $ne: true },
    grade: { $in: gradeValuesFor(grades) },
  }));
}

/** Students who wrote Free Writing at this school whose name matches. */
async function authorIdsMatching(school, safeSearch) {
  const authorIds = await SchoolMagazineArticle.distinct("authorStudent", freeWritingQuery(school));
  if (!authorIds.length) return [];
  return Student.find({ _id: { $in: authorIds }, name: { $regex: safeSearch, $options: "i" } }).distinct("_id");
}

function serializeFreeWriting(article, { wallSeenAt, trackUnread }) {
  return {
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
    isNew: Boolean(wallSeenAt && article.submittedAt && new Date(article.submittedAt) > wallSeenAt),
    // Per-post unread is the school's own marker; a teacher never clears it,
    // so the teacher's view does not show it.
    isUnread: trackUnread && article.status !== "DRAFT" && !article.schoolReadAt,
    schoolReadAt: article.schoolReadAt || null,
    showOnSchoolWall: article.status !== "DRAFT" && article.showOnSchoolWall !== false,
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
  };
}

/**
 * One page of Free Writing for `school`, filtered by the request's status,
 * search, grade and year. `allowedGrades` (class teachers) limits it to
 * students of those grades; a grade outside them is refused.
 */
export async function listFreeWriting({ school, searchParams, allowedGrades = null, wallSeenAt = null, trackUnread = true }) {
  const status = String(searchParams.get("status") || "ALL").toUpperCase();
  const search = String(searchParams.get("search") || "").trim();
  const grade = String(searchParams.get("grade") || "ALL").trim();
  const year = Number.parseInt(searchParams.get("year") || "", 10);
  const { page, limit, skip } = parsePagination(searchParams, { limit: 20, maxLimit: 100 });

  const query = freeWritingQuery(school);
  if (status === "POSTED") {
    query.status = { $in: POSTED_STATUSES };
  } else if (status !== "ALL") {
    query.status = status;
  }
  // The box says "title or student": match the title, the text, or the
  // student's name.
  if (search) {
    const safeSearch = escapeRegex(search);
    const matchingAuthors = await authorIdsMatching(school, safeSearch);
    query.$or = [
      { title: { $regex: safeSearch, $options: "i" } },
      { content: { $regex: safeSearch, $options: "i" } },
      ...(matchingAuthors.length ? [{ authorStudent: { $in: matchingAuthors } }] : []),
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

  const wantsOneGrade = grade && grade.toUpperCase() !== "ALL";
  if (allowedGrades && wantsOneGrade && !isGradeAllowed(grade, allowedGrades)) {
    throw new APIError("You are not the class teacher of this grade", 403, "FORBIDDEN");
  }
  // The year list covers everything this viewer may see, whatever grade is picked.
  const scopeFilter = allowedGrades ? await writingGradeFilter(school, allowedGrades) : null;
  const gradeFilter = wantsOneGrade ? await writingGradeFilter(school, [grade]) : scopeFilter;
  if (gradeFilter) query.$and = [...(query.$and || []), gradeFilter];

  const yearsPromise = SchoolMagazineArticle.aggregate([
    {
      $match: {
        school: new SchoolMagazineArticle.base.Types.ObjectId(String(school)),
        isDeleted: { $ne: true },
        submissionSource: { $ne: "MAGAZINE" },
        status: { $in: POSTED_STATUSES },
        ...(scopeFilter ? { $and: [scopeFilter] } : {}),
      },
    },
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
      ? SchoolMagazineArticle.countDocuments({ ...query, submittedAt: { $gt: wallSeenAt } })
      : Promise.resolve(0),
    yearsPromise,
  ]);

  return {
    submissions: submissions.map((article) => serializeFreeWriting(article, { wallSeenAt, trackUnread })),
    pagination: { ...buildPagination({ page, limit, total: totalSubmissions }), totalSubmissions },
    newCount,
    years: yearRows.map((row) => row._id).filter((value) => Number.isFinite(value)).sort((a, b) => b - a),
  };
}

/**
 * A school or class-teacher correction of a writing: title, text, type, tags.
 * Returns `{ error }` for a bad edit, otherwise the `changes` to $set.
 */
export function validateWritingEdit(body, article) {
  const title = String(body.title ?? article.title).trim();
  const content = String(body.content ?? article.content).trim();
  if (!title) return { error: "The writing needs a title." };
  if (!content) return { error: "The writing cannot be empty." };
  if (title.length > 180) return { error: "The title can be at most 180 characters." };
  if (content.length > 50000) return { error: "The writing can be at most 50,000 characters." };
  const changes = {
    title,
    content,
    category: normalizeWritingCategory(body.category ?? article.category),
    schoolEditedAt: new Date(),
  };
  if (body.tags !== undefined) changes.tags = normalizeWritingTags(body.tags);
  return { changes };
}
