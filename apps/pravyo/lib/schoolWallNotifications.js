import Student from "@/models/Student";
import UserNotification from "@/models/UserNotification";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { sendAccountPush } from "@pravyo/core/webPush";
import { notifyGuardians } from "@/lib/parentNotifications";
import { pushUserNotifications, teacherIdsForGrades } from "@/lib/devicePush";
import { getEquivalentGradeValues } from "@/lib/schoolGrades";

/**
 * Who hears about a student's writing going up on the school wall (owner,
 * 2026-11-23: every activity notifies its related people, and only them):
 *
 *   - the author (bell + device) and the author's guardians (parent inbox + phone);
 *   - classmates: students of the author's grade at the same school (device);
 *   - teachers of that grade, class and subject teachers (device);
 *   - the school (bell + device) when a class teacher made the decision.
 *
 * The person who turned it on is never notified. Announced once per writing
 * (`schoolWallAnnouncedAt`), so hiding and showing again does not ring
 * everyone a second time. Best-effort: never throws.
 */

const idOf = (value) => String(value?._id || value || "");
const quoted = (article) => (article?.title ? `"${article.title}"` : "a piece of writing");

export async function notifySchoolWallShown({ articleId, schoolId, actor = {} }) {
  try {
    // Claim the announcement atomically: only the first show rings anyone.
    const article = await SchoolMagazineArticle.findOneAndUpdate(
      {
        _id: articleId,
        school: schoolId,
        showOnSchoolWall: true,
        status: { $in: ["SUBMITTED", "APPROVED"] },
        isDeleted: { $ne: true },
        schoolWallAnnouncedAt: null,
      },
      { $set: { schoolWallAnnouncedAt: new Date() } },
      { new: true }
    )
      .select("title authorStudent school")
      .lean();
    if (!article?.authorStudent) return;

    const author = await Student.findOne({ _id: article.authorStudent, school: schoolId })
      .select("name grade")
      .lean();
    if (!author) return;

    const actorId = idOf(actor.id);
    const byTeacher = actor.role === "TEACHER";
    const authorName = author.name || "A student";
    const id = idOf(article._id);
    const what = quoted(article);

    const grades = getEquivalentGradeValues(author.grade);
    const [classmates, teacherIds] = await Promise.all([
      grades.length
        ? Student.find({
            school: schoolId,
            status: "ACTIVE",
            isDeleted: { $ne: true },
            grade: { $in: grades },
            _id: { $ne: author._id },
          }).distinct("_id")
        : [],
      author.grade ? teacherIdsForGrades(schoolId, [author.grade]) : [],
    ]);

    const bell = [
      {
        targetRole: "STUDENT",
        recipientStudent: author._id,
        school: schoolId,
        category: "MAGAZINE",
        title: "Your writing is on the school wall",
        message: `${what} is now on your school wall for everyone at school to read.`,
        href: `/student/school-wall/${id}`,
        metadata: { articleId: id, action: "SHOWN_ON_SCHOOL_WALL" },
      },
    ];
    if (byTeacher) {
      bell.push({
        targetRole: "SCHOOL_ADMIN",
        recipientUser: schoolId,
        school: schoolId,
        category: "MAGAZINE",
        title: "Writing shown on the school wall",
        message: `${actor.name || "A class teacher"} put ${authorName}'s ${what} on the school wall.`,
        href: "/school/dashboard?tab=magazine",
        metadata: { articleId: id, action: "SHOWN_ON_SCHOOL_WALL" },
      });
    }
    const created = await UserNotification.insertMany(bell);

    const delivery = {
      notificationId: `school-wall-${id}`,
      title: `New on the school wall: ${article.title || "writing"}`,
      body: `${authorName} (${author.grade}) wrote ${what}.`,
    };
    await Promise.all([
      pushUserNotifications(created),
      notifyGuardians({
        studentId: author._id,
        type: "WRITING",
        priority: "POSITIVE",
        title: `${authorName}'s writing is on the school wall`,
        message: `${what} by ${authorName} is now on the school wall.`,
        href: "/parent/journey",
        entityId: id,
        dedupeKey: `school-wall-${id}`,
      }).catch((error) => console.error("[schoolWall] guardian delivery failed:", error.message)),
      sendAccountPush(
        { role: "STUDENT", accountIds: classmates.map(String), school: schoolId, excludeIds: [actorId] },
        { ...delivery, href: `/student/school-wall/${id}` }
      ),
      sendAccountPush(
        { role: "TEACHER", accountIds: teacherIds, school: schoolId, excludeIds: [actorId] },
        { ...delivery, href: `/teacher/school-wall/${id}` }
      ),
    ]);
  } catch (error) {
    console.error("[schoolWall] notification failed:", error.message);
  }
}
