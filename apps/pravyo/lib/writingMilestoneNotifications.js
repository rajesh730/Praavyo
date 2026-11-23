import Student from "@/models/Student";
import UserNotification from "@/models/UserNotification";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { teacherIdsAtSchool } from "@pravyo/db/teacherMemberships";
import { notifyGuardians } from "@/lib/parentNotifications";
import { pushUserNotifications } from "@/lib/devicePush";
import { notifyTeachers } from "@/lib/teacherNotifications";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";
import { publishRealtimeEvent } from "@/lib/realtimeBus";

/**
 * A student's writing reaching the next step (owner, 2026-11-23: every step
 * notifies everyone it concerns, and only them, in the bell and on devices):
 *
 *   SELECTED_FOR_MAGAZINE  class teacher picked it for the school magazine
 *                          → the school (to decide), the author
 *   IN_MAGAZINE            the school put it in the magazine
 *                          → the author, their guardians, their class teacher(s)
 *   ON_GLOBAL_WALL         shown on the Praavyo home page / cross-school wall
 *                          → the author, their guardians, the school when a
 *                            class teacher did it
 *
 * Going up on the school wall is lib/schoolWallNotifications.js. The person
 * who acted is never notified, and each step is announced once per writing
 * (undo and redo does not ring everyone again). Best-effort: never throws.
 */

const idOf = (value) => String(value?._id || value || "");
const quoted = (article) => (article?.title ? `"${article.title}"` : "your writing");

async function classTeacherIds(schoolId, grade) {
  const grades = getEquivalentGradeValues(grade);
  if (!grades.length) return [];
  const [assigned, active] = await Promise.all([
    TeacherTeachingAssignment.find({ school: schoolId, assignmentType: "CLASS_TEACHER", grade: { $in: grades } }).distinct("teacher"),
    teacherIdsAtSchool(schoolId),
  ]);
  const live = new Set(active.map(String));
  return assigned.map(String).filter((id) => live.has(id));
}

const MILESTONES = {
  SELECTED_FOR_MAGAZINE: ({ author, article, actor }) => ({
    author: {
      title: "Your class teacher chose your writing",
      message: `${quoted(article)} was selected for the school magazine. Your school makes the final choice.`,
      href: "/student/writing",
    },
    school: {
      title: "Writing selected for the magazine",
      message: `${actor.name || "A class teacher"} selected ${author.name || "a student"}'s ${quoted(article)} for the school magazine.`,
      href: "/school/dashboard?tab=magazine",
    },
  }),
  IN_MAGAZINE: ({ author, article }) => ({
    author: {
      title: "Your writing is in the school magazine",
      message: `${quoted(article)} was chosen for your school magazine.`,
      href: "/student/writing",
    },
    guardians: {
      title: `${author.name || "Your child"}'s writing is in the school magazine`,
      message: `${quoted(article)} by ${author.name || "your child"} was chosen for the school magazine.`,
    },
    classTeachers: {
      title: "Writing chosen for the magazine",
      message: `${author.name || "A student"}'s ${quoted(article)} was chosen for the school magazine.`,
      href: "/teacher/dashboard?tab=publishing",
    },
  }),
  ON_GLOBAL_WALL: ({ author, article, actor }) => ({
    author: {
      title: "Your writing is on the Praavyo wall",
      message: `${quoted(article)} is now shown to readers beyond your school.`,
      href: "/student/writing",
    },
    guardians: {
      title: `${author.name || "Your child"}'s writing is on the Praavyo wall`,
      message: `${quoted(article)} by ${author.name || "your child"} is now shown to readers beyond the school.`,
    },
    school: actor.role === "TEACHER"
      ? {
          title: "Writing shown on the global wall",
          message: `${actor.name || "A class teacher"} put ${author.name || "a student"}'s ${quoted(article)} on the global wall.`,
          href: "/school/dashboard?tab=magazine",
        }
      : null,
  }),
};

export async function notifyWritingMilestone({ articleId, schoolId, milestone, actor = {} }) {
  try {
    const build = MILESTONES[milestone];
    if (!build || !articleId || !schoolId) return;
    const article = await SchoolMagazineArticle.findOne({ _id: articleId, school: schoolId, isDeleted: { $ne: true } })
      .select("title authorStudent")
      .lean();
    if (!article?.authorStudent) return;
    const id = idOf(article._id);

    // Announced once: the author's own notification marks the step as told.
    const told = await UserNotification.exists({
      targetRole: "STUDENT",
      recipientStudent: article.authorStudent,
      "metadata.articleId": id,
      "metadata.action": milestone,
    });
    if (told) return;

    const author = await Student.findOne({ _id: article.authorStudent, school: schoolId }).select("name grade").lean();
    if (!author) return;

    const text = build({ author, article, actor });
    const actorId = idOf(actor.id);
    const metadata = { articleId: id, action: milestone };

    const bell = [{
      targetRole: "STUDENT",
      recipientStudent: author._id,
      school: schoolId,
      category: "MAGAZINE",
      ...text.author,
      metadata,
    }];
    if (text.school && actorId !== idOf(schoolId)) {
      bell.push({
        targetRole: "SCHOOL_ADMIN",
        recipientUser: schoolId,
        school: schoolId,
        category: "MAGAZINE",
        ...text.school,
        metadata,
      });
    }
    const created = await UserNotification.insertMany(bell);
    publishRealtimeEvent("student-notifications", { kind: "writing-milestone", articleId: id });
    if (text.school) publishRealtimeEvent("school-notifications", { kind: "writing-milestone", articleId: id });

    await Promise.all([
      pushUserNotifications(created),
      text.guardians
        ? notifyGuardians({
            studentId: author._id,
            type: "WRITING",
            priority: "POSITIVE",
            title: text.guardians.title,
            message: text.guardians.message,
            href: "/parent/journey",
            entityId: id,
            dedupeKey: `writing-${milestone}-${id}`,
          }).catch((error) => console.error("[writingMilestone] guardian delivery failed:", error.message))
        : null,
      text.classTeachers
        ? classTeacherIds(schoolId, author.grade).then((teacherIds) =>
            notifyTeachers({
              teacherIds,
              school: schoolId,
              category: "MAGAZINE",
              ...text.classTeachers,
              metadata,
              excludeIds: [actorId],
            })
          )
        : null,
    ]);
  } catch (error) {
    console.error("[writingMilestone] notification failed:", error.message);
  }
}
