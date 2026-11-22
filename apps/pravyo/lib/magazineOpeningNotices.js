import Notice from "@/models/Notice";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { publishNoticeToParents } from "@/lib/notifications/service";
import { pushNoticePublished } from "@/lib/devicePush";
import { sendAccountPush } from "@pravyo/core/webPush";
import { publishNoticeRealtimeEvent } from "@/lib/noticeRealtime";

async function announceMagazineNotice({ issue, schoolId, authorId, title, content }) {
  try {
    if (!issue?._id || !schoolId || !authorId) return null;
    const notice = await Notice.create({
      title,
      content,
      type: "SHOWCASE",
      scope: "SCHOOL",
      priority: "NORMAL",
      status: "PUBLISHED",
      school: schoolId,
      author: authorId,
      visibility: "PRIVATE",
      targetAudience: { students: true, teachers: true, parents: true },
      grades: [],
      isActive: true,
      publishedAt: new Date(),
    });

    const teacherIds = await TeacherMembership.find({ school: schoolId, status: "ACTIVE" }).distinct("teacher");
    const delivery = {
      notificationId: `notice-${String(notice._id)}`,
      title,
      body: content,
      href: "/teacher/dashboard?tab=publishing",
    };
    publishNoticeRealtimeEvent({ scope: "SCHOOL", targetAudience: notice.targetAudience });
    await Promise.all([
      publishNoticeToParents(notice._id),
      pushNoticePublished(notice, { excludeIds: [authorId] }),
      sendAccountPush({ role: "TEACHER", accountIds: teacherIds, school: schoolId, excludeIds: [authorId] }, delivery),
    ]);
    return notice;
  } catch (error) {
    console.error("[magazine] opening announcement failed:", error.message);
    return null;
  }
}

/**
 * Creating a magazine is visible to the whole school. Its writing state is
 * stated plainly so students are never led to submit to a closed issue.
 */
export function announceMagazineIssueCreated({ issue, schoolId, authorId }) {
  const magazineTitle = issue?.title || "School magazine";
  return announceMagazineNotice({
    issue,
    schoolId,
    authorId,
    title: `New magazine: ${magazineTitle}`,
    content: `${magazineTitle} has been created. Writing is currently closed; you will be notified when submissions open.`,
  });
}

/**
 * Notice delivery is deliberately best-effort: the saved issue remains open
 * if an email or push provider is unavailable.
 */
export function announceMagazineWritingOpen({ issue, schoolId, authorId }) {
  const magazineTitle = issue?.title || "School magazine";
  return announceMagazineNotice({
    issue,
    schoolId,
    authorId,
    title: `Writing is open: ${magazineTitle}`,
    content: `Students can now submit writing for ${magazineTitle}. Open Writing and choose this magazine before sending your work.`,
  });
}

/**
 * Show or hide a magazine notice in everyone's notice list. No new push is
 * sent. A notice the school deleted itself is left deleted.
 */
export async function setMagazineNoticeActive(noticeId, active) {
  if (!noticeId) return;
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: noticeId, isDeleted: { $ne: true } },
      { $set: { isActive: Boolean(active) } },
      { new: true }
    )
      .select("scope targetAudience")
      .lean();
    if (notice) publishNoticeRealtimeEvent({ scope: notice.scope, targetAudience: notice.targetAudience });
  } catch (error) {
    console.error("[magazine] notice update failed:", error.message);
  }
}
