import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { recordLifecycleAudit } from "@/lib/lifecycle";
import { validateWritingEdit } from "@/lib/freeWritingDesk";
import { notifySchoolWallShown } from "@/lib/schoolWallNotifications";
import MagazineIssue from "@/models/MagazineIssue";
import {
  getCurrentMagazineIssue,
  serializeMagazineIssue,
} from "@/lib/magazineIssues";

function isFreshForMagazine(article) {
  const sourceDate = new Date(
    article.submittedAt ||
      article.createdAt ||
      article.publishedAt ||
      article.updatedAt ||
      0
  );
  if (Number.isNaN(sourceDate.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return sourceDate >= cutoff;
}

export async function PATCH(request, props) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const params = await props.params;
    const article = await SchoolMagazineArticle.findOne({
      _id: params.id,
      school: session.user.id,
      isDeleted: { $ne: true },
    });

    if (!article) {
      return NextResponse.json(
        { message: "Article not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const action = String(body.action || "").toUpperCase();
    const requestedIssueId = body.magazineIssueId;

    // Lightweight per-post read marker — set once when the school first opens
    // the post. Uses a direct $set update (not doc.save) so it persists
    // reliably and skips the publishing lifecycle / full-doc validation.
    if (action === "MARK_READ") {
      if (!article.schoolReadAt) {
        const readAt = new Date();
        await SchoolMagazineArticle.updateOne(
          { _id: article._id, school: session.user.id },
          { $set: { schoolReadAt: readAt } },
          { strict: false, timestamps: false }
        );
      }
      return NextResponse.json(
        { message: "Marked read" },
        { status: 200 }
      );
    }

    // The school corrects a writing: title, text, type, tags. Saved on the
    // writing itself, so the change shows everywhere it appears.
    if (action === "EDIT") {
      const { error: editError, changes } = validateWritingEdit(body, article);
      if (editError) {
        return NextResponse.json({ message: editError }, { status: 400 });
      }

      await SchoolMagazineArticle.updateOne(
        { _id: article._id, school: session.user.id },
        { $set: changes }
      );
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

    if (
      ![
        "PUBLISH",
        "UNPUBLISH",
        "PUBLISH_HOMEPAGE",
        "UNPUBLISH_HOMEPAGE",
        "PUBLISH_MAGAZINE",
        "UNPUBLISH_MAGAZINE",
        "SHOW_SCHOOL_WALL",
        "HIDE_SCHOOL_WALL",
        "PUBLISH_GLOBAL_WALL",
        "UNPUBLISH_GLOBAL_WALL",
      ].includes(action)
    ) {
      return NextResponse.json(
        { message: "Invalid magazine action" },
        { status: 400 }
      );
    }

    const before = {
      isPublished: article.isPublished,
      publishedAt: article.publishedAt,
      isMagazinePublished: article.isMagazinePublished,
      magazineIssue: article.magazineIssue,
      magazineIssueAssignedAt: article.magazineIssueAssignedAt,
      magazinePublishedAt: article.magazinePublishedAt,
      showOnSchoolWall: article.showOnSchoolWall,
      isGlobalWallPublished: article.isGlobalWallPublished,
      status: article.status,
    };

    const updates = {};
    let assignedMagazineIssue = null;

    // "Global wall" in the school's screen: the public home page and the
    // cross-school global wall are one switch, so they never disagree.
    if (action === "PUBLISH" || action === "PUBLISH_HOMEPAGE") {
      updates.isPublished = true;
      updates.publishedAt = article.publishedAt || new Date();
      updates.isGlobalWallPublished = true;
      updates.status = "APPROVED";
    }

    if (action === "UNPUBLISH" || action === "UNPUBLISH_HOMEPAGE") {
      updates.isPublished = false;
      updates.publishedAt = null;
      updates.isGlobalWallPublished = false;
    }

    if (action === "PUBLISH_MAGAZINE") {
      if (article.submissionSource !== "MAGAZINE" && !article.magazineIssue) {
        return NextResponse.json(
          { message: "The student sent this writing to the school wall, not the magazine." },
          { status: 400 }
        );
      }
      const targetIssue = requestedIssueId
        ? await MagazineIssue.findOne({
            _id: requestedIssueId,
            school: session.user.id,
          })
        : await getCurrentMagazineIssue(session.user.id);

      if (!targetIssue) {
        return NextResponse.json(
          { message: "Create or open a magazine before adding writing." },
          { status: 400 }
        );
      }

      const writtenFor = article.requestedIssue ? String(article.requestedIssue) : "";
      const forThisIssue = writtenFor === String(targetIssue._id);
      if (writtenFor && !forThisIssue && !article.magazineIssue) {
        return NextResponse.json(
          { message: "The student wrote this for a different magazine." },
          { status: 400 }
        );
      }
      // Writing sent to this very magazine is never "too old" for it.
      if (!forThisIssue && !isFreshForMagazine(article)) {
        return NextResponse.json(
          {
            message:
              "This writing is older than 2 months and cannot be added to a magazine.",
          },
          { status: 400 }
        );
      }

      if (article.magazineIssue) {
        const issue = await MagazineIssue.findById(article.magazineIssue).lean();
        const canShowInCurrentIssue =
          issue &&
          String(issue._id) === String(targetIssue._id);

        if (!canShowInCurrentIssue) {
          const serializedIssue = serializeMagazineIssue(issue);
          return NextResponse.json(
            {
              message: serializedIssue?.title
                ? `This writing was already used in ${serializedIssue.title}.`
                : "This writing was already used in a magazine issue.",
            },
            { status: 400 }
          );
        }

        updates.isMagazinePublished = true;
        updates.magazinePublishedAt = article.magazinePublishedAt || new Date();
        updates.status = "APPROVED";
        assignedMagazineIssue = issue;
      } else {
        assignedMagazineIssue = targetIssue;
        updates.isMagazinePublished = true;
        updates.magazinePublishedAt = article.magazinePublishedAt || new Date();
        updates.magazineIssue = assignedMagazineIssue._id;
        updates.magazineIssueAssignedAt = new Date();
        updates.status = "APPROVED";
      }
    }

    if (action === "UNPUBLISH_MAGAZINE") {
      updates.isMagazinePublished = false;
      updates.magazinePublishedAt = null;
      updates.magazineIssue = null;
      updates.magazineIssueAssignedAt = null;
    }

    if (action === "SHOW_SCHOOL_WALL") {
      updates.showOnSchoolWall = true;
    }

    if (action === "HIDE_SCHOOL_WALL") {
      updates.showOnSchoolWall = false;
    }

    if (action === "PUBLISH_GLOBAL_WALL") {
      updates.isGlobalWallPublished = true;
    }

    if (action === "UNPUBLISH_GLOBAL_WALL") {
      updates.isGlobalWallPublished = false;
    }

    const updateResult = await SchoolMagazineArticle.updateOne(
      { _id: article._id, school: session.user.id },
      { $set: updates }
    );

    if (!updateResult.matchedCount) {
      return NextResponse.json(
          { message: "Article could not be updated for this school" },
          { status: 404 }
      );
    }

    if (assignedMagazineIssue) {
      await MagazineIssue.updateOne(
        { _id: assignedMagazineIssue._id },
        { $addToSet: { articles: article._id } }
      );
    }

    if (action === "UNPUBLISH_MAGAZINE" && article.magazineIssue) {
      await MagazineIssue.updateOne(
        { _id: article.magazineIssue, school: session.user.id },
        { $pull: { articles: article._id } }
      );
    }

    const after = {
      isPublished:
        Object.prototype.hasOwnProperty.call(updates, "isPublished")
          ? updates.isPublished
          : article.isPublished,
      publishedAt:
        Object.prototype.hasOwnProperty.call(updates, "publishedAt")
          ? updates.publishedAt
          : article.publishedAt,
      isMagazinePublished:
        Object.prototype.hasOwnProperty.call(updates, "isMagazinePublished")
          ? updates.isMagazinePublished
          : article.isMagazinePublished,
      magazineIssue:
        Object.prototype.hasOwnProperty.call(updates, "magazineIssue")
          ? updates.magazineIssue
          : article.magazineIssue,
      magazineIssueAssignedAt:
        Object.prototype.hasOwnProperty.call(updates, "magazineIssueAssignedAt")
          ? updates.magazineIssueAssignedAt
          : article.magazineIssueAssignedAt,
      magazinePublishedAt:
        Object.prototype.hasOwnProperty.call(updates, "magazinePublishedAt")
          ? updates.magazinePublishedAt
          : article.magazinePublishedAt,
      showOnSchoolWall:
        Object.prototype.hasOwnProperty.call(updates, "showOnSchoolWall")
          ? updates.showOnSchoolWall
          : article.showOnSchoolWall,
      isGlobalWallPublished:
        Object.prototype.hasOwnProperty.call(updates, "isGlobalWallPublished")
          ? updates.isGlobalWallPublished
          : article.isGlobalWallPublished,
      status: updates.status || article.status,
    };

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
        schoolId: session.user.id,
        actor: { role: "SCHOOL_ADMIN", id: session.user.id },
      });
    }

    const messageByAction = {
      PUBLISH: "Writing shown on the global wall",
      PUBLISH_HOMEPAGE: "Writing shown on the global wall",
      UNPUBLISH: "Writing hidden from the global wall",
      UNPUBLISH_HOMEPAGE: "Writing hidden from the global wall",
      PUBLISH_MAGAZINE: "Writing shown in the school magazine",
      UNPUBLISH_MAGAZINE: "Writing hidden from the school magazine",
      SHOW_SCHOOL_WALL: "Writing shown on the school wall",
      HIDE_SCHOOL_WALL: "Writing hidden from the school wall",
      PUBLISH_GLOBAL_WALL: "Writing added to the global wall",
      UNPUBLISH_GLOBAL_WALL: "Writing removed from the global wall",
    };

    return NextResponse.json({
      message: messageByAction[action] || "Article updated",
      article: {
        id: String(article._id),
        ...after,
        magazineIssue: serializeMagazineIssue(assignedMagazineIssue) ||
          (after.magazineIssue ? { id: String(after.magazineIssue) } : null),
      },
    });
  } catch (error) {
    console.error("PATCH /api/school/magazine/[id] error:", error);
    const message =
      process.env.NODE_ENV === "development" && error?.message
        ? `Failed to update school magazine article: ${error.message}`
        : "Failed to update school magazine article";
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/school/magazine/[id] — the school deletes a student writing.
 * A soft delete, like a student's own: it disappears from the school wall,
 * the global wall, the home page, any magazine and the student's portfolio,
 * but the record (and its photos) are kept, so a mistake can be undone.
 */
export async function DELETE(_request, props) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const params = await props.params;
    const article = await SchoolMagazineArticle.findOne({
      _id: params.id,
      school: session.user.id,
      isDeleted: { $ne: true },
    });
    if (!article) {
      return NextResponse.json({ message: "Writing not found" }, { status: 404 });
    }

    const previousIssue = article.magazineIssue;
    await SchoolMagazineArticle.updateOne(
      { _id: article._id, school: session.user.id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: null,
          deletedByRole: "SCHOOL",
          showOnSchoolWall: false,
          isPublished: false,
          isFeatured: false,
          isMagazinePublished: false,
          isGlobalWallPublished: false,
          publishedAt: null,
          magazinePublishedAt: null,
          magazineIssue: null,
          magazineIssueAssignedAt: null,
        },
      }
    );
    if (previousIssue) {
      await MagazineIssue.updateOne(
        { _id: previousIssue, school: session.user.id },
        { $pull: { articles: article._id } }
      );
    }

    return NextResponse.json({ message: `“${article.title}” deleted` });
  } catch (error) {
    console.error("DELETE /api/school/magazine/[id] error:", error);
    return NextResponse.json({ message: "Failed to delete writing" }, { status: 500 });
  }
}
