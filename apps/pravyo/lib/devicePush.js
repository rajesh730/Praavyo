import Student from "@/models/Student";
import Event from "@/models/Event";
import EventSchoolInvitation from "@/models/EventSchoolInvitation";
import ParticipationRequest from "@/models/ParticipationRequest";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { teacherIdsAtSchool } from "@pravyo/db/teacherMemberships";
import { sendAccountPush } from "@pravyo/core/webPush";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";

/**
 * Phone and laptop alerts for everything that lands in a school's or a
 * student's notification bell (owner, 2026-11-22: every notice must ring the
 * device and stay in its notification tray). Parents are handled by
 * lib/parentNotifications.js, which pushes every parent inbox row.
 *
 * The bells are assembled at read time from several collections, so each
 * place that writes one of those sources calls the matching function here.
 * Every function is best-effort and never throws: an alert failure must not
 * undo the notice that caused it.
 */

const preview = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
const idOf = (value) => String(value?._id || value || "");

async function safely(label, work) {
  try {
    return await work();
  } catch (error) {
    console.error(`[devicePush] ${label} failed:`, error.message);
    return { sent: 0 };
  }
}

/**
 * UserNotification rows just written (school and student bells). Parent rows
 * are skipped: their writer already pushed them.
 */
export async function pushUserNotifications(docs = []) {
  const rows = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  return safely("user notifications", async () => {
    let sent = 0;
    for (const row of rows) {
      const delivery = {
        notificationId: idOf(row._id),
        title: row.title,
        body: preview(row.message || row.body),
        href: row.href || row.actionUrl,
        urgent: row.priority === "URGENT",
        // School logo for school activity; Praavyo trainings show Praavyo's.
        schoolId: row.category === "TRAINING" ? null : idOf(row.school) || null,
      };
      let result = { sent: 0 };
      if (row.targetRole === "STUDENT" && row.recipientStudent) {
        result = await sendAccountPush({ role: "STUDENT", accountIds: [idOf(row.recipientStudent)] }, delivery);
      } else if (row.targetRole === "SCHOOL_ADMIN" && (row.recipientUser || row.school)) {
        result = await sendAccountPush({ role: "SCHOOL_ADMIN", accountIds: [idOf(row.recipientUser || row.school)] }, delivery);
      } else if (row.targetRole === "TEACHER" && row.recipientTeacher) {
        result = await sendAccountPush({ role: "TEACHER", accountIds: [idOf(row.recipientTeacher)], school: row.school || undefined }, delivery);
      }
      sent += result.sent;
    }
    return { sent };
  });
}

/**
 * Active teachers of a school who teach any of `grades` (class or subject
 * teacher). With no grades, every active teacher of the school.
 */
export async function teacherIdsForGrades(schoolId, grades = []) {
  if (!schoolId) return [];
  const active = (await teacherIdsAtSchool(schoolId)).map(String);
  const cleanGrades = (grades || []).map((grade) => String(grade || "").trim()).filter(Boolean);
  if (!cleanGrades.length) return active;
  const values = [...new Set(cleanGrades.flatMap((grade) => getEquivalentGradeValues(grade)))];
  const assigned = new Set(
    (await TeacherTeachingAssignment.find({ school: schoolId, grade: { $in: values } }).distinct("teacher")).map(String)
  );
  return active.filter((id) => assigned.has(id));
}

/** Students of `schoolId` whose grade matches `grades` (all when empty). */
async function studentIdsAtSchool(schoolId, grades = []) {
  const query = { school: schoolId, status: "ACTIVE", isDeleted: { $ne: true } };
  const cleanGrades = (grades || []).map((grade) => String(grade || "").trim()).filter(Boolean);
  if (cleanGrades.length) {
    query.grade = { $in: [...new Set(cleanGrades.flatMap((grade) => getEquivalentGradeValues(grade)))] };
  }
  return Student.find(query).distinct("_id");
}

/**
 * A Notice that has just become PUBLISHED. Platform notices ring every school;
 * school notices for students ring that school's students in the chosen
 * grades (an event notice: its eligible grades, everyone when none); school
 * notices for teachers ring the active teachers of those grades (every
 * teacher when none). Parents are reached separately by publishNoticeToParents.
 */
export async function pushNoticePublished(notice, { excludeIds = [] } = {}) {
  if (!notice || notice.status !== "PUBLISHED") return { sent: 0 };
  return safely("notice", async () => {
    const delivery = {
      notificationId: `notice-${idOf(notice._id)}`,
      title: notice.title,
      body: preview(notice.content),
      urgent: String(notice.priority || "").toUpperCase() === "URGENT",
    };

    if (notice.scope === "PLATFORM") {
      return sendAccountPush(
        { role: "SCHOOL_ADMIN", excludeIds },
        { ...delivery, href: "/school/dashboard?tab=notices" }
      );
    }

    if (!notice.school) return { sent: 0 };
    const eventId = notice.event ? idOf(notice.event) : "";
    const [students, teachers] = await Promise.all([
      notice.targetAudience?.students
        ? studentIdsAtSchool(notice.school, notice.grades).then((ids) =>
            sendAccountPush(
              { role: "STUDENT", accountIds: ids, school: notice.school, excludeIds },
              { ...delivery, href: eventId ? `/student/events/${eventId}` : "/student/notices" }
            )
          )
        : { sent: 0 },
      notice.targetAudience?.teachers
        ? teacherIdsForGrades(notice.school, notice.grades).then((ids) =>
            sendAccountPush(
              { role: "TEACHER", accountIds: ids, school: notice.school, excludeIds },
              { ...delivery, href: "/teacher/notices" }
            )
          )
        : { sent: 0 },
    ]);
    return { sent: (students.sent || 0) + (teachers.sent || 0) };
  });
}

/**
 * An EventNotice that has just become PUBLISHED. A school's own event rings
 * its students and the school; a platform event rings every school invited to
 * it or taking part (the same schools whose bell lists it).
 */
export async function pushEventNoticePublished(notice, event, { excludeIds = [] } = {}) {
  if (!notice || notice.status !== "PUBLISHED") return { sent: 0 };
  return safely("event notice", async () => {
    const eventDoc = event?.eventScope ? event : await Event.findById(idOf(notice.event)).select("title eventScope school").lean();
    if (!eventDoc) return { sent: 0 };
    const eventId = idOf(eventDoc._id || notice.event);
    const delivery = {
      notificationId: `event-notice-${idOf(notice._id)}`,
      title: notice.title,
      body: preview(notice.message) || eventDoc.title || "",
    };

    if (eventDoc.eventScope === "SCHOOL" && eventDoc.school) {
      const [students, school] = await Promise.all([
        studentIdsAtSchool(eventDoc.school).then((ids) =>
          sendAccountPush(
            { role: "STUDENT", accountIds: ids, school: eventDoc.school, excludeIds },
            { ...delivery, href: `/student/events/${eventId}?tab=notices` }
          )
        ),
        sendAccountPush(
          { role: "SCHOOL_ADMIN", accountIds: [idOf(eventDoc.school)], excludeIds },
          { ...delivery, schoolId: idOf(eventDoc.school), href: "/school/dashboard?tab=school-events" }
        ),
      ]);
      return { sent: students.sent + school.sent };
    }

    const [invitations, requests] = await Promise.all([
      EventSchoolInvitation.find({ event: eventId, status: { $ne: "WITHDRAWN" } }).distinct("school"),
      ParticipationRequest.find({ event: eventId, status: { $in: ["PENDING", "APPROVED", "ENROLLED"] } }).distinct("school"),
    ]);
    const schoolIds = [...new Set([...invitations, ...requests].map(String))];
    return sendAccountPush(
      { role: "SCHOOL_ADMIN", accountIds: schoolIds, excludeIds },
      { ...delivery, href: "/school/dashboard?tab=platform-events" }
    );
  });
}

/**
 * A new inquiry or admission application has arrived (from the school's
 * Praavyo profile or its own website): ring the school's devices. Inquiries
 * are listed in Dashboard → Inquiries, so that is where the alert opens.
 */
export async function pushSchoolInquiry(inquiry) {
  if (!inquiry?.school) return { sent: 0 };
  return safely("inquiry", async () => {
    const admission = inquiry.type === "ADMISSION";
    const where = inquiry.source === "WEBSITE" ? "your website" : "Praavyo";
    const title = admission
      ? `New admission application (${where})`
      : `New inquiry (${where})`;
    const body = admission
      ? `${inquiry.admission?.studentName || "A student"} · ${inquiry.admission?.grade || ""} · ${inquiry.name}`.replace(/ · $/, "")
      : `${inquiry.name}: ${inquiry.subject}`;
    return sendAccountPush(
      { role: "SCHOOL_ADMIN", accountIds: [idOf(inquiry.school)] },
      {
        notificationId: `inquiry-${idOf(inquiry._id)}`,
        title,
        body: preview(body),
        href: `/school/dashboard?tab=inquiries${admission ? "&type=ADMISSION" : ""}`,
        schoolId: idOf(inquiry.school),
      }
    );
  });
}
