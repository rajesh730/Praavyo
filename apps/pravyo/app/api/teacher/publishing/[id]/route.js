import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { recordLifecycleAudit } from "@/lib/lifecycle";
import {
  POSTED_STATUSES,
  classTeacherGrades,
  freeWritingQuery,
  isWritingInGrades,
  validateWritingEdit,
} from "@/lib/freeWritingDesk";
import { getTeacherMagazineSchool } from "@/lib/teacherMagazineDesk";
import { notifySchoolWallShown } from "@/lib/schoolWallNotifications";

export const dynamic = "force-dynamic";

// The switches a class teacher has, the same as the school's Free Writing
// tab. "Global wall" is the public home page and the cross-school wall as one
// switch, exactly as in PATCH /api/school/magazine/[id].
const WALL_ACTIONS = {
  SHOW_SCHOOL_WALL: {
    updates: () => ({ showOnSchoolWall: true }),
    message: "Writing shown on the school wall",
  },
  HIDE_SCHOOL_WALL: {
    updates: () => ({ showOnSchoolWall: false }),
    message: "Writing hidden from the school wall",
  },
  PUBLISH_HOMEPAGE: {
    updates: (article) => ({
      isPublished: true,
      publishedAt: article.publishedAt || new Date(),
      isGlobalWallPublished: true,
      status: "APPROVED",
    }),
    message: "Writing shown on the global wall",
  },
  UNPUBLISH_HOMEPAGE: {
    updates: () => ({ isPublished: false, publishedAt: null, isGlobalWallPublished: false }),
    message: "Writing hidden from the global wall",
  },
};

const AUDITED_FIELDS = ["showOnSchoolWall", "isPublished", "publishedAt", "isGlobalWallPublished", "status"];

/**
 * A class teacher manages one Free Writing post by a student of their own
 * class grade: school wall, global wall, or a correction of the text.
 */
export const PATCH = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to update writing" }, async ({ request, params, session }) => {
  const school = await getTeacherMagazineSchool(session);
  if (!mongoose.Types.ObjectId.isValid(params.id)) throw new APIError("Writing not found", 404, "NOT_FOUND");

  const article = await SchoolMagazineArticle.findOne({
    _id: params.id,
    ...freeWritingQuery(school),
    status: { $in: POSTED_STATUSES },
  });
  if (!article) throw new APIError("Writing not found", 404, "NOT_FOUND");

  // It must be written in a grade this teacher is class teacher of.
  const grades = await classTeacherGrades(session.user.id, school);
  if (!await isWritingInGrades(article, grades, school)) {
    throw new APIError("This writing is not from a grade you are class teacher of", 403, "FORBIDDEN");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    throw new APIError("Invalid JSON in request body", 400, "BAD_REQUEST");
  }
  const action = String(body.action || "").toUpperCase();

  if (action === "EDIT") {
    const { error, changes } = validateWritingEdit(body, article);
    if (error) throw new APIError(error, 400, "BAD_REQUEST");
    await SchoolMagazineArticle.updateOne({ _id: article._id, school }, { $set: changes });
    await recordLifecycleAudit({
      entityType: "SchoolMagazineArticle",
      entityId: article._id,
      action: "TEACHER_EDIT",
      session,
      before: { title: article.title, category: article.category },
      after: { title: changes.title, category: changes.category },
    });
    return NextResponse.json({
      message: "Changes saved. They show everywhere this writing appears.",
      article: {
        id: String(article._id),
        title: changes.title,
        content: changes.content,
        category: changes.category,
        tags: changes.tags ?? article.tags ?? [],
        schoolEditedAt: changes.schoolEditedAt,
      },
    });
  }

  const wallAction = WALL_ACTIONS[action];
  if (!wallAction) throw new APIError("Invalid action", 400, "BAD_REQUEST");

  const updates = wallAction.updates(article);
  const before = Object.fromEntries(AUDITED_FIELDS.map((field) => [field, article[field]]));
  const after = { ...before, ...updates };
  await SchoolMagazineArticle.updateOne({ _id: article._id, school }, { $set: updates });
  await recordLifecycleAudit({
    entityType: "SchoolMagazineArticle",
    entityId: article._id,
    action,
    session,
    before,
    after,
  });

  if (action === "SHOW_SCHOOL_WALL") {
    await notifySchoolWallShown({
      articleId: article._id,
      schoolId: school,
      actor: { role: "TEACHER", id: session.user.id, name: session.user.name },
    });
  }

  return NextResponse.json({
    message: wallAction.message,
    article: { id: String(article._id), ...after },
  });
});
