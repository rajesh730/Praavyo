import UserNotification from "@/models/UserNotification";
import { publishRealtimeEvent } from "@/lib/realtimeBus";
import { publishWorkIndicatorsUpdate } from "@/lib/workIndicatorRealtime";
import { pushUserNotifications } from "@/lib/devicePush";
import { notifyTeachers } from "@/lib/teacherNotifications";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";

function articleTitle(article) {
  return article?.title ? `"${article.title}"` : "your writing";
}

async function createUserNotification({
  targetRole,
  recipientUser = null,
  recipientStudent = null,
  school,
  title,
  message,
  href,
  article,
  action,
}) {
  if (!targetRole || !school || !title || !message) return null;

  const notification = await UserNotification.create({
    targetRole,
    recipientUser,
    recipientStudent,
    school,
    category: "MAGAZINE",
    title,
    message,
    href,
    metadata: {
      articleId: article?._id ? String(article._id) : "",
      action,
      status: article?.status || "",
    },
  });
  await pushUserNotifications([notification]);
  return notification;
}

export async function notifySchoolMagazineSubmitted({
  article,
  student,
  schoolId,
}) {
  const isMagazineSubmission = article?.submissionSource === "MAGAZINE";
  const notification = await createUserNotification({
    targetRole: "SCHOOL_ADMIN",
    recipientUser: schoolId,
    school: schoolId,
    title: isMagazineSubmission ? "New magazine submission" : "New school wall post",
    message: `${student?.name || "A student"} sent ${articleTitle(article)} to the ${isMagazineSubmission ? "school magazine" : "school wall"}.`,
    href: "/school/dashboard?tab=magazine",
    article,
    action: "POSTED",
  });

  publishRealtimeEvent("school-notifications", {
    kind: "school-magazine-submission-notification",
    articleId: String(article?._id || ""),
  });
  publishWorkIndicatorsUpdate("school-magazine-submission-notification", {
    schoolId: String(schoolId || ""),
    studentId: String(student?._id || ""),
    articleId: String(article?._id || ""),
  });

  // Magazine submissions and school wall posts are also routed to the
  // student's class teacher(s), who review both on the Publishing Desk. The
  // school remains the final editor.
  if (student?.grade) {
    try {
      const teacherIds = await TeacherTeachingAssignment.find({
        school: schoolId,
        assignmentType: "CLASS_TEACHER",
        grade: { $in: getEquivalentGradeValues(student.grade) },
      }).distinct("teacher");
      // In the class teacher's bell and on their devices.
      await notifyTeachers({
        teacherIds: teacherIds.map(String),
        school: schoolId,
        category: "MAGAZINE",
        title: isMagazineSubmission ? "New magazine submission" : "New school wall post",
        message: `${student?.name || "A student"} sent ${articleTitle(article)} for class review.`,
        href: "/teacher/dashboard?tab=publishing",
        metadata: { articleId: String(article?._id || ""), action: "POSTED" },
      });
    } catch (error) {
      console.error("[magazine] class-teacher submission notification failed:", error.message);
    }
  }

  return notification;
}
