import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { APIError } from "@/lib/apiResponse";
import { writingGradeFilter } from "@/lib/freeWritingDesk";

/** Resolve the teacher's school membership. Routes must never accept a school
 * from the browser as proof of authority. */
export async function getTeacherMagazineSchool(session) {
  const school = session.user.schoolId;
  if (!school) throw new APIError("Choose the school you are working in", 409, "SCHOOL_REQUIRED");
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError("You no longer have access to this school", 403, "FORBIDDEN");
  }
  return school;
}

/** Resolve the class-teacher boundary once. */
export async function getTeacherMagazineScope(session) {
  const school = await getTeacherMagazineSchool(session);
  const assignments = await TeacherTeachingAssignment.find({
    school,
    teacher: session.user.id,
    assignmentType: "CLASS_TEACHER",
  }).select("grade").lean();
  const grades = [...new Set(assignments.map((row) => row.grade).filter(Boolean))];
  if (!grades.length) throw new APIError("Only class teachers manage magazine writing", 403, "NOT_CLASS_TEACHER");
  // Writing counts for the grade it was written in (see writingGradeFilter).
  // Put it under `$and` in a query, so it never collides with another `$or`.
  const writingFilter = await writingGradeFilter(school, grades);
  return { school, grades, writingFilter };
}
