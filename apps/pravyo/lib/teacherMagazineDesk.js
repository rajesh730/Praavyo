import Student from "@/models/Student";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { APIError } from "@/lib/apiResponse";
import { gradeValuesFor } from "@/lib/freeWritingDesk";

/** Resolve the class-teacher boundary once; routes must never accept a grade
 * or school from the browser as proof of authority. */
export async function getTeacherMagazineScope(session) {
  const school = session.user.schoolId;
  if (!school) throw new APIError("Choose the school you are working in", 409, "SCHOOL_REQUIRED");
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError("You no longer have access to this school", 403, "FORBIDDEN");
  }
  const assignments = await TeacherTeachingAssignment.find({
    school,
    teacher: session.user.id,
    assignmentType: "CLASS_TEACHER",
  }).select("grade").lean();
  const grades = [...new Set(assignments.map((row) => row.grade).filter(Boolean))];
  if (!grades.length) throw new APIError("Only class teachers manage magazine writing", 403, "NOT_CLASS_TEACHER");
  const studentIds = await Student.find({
    school,
    isDeleted: { $ne: true },
    grade: { $in: gradeValuesFor(grades) },
  }).distinct("_id");
  return { school, grades, studentIds };
}
