import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";
import { validateWritingEdit } from "@/lib/freeWritingDesk";
import { recordLifecycleAudit } from "@/lib/lifecycle";

/** A class teacher is the first editorial gate for their students' magazine
 * submissions. Issue lifecycle and final inclusion stay with the school. */
export const PATCH = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to update class magazine writing" }, async ({ request, params, session }) => {
  const scope = await getTeacherMagazineScope(session);
  if (!mongoose.Types.ObjectId.isValid(params.id)) throw new APIError("Writing not found", 404, "NOT_FOUND");
  const article = await SchoolMagazineArticle.findOne({
    _id: params.id,
    school: scope.school,
    authorStudent: { $in: scope.studentIds },
    submissionSource: "MAGAZINE",
    status: { $in: ["SUBMITTED", "APPROVED"] },
    isDeleted: { $ne: true },
  });
  if (!article) throw new APIError("Writing not found", 404, "NOT_FOUND");
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").toUpperCase();
  if (!["EDIT", "SELECT_FOR_SCHOOL", "UNSELECT_FOR_SCHOOL"].includes(action)) throw new APIError("Invalid magazine action", 400, "BAD_REQUEST");

  const requestedIssue = article.requestedIssue && await MagazineIssue.findOne({
    _id: article.requestedIssue,
    school: scope.school,
    status: "DRAFT",
    acceptingSubmissions: true,
  });
  if (!requestedIssue) {
    throw new APIError("Published or closed magazines cannot be changed by a class teacher", 409, "MAGAZINE_CLOSED");
  }
  if (article.isMagazinePublished) {
    throw new APIError("This writing is already in the school's final magazine selection", 409, "ALREADY_SELECTED_BY_SCHOOL");
  }

  if (action === "EDIT") {
    const { error, changes } = validateWritingEdit(body, article);
    if (error) throw new APIError(error, 400, "BAD_REQUEST");
    await SchoolMagazineArticle.updateOne({ _id: article._id, school: scope.school }, { $set: changes });
    await recordLifecycleAudit({
      entityType: "SchoolMagazineArticle",
      entityId: article._id,
      action: "TEACHER_EDIT_MAGAZINE",
      session,
      before: { title: article.title, category: article.category },
      after: { title: changes.title, category: changes.category },
    });
    return NextResponse.json({ message: "Changes saved. They show everywhere this writing appears.", article: { id: String(article._id), ...changes } });
  }

  const selected = action === "SELECT_FOR_SCHOOL";
  if (!selected && !article.classTeacherSelectedAt) throw new APIError("This writing has not been selected yet", 409, "NOT_SELECTED");
  const selectedAt = selected ? new Date() : null;
  const updateResult = await SchoolMagazineArticle.updateOne(
    { _id: article._id, school: scope.school, isMagazinePublished: false },
    { $set: { classTeacherSelectedAt: selectedAt, classTeacherSelectedBy: selected ? session.user.id : null } }
  );
  if (!updateResult.matchedCount) {
    throw new APIError("This writing is already in the school's final magazine selection", 409, "ALREADY_SELECTED_BY_SCHOOL");
  }
  await recordLifecycleAudit({
    entityType: "SchoolMagazineArticle",
    entityId: article._id,
    action,
    session,
    before: { classTeacherSelectedAt: article.classTeacherSelectedAt || null },
    after: { classTeacherSelectedAt: selectedAt },
  });
  return NextResponse.json({
    message: selected ? "Writing selected for the school magazine team" : "Writing returned to the class selection list",
    article: { id: String(article._id), classTeacherSelectedAt: selectedAt },
  });
});
