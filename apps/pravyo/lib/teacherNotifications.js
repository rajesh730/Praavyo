import Notice from "@/models/Notice";
import UserNotification from "@/models/UserNotification";
import UserSurfaceSeenState from "@/models/UserSurfaceSeenState";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";
import { pushUserNotifications } from "@/lib/devicePush";
import { publishRealtimeEvent } from "@/lib/realtimeBus";

/**
 * The teacher's notification bell, for the school chosen in their session
 * (owner, 2026-11-23: teachers had no notices and no device alerts).
 *
 *   - school notices the school addressed to Teachers (grade-limited ones only
 *     for teachers of those grades);
 *   - event announcements for the grades the teacher teaches (all events when
 *     the event is open to every grade);
 *   - personal alerts (UserNotification, targetRole TEACHER): writing waiting
 *     for class review, writing put on the school wall, …
 *
 * Access follows TeacherMembership, never Teacher.school.
 */

export const TEACHER_NOTIFICATIONS_CHANNEL = "teacher-notifications";

const idOf = (value) => String(value?._id || value || "");

function hasReadEntry(readBy, userId) {
  return Array.isArray(readBy)
    ? readBy.some((entry) => String(entry?.user || "") === String(userId) && entry?.userType === "TEACHER")
    : false;
}

async function unreadBaseline(session) {
  const now = new Date();
  const state = await UserSurfaceSeenState.findOneAndUpdate(
    { user: session.user.id, surface: "teacher.notifications" },
    { $setOnInsert: { user: session.user.id, role: "TEACHER", surface: "teacher.notifications", seenAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return state?.seenAt || now;
}

function isRead(item, session, unreadAfter) {
  if (hasReadEntry(item.readBy, session.user.id)) return true;
  const publishedAt = new Date(item.publishedAt || item.createdAt || 0).getTime();
  return Number.isFinite(publishedAt) && publishedAt <= new Date(unreadAfter || 0).getTime();
}

export async function getTeacherNotificationPayload(session, limit = 20) {
  const school = session?.user?.schoolId;
  if (!school) return { error: { message: "Choose the school you are working in", status: 409 } };
  if (!(await isActiveTeacherMember(session.user.id, school))) {
    return { error: { message: "You no longer have access to this school", status: 403 } };
  }

  const taught = await TeacherTeachingAssignment.find({ school, teacher: session.user.id }).distinct("grade");
  const gradeValues = new Set(taught.flatMap((grade) => getEquivalentGradeValues(grade)));
  const forMyGrades = (notice) => {
    const grades = (notice.grades || []).map((grade) => String(grade || "").trim()).filter(Boolean);
    return !grades.length || grades.some((grade) => gradeValues.has(grade));
  };

  const now = new Date();
  const [unreadAfter, notices, personal] = await Promise.all([
    unreadBaseline(session),
    Notice.find({
      scope: "SCHOOL",
      school,
      status: "PUBLISHED",
      isActive: true,
      isDeleted: { $ne: true },
      $and: [
        { $or: [{ "targetAudience.teachers": true }, { type: "EVENT", event: { $ne: null } }] },
        { $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] },
      ],
    })
      .select("title content type event grades targetAudience publishedAt createdAt readBy")
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(Math.max(limit, 50))
      .lean(),
    UserNotification.find({
      targetRole: "TEACHER",
      recipientTeacher: session.user.id,
      school,
      isDeleted: { $ne: true },
    })
      .select("title message href category publishedAt createdAt readBy")
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(Math.max(limit, 50))
      .lean(),
  ]);

  const noticeItems = notices.filter(forMyGrades).map((notice) => {
    const isEvent = Boolean(notice.event) && !notice.targetAudience?.teachers;
    return {
      id: idOf(notice._id),
      noticeType: notice.event ? "EVENT" : "SCHOOL",
      storageType: "NOTICE",
      title: notice.title,
      message: notice.content || "",
      publishedAt: notice.publishedAt || notice.createdAt,
      event: null,
      href: isEvent ? "/teacher/dashboard?tab=events" : "/teacher/notices",
      isRead: isRead(notice, session, unreadAfter),
    };
  });

  const personalItems = personal.map((row) => ({
    id: idOf(row._id),
    noticeType: row.category || "GENERAL",
    storageType: "USER_NOTIFICATION",
    title: row.title,
    message: row.message || "",
    publishedAt: row.publishedAt || row.createdAt,
    event: null,
    href: row.href || "/teacher/notices",
    isRead: isRead(row, session, unreadAfter),
  }));

  const notifications = [...personalItems, ...noticeItems]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, limit);

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.isRead).length,
  };
}

/** Mark teacher bell items read or unread (only items the bell shows). */
export async function markTeacherNotifications(session, { action = "read", items = [], allVisible = false }) {
  const visible = await getTeacherNotificationPayload(session, 100);
  if (visible.error) return visible;

  const visibleByKey = new Map(visible.notifications.map((item) => [`${item.noticeType}:${item.id}`, item]));
  const chosen = (allVisible ? visible.notifications : items)
    .map((item) => visibleByKey.get(`${String(item.noticeType || "").toUpperCase()}:${String(item.id || "")}`))
    .filter(Boolean);
  if (!chosen.length) return { markedCount: 0, unreadCount: visible.unreadCount };

  const noticeIds = chosen.filter((item) => item.storageType === "NOTICE").map((item) => item.id);
  const personalIds = chosen.filter((item) => item.storageType === "USER_NOTIFICATION").map((item) => item.id);
  const userId = session.user.id;
  const update = (Model, ids) => {
    if (!ids.length) return { modifiedCount: 0 };
    return action === "unread"
      ? Model.updateMany({ _id: { $in: ids } }, { $pull: { readBy: { user: userId, userType: "TEACHER" } } })
      : Model.updateMany(
          { _id: { $in: ids }, readBy: { $not: { $elemMatch: { user: userId, userType: "TEACHER" } } } },
          { $push: { readBy: { user: userId, userType: "TEACHER", readAt: new Date() } } }
        );
  };
  const [notices, personal] = await Promise.all([update(Notice, noticeIds), update(UserNotification, personalIds)]);

  const unreadCount = action === "unread"
    ? Math.min(visible.notifications.length, visible.unreadCount + chosen.length)
    : Math.max(0, visible.unreadCount - chosen.length);
  return { markedCount: (notices.modifiedCount || 0) + (personal.modifiedCount || 0), unreadCount };
}

/**
 * Put a personal alert in the bell of each teacher and ring their devices.
 * Best-effort: never throws.
 */
export async function notifyTeachers({ teacherIds = [], school, title, message, href = "", category = "GENERAL", metadata = {}, excludeIds = [] }) {
  try {
    const excluded = new Set(excludeIds.map(String));
    const recipients = [...new Set(teacherIds.map(String))].filter((id) => id && !excluded.has(id));
    if (!recipients.length || !school || !title || !message) return { sent: 0 };
    const rows = await UserNotification.insertMany(
      recipients.map((teacherId) => ({
        targetRole: "TEACHER",
        recipientTeacher: teacherId,
        school,
        category,
        title: String(title).slice(0, 180),
        message: String(message).slice(0, 1000),
        href,
        metadata,
      }))
    );
    publishRealtimeEvent(TEACHER_NOTIFICATIONS_CHANNEL, { kind: "teacher-notification-created", school: idOf(school) });
    return pushUserNotifications(rows);
  } catch (error) {
    console.error("[teacherNotifications] notify failed:", error.message);
    return { sent: 0 };
  }
}
