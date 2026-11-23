import { NextResponse, after } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import MagazineIssue from "@/models/MagazineIssue";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import {
  getCurrentMagazineIssue,
  getOrCreateCurrentMagazineIssue,
  serializeMagazineIssue,
} from "@/lib/magazineIssues";
import { publishWorkIndicatorsUpdate } from "@/lib/workIndicatorRealtime";
import {
  announceMagazineIssueCreated,
  announceMagazinePublished,
  announceMagazineWritingOpen,
  setMagazineNoticeActive,
} from "@/lib/magazineOpeningNotices";

// Telling the whole school (notices, parent messages, phone pushes) can take
// seconds, so it runs after the response: the school's switch answers at once.

// Withdraw this magazine's notices once they are no longer true.
function withdrawMagazineNotices(issue) {
  const ids = [issue.createdNotice, issue.writingNotice].filter(Boolean);
  if (ids.length) after(() => Promise.all(ids.map((id) => setMagazineNoticeActive(id, false))));
}

async function serializeIssueWithCount(issue) {
  const serialized = serializeMagazineIssue(issue);
  if (!serialized) return null;
  const articleCount = await SchoolMagazineArticle.countDocuments({
    school: issue.school,
    magazineIssue: issue._id,
    isMagazinePublished: true,
    isDeleted: { $ne: true },
  });
  return {
    ...serialized,
    articleCount,
  };
}

function issueDate(issue) {
  return new Date(issue.publishedAt || issue.weekStart || issue.createdAt || 0);
}

function normalizeIssueTitles(issues = []) {
  const grouped = new Map();
  issues.forEach((issue) => {
    const key = `${issue.year}-${issue.month}`;
    const list = grouped.get(key) || [];
    list.push(issue);
    grouped.set(key, list);
  });

  const titleById = new Map();
  grouped.forEach((items) => {
    [...items]
      .sort((a, b) => issueDate(a) - issueDate(b))
      .forEach((issue, index) => {
        const monthName = issueDate(issue).toLocaleDateString("en-US", {
          month: "long",
        });
        titleById.set(String(issue._id), `${monthName} Magazine ${index + 1}`);
      });
  });

  return Promise.all(issues.map(async (issue) => {
    const serialized = await serializeIssueWithCount(issue);
    if (!serialized) return null;
    // A name the school typed is kept as it is.
    if (issue.titleEdited) return serialized;
    return { ...serialized, title: titleById.get(String(issue._id)) || serialized.title };
  }));
}

export async function GET() {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const [currentIssue, issues] = await Promise.all([
      getCurrentMagazineIssue(session.user.id),
      // Every magazine, so the year and month filters can reach old ones.
      MagazineIssue.find({ school: session.user.id })
        .sort({ weekStart: -1 })
        .limit(300)
        .lean(),
    ]);

    const normalizedIssues = (await normalizeIssueTitles(issues)).filter(Boolean);
    const normalizedCurrentIssue =
      normalizedIssues.find((issue) => issue.id === String(currentIssue?._id)) ||
      (await serializeIssueWithCount(currentIssue));

    return NextResponse.json({
      currentIssue: normalizedCurrentIssue,
      issues: normalizedIssues,
    });
  } catch (error) {
    console.error("GET /api/school/magazine-issues error:", error);
    return NextResponse.json(
      { message: "Failed to load magazine issues" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const issue = await getOrCreateCurrentMagazineIssue(session.user.id);
    const serializedIssue = await serializeIssueWithCount(issue);
    // Creation is persisted before announcement so a delivery outage never
    // makes the editor retry and accidentally create a duplicate issue.
    after(async () => {
      const notice = await announceMagazineIssueCreated({
        issue,
        schoolId: session.user.id,
        authorId: session.user.id,
      });
      if (notice) await MagazineIssue.updateOne({ _id: issue._id }, { $set: { createdNotice: notice._id } });
    });

    return NextResponse.json({
      message: `${serializedIssue.title} was created. Open writing when students may submit.`,
      issue: serializedIssue,
    });
  } catch (error) {
    console.error("POST /api/school/magazine-issues error:", error);
    return NextResponse.json(
      { message: "Failed to create magazine" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const issueId = body.issueId;
    const action = String(body.action || "").toUpperCase();

    if (!["PUBLISH", "UNPUBLISH", "SHOW_HOME", "HIDE_HOME", "RENAME", "OPEN_WRITING", "CLOSE_WRITING"].includes(action)) {
      return NextResponse.json(
        { message: "Invalid magazine issue action" },
        { status: 400 }
      );
    }

    await connectDB();

    const issue = await MagazineIssue.findOne({
      _id: issueId,
      school: session.user.id,
    });

    if (!issue) {
      return NextResponse.json(
        { message: "Magazine not found" },
        { status: 404 }
      );
    }

    if (action === "RENAME") {
      const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!title) {
        return NextResponse.json({ message: "Please give the magazine a name." }, { status: 400 });
      }
      issue.title = title;
      issue.titleEdited = true;
      await issue.save();
      const serializedIssue = await serializeIssueWithCount(issue);
      return NextResponse.json({ message: `Renamed to ${title}`, issue: serializedIssue });
    }

    if (action === "OPEN_WRITING" || action === "CLOSE_WRITING") {
      if (issue.status !== "DRAFT") {
        return NextResponse.json({ message: "Published magazines cannot be reopened for writing." }, { status: 409 });
      }
      const opening = action === "OPEN_WRITING";
      const wasOpen = Boolean(issue.acceptingSubmissions);
      issue.acceptingSubmissions = opening;
      issue.writingOpenedAt = opening ? (issue.writingOpenedAt || new Date()) : issue.writingOpenedAt;
      issue.writingClosedAt = opening ? null : new Date();
      await issue.save();
      const serializedIssue = await serializeIssueWithCount(issue);
      // The durable state is committed first. A delivery outage must never
      // leave the issue half-open or make the editor retry the action.
      if (opening && !wasOpen) {
        const { createdNotice, writingNotice } = issue;
        after(async () => {
          // "Writing is closed" is no longer true.
          await setMagazineNoticeActive(createdNotice, false);
          // Opened before: show that notice again rather than notifying the
          // whole school a second time (an off/on tap would ping everyone).
          if (writingNotice) {
            await setMagazineNoticeActive(writingNotice, true);
            return;
          }
          const notice = await announceMagazineWritingOpen({ issue, schoolId: session.user.id, authorId: session.user.id });
          if (!notice) return;
          const saved = await MagazineIssue.findOneAndUpdate(
            { _id: issue._id, writingNotice: null },
            { $set: { writingNotice: notice._id } },
            { new: true }
          ).select("status acceptingSubmissions").lean();
          // Closed or published again while the notice was going out.
          if (saved && (saved.status !== "DRAFT" || !saved.acceptingSubmissions)) {
            await setMagazineNoticeActive(notice._id, false);
          }
        });
      }
      if (!opening && wasOpen && issue.writingNotice) {
        const { writingNotice } = issue;
        after(() => setMagazineNoticeActive(writingNotice, false));
      }
      return NextResponse.json({
        message: opening ? `${serializedIssue.title} is open for student writing` : `${serializedIssue.title} is closed for new writing`,
        issue: serializedIssue,
      });
    }

    // Unpublish takes the magazine back to a closed draft: students, the
    // teachers' library and the home page stop showing it (they only read
    // PUBLISHED issues). Its chosen writing stays in it, so the school can
    // change the selection and publish again; writing stays closed until
    // the school reopens it.
    if (action === "UNPUBLISH") {
      if (issue.status !== "PUBLISHED") {
        return NextResponse.json({ message: "This magazine is not published." }, { status: 409 });
      }
      issue.status = "DRAFT";
      issue.acceptingSubmissions = false;
      issue.publishedAt = null;
      issue.showOnHome = false;
      issue.homeShownAt = null;
      await issue.save();
      // "New magazine is out" no longer true: hide it until republished.
      if (issue.publishedNotice) after(() => setMagazineNoticeActive(issue.publishedNotice, false));

      const serializedIssue = await serializeIssueWithCount(issue);
      publishWorkIndicatorsUpdate("magazine-issue-unpublished", {
        schoolId: String(session.user.id),
        issueId: serializedIssue.id,
      });
      return NextResponse.json({
        message: `${serializedIssue.title} unpublished. Students and the home page no longer show it; its writing is kept, so you can change it and publish again.`,
        issue: serializedIssue,
      });
    }

    if (action === "SHOW_HOME") {
      if (issue.status !== "PUBLISHED") {
        return NextResponse.json(
          { message: "Publish this magazine before showing it on home." },
          { status: 400 }
        );
      }
      issue.showOnHome = true;
      issue.homeShownAt = issue.homeShownAt || new Date();
      await issue.save();

      const serializedIssue = await serializeIssueWithCount(issue);
      publishWorkIndicatorsUpdate("magazine-issue-home-updated", {
        schoolId: String(session.user.id),
        issueId: serializedIssue.id,
        showOnHome: true,
      });
      return NextResponse.json({
        message: `${serializedIssue.title} shown on home`,
        issue: serializedIssue,
      });
    }

    if (action === "HIDE_HOME") {
      issue.showOnHome = false;
      issue.homeShownAt = null;
      await issue.save();

      const serializedIssue = await serializeIssueWithCount(issue);
      publishWorkIndicatorsUpdate("magazine-issue-home-updated", {
        schoolId: String(session.user.id),
        issueId: serializedIssue.id,
        showOnHome: false,
      });
      return NextResponse.json({
        message: `${serializedIssue.title} hidden from home`,
        issue: serializedIssue,
      });
    }

    const articleCount = await SchoolMagazineArticle.countDocuments({
      school: session.user.id,
      magazineIssue: issue._id,
      isMagazinePublished: true,
      isDeleted: { $ne: true },
    });
    if (articleCount === 0) {
      return NextResponse.json(
        { message: "Add at least one writing before publishing this magazine." },
        { status: 400 }
      );
    }

    issue.status = "PUBLISHED";
    issue.acceptingSubmissions = false;
    issue.writingClosedAt = issue.writingClosedAt || new Date();
    issue.publishedAt = issue.publishedAt || new Date();
    issue.showOnHome = true;
    issue.homeShownAt = issue.homeShownAt || issue.publishedAt || new Date();
    await issue.save();

    withdrawMagazineNotices(issue);
    // Tell the whole school once; a republish shows the same notice again.
    const publishedNotice = issue.publishedNotice;
    after(async () => {
      if (publishedNotice) {
        await setMagazineNoticeActive(publishedNotice, true);
        return;
      }
      const notice = await announceMagazinePublished({ issue, schoolId: session.user.id, authorId: session.user.id });
      if (notice) {
        await MagazineIssue.updateOne({ _id: issue._id, publishedNotice: null }, { $set: { publishedNotice: notice._id } });
      }
    });
    const serializedIssue = await serializeIssueWithCount(issue);
    publishWorkIndicatorsUpdate("magazine-issue-published", {
      schoolId: String(session.user.id),
      issueId: serializedIssue.id,
    });

    return NextResponse.json({
      message: `${serializedIssue.title} published to students and home`,
      issue: serializedIssue,
    });
  } catch (error) {
    console.error("PATCH /api/school/magazine-issues error:", error);
    return NextResponse.json(
      { message: "Failed to publish magazine" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const issueId = body.issueId;

    await connectDB();

    const issue = await MagazineIssue.findOne({
      _id: issueId,
      school: session.user.id,
    });

    if (!issue) {
      return NextResponse.json(
        { message: "Magazine not found" },
        { status: 404 }
      );
    }

    await SchoolMagazineArticle.updateMany(
      {
        school: session.user.id,
        magazineIssue: issue._id,
        isDeleted: { $ne: true },
      },
      {
        $set: {
          isMagazinePublished: false,
          magazineIssue: null,
          magazineIssueAssignedAt: null,
          magazinePublishedAt: null,
        },
      }
    );

    await MagazineIssue.deleteOne({ _id: issue._id });
    withdrawMagazineNotices(issue);
    publishWorkIndicatorsUpdate("magazine-issue-deleted", {
      schoolId: String(session.user.id),
      issueId: String(issue._id),
    });

    return NextResponse.json({
      message: `${issue.title} deleted. Its writing is available again if still fresh.`,
    });
  } catch (error) {
    console.error("DELETE /api/school/magazine-issues error:", error);
    return NextResponse.json(
      { message: "Failed to delete magazine" },
      { status: 500 }
    );
  }
}
