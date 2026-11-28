import mongoose from "mongoose";
import Student from "@/models/Student";

/**
 * "Chosen families" on a school notice: `Notice.targetStudents`.
 *
 * With chosen families, each audience the school ticks is narrowed to them:
 *   parents  — the guardians of these students (lib/parentNotices.js list,
 *              lib/notifications/service.js delivery and read receipts);
 *   students — these students only (lib/studentNotifications.js board,
 *              pushNoticePublished alerts);
 *   teachers — the teachers of these students' grades: the notice's grades
 *              are set to the chosen students' grades, which the teacher
 *              board and alerts already filter on.
 */

export const MAX_TARGET_STUDENTS = 500;

/**
 * Validate `targetStudents` for a SCHOOL notice of `schoolId`. Returns
 * `{ ids, grades }` (students of this school, deduplicated, and their grades;
 * empty = no restriction) or `{ error }`.
 */
export async function resolveTargetStudents(raw, { schoolId }) {
  if (raw === undefined || raw === null) return { ids: [], grades: [] };
  if (!Array.isArray(raw)) return { error: "Chosen families must be a list." };

  const wanted = [...new Set(raw.map((value) => String(value || "")).filter(Boolean))];
  if (!wanted.length) return { ids: [], grades: [] };
  if (wanted.length > MAX_TARGET_STUDENTS) {
    return { error: `Choose up to ${MAX_TARGET_STUDENTS} families, or send to whole grades instead.` };
  }
  if (wanted.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { error: "A chosen family could not be found. Choose them again." };
  }

  const found = await Student.find({ _id: { $in: wanted }, school: schoolId }).select("_id grade").lean();
  if (found.length !== wanted.length) {
    return { error: "Some chosen families are not at your school any more. Choose them again." };
  }
  const grades = [...new Set(found.map((student) => String(student.grade || "").trim()).filter(Boolean))];
  return { ids: found.map((student) => student._id), grades };
}

/** True when `notice` is narrowed to chosen families and `studentId` is not one of them. */
export function excludedByChosenFamilies(notice, studentId) {
  const chosen = Array.isArray(notice?.targetStudents) ? notice.targetStudents : [];
  return chosen.length > 0 && !chosen.some((id) => String(id?._id || id) === String(studentId));
}
