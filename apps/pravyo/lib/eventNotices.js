import Notice from "@/models/Notice";
import { normalizeGradeValue } from "@/lib/schoolGrades";
import { publishNoticeToParents } from "@/lib/notifications/service";
import { pushNoticePublished, teacherIdsForGrades } from "@/lib/devicePush";
import { sendAccountPush } from "@pravyo/core/webPush";

/**
 * The Notice that announces an event.
 *
 * An event is not itself a communication — it is a thing on a calendar. This
 * turns it into one: a single `Notice`, keyed on (school × event), that both
 * students and guardians receive. Keeping it as a Notice rather than inventing
 * a parallel event-announcement path is what earns the whole delivery stack for
 * free — the Parent App notice centre, the in-app bell, read receipts, and the
 * guardian's message inbox all already know how to carry a Notice.
 *
 * Upserted, never duplicated: re-approving or re-saving an event updates the
 * one announcement instead of stacking another on top of it.
 *
 * **Guardians are included deliberately.** This used to be students-only, which
 * meant a school could publish a sports day and no parent was ever told — the
 * one audience that has to arrange the travel, the kit and the day off work.
 */

function eventIdFor(event) {
  return event ? event._id || event.id || event : null;
}

/**
 * Ring the devices of everyone the event is for (owner, 2026-11-23): its
 * students (eligible grades, all when none), the teachers of those grades,
 * and the school when someone else (a teacher) created it. Guardians are
 * reached through publishNoticeToParents. The author is never rung.
 */
async function pushEventAnnouncement({ notice, event, schoolId, authorId }) {
  try {
    const grades = Array.isArray(notice.grades) ? notice.grades : [];
    const teacherIds = await teacherIdsForGrades(schoolId, grades);
    const delivery = {
      notificationId: `notice-${String(notice._id)}`,
      title: notice.title,
      body: String(notice.content || "").replace(/\s+/g, " ").trim().slice(0, 200),
    };
    const excludeIds = [String(authorId)];
    await Promise.all([
      pushNoticePublished(notice, { excludeIds }),
      sendAccountPush(
        { role: "TEACHER", accountIds: teacherIds, school: schoolId, excludeIds },
        { ...delivery, href: "/teacher/dashboard?tab=events" }
      ),
      sendAccountPush(
        { role: "SCHOOL_ADMIN", accountIds: [String(schoolId)], excludeIds },
        {
          ...delivery,
          schoolId: String(schoolId),
          href: event?.eventScope === "PLATFORM" ? "/school/dashboard?tab=platform-events" : "/school/dashboard?tab=school-events",
        }
      ),
    ]);
  } catch (error) {
    console.error("[eventNotices] device announcement failed:", error.message);
  }
}

export async function ensureEventNotice({
  event,
  schoolId,
  authorId,
  title,
  content,
  // Set when the announcement has MATERIALLY changed — a cancellation, not a
  // re-save. Clears the delivery stamp so guardians are told again; without it
  // a cancelled event would silently keep its original "this is happening"
  // message in every family's inbox.
  announceAgain = false,
} = {}) {
  const eventId = eventIdFor(event);
  const targetSchoolId = schoolId || event?.school || null;

  if (!eventId || !targetSchoolId || !authorId) {
    return null;
  }

  if (event?.status && event.status !== "APPROVED") {
    return null;
  }

  // An event restricted to certain grades must only reach those families.
  // Empty means everyone, matching how Notice.grades already behaves.
  const grades = Array.isArray(event?.eligibleGrades)
    ? event.eligibleGrades.map(normalizeGradeValue).filter(Boolean)
    : [];

  const noticeFilter = {
    scope: "SCHOOL",
    school: targetSchoolId,
    event: eventId,
    type: "EVENT",
    isDeleted: { $ne: true },
  };
  // Devices ring for a new announcement or a material change, not a re-save.
  const announced = await Notice.exists(noticeFilter);

  const notice = await Notice.findOneAndUpdate(
    noticeFilter,
    {
      $set: {
        title: title || `New event: ${event.title || "Event"}`,
        content:
          content ||
          "Your school has published a new event. Open Events for the details.",
        priority: "NORMAL",
        status: "PUBLISHED",
        visibility: "PRIVATE",
        isActive: true,
        grades,
        publishedAt: new Date(),
        // In `$set`, not `$setOnInsert`: event notices created before guardians
        // were an audience must start reaching them too, rather than staying
        // students-only forever because they happen to already exist.
        targetAudience: {
          students: true,
          teachers: false,
          parents: true,
        },
        ...(announceAgain ? { parentsNotifiedAt: null } : {}),
      },
      $setOnInsert: {
        scope: "SCHOOL",
        school: targetSchoolId,
        author: authorId,
        event: eventId,
        type: "EVENT",
        attachments: [],
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  // Deliver to guardians: bell, notice centre, and the message inbox. Guarded
  // by `parentsNotifiedAt`, so re-saving an event does not re-announce it.
  // Await the durable fan-out before returning. The delivery service contains
  // channel failures, and awaiting prevents a serverless runtime from freezing
  // the notification work as soon as the event response is sent.
  if (notice?._id) {
    await publishNoticeToParents(notice._id);
    if (!announced || announceAgain) {
      await pushEventAnnouncement({ notice, event, schoolId: targetSchoolId, authorId });
    }
  }

  return notice;
}
