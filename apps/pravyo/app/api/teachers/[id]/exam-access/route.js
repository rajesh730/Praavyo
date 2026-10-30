import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import { bsAcademicYearLabel } from "@pravyo/core/nepaliDate";
import AcademicYear from "@pravyo/db/models/AcademicYear";
import CasExam from "@pravyo/db/models/cas/CasExam";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import CasExamTeacherAssignment from "@pravyo/db/models/cas/CasExamTeacherAssignment";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { loadSchoolTeacher } from "@/lib/teacherAccounts";
import { EXAMINED_FILTER } from "@pravyo/core/subjectScope";

const ID = /^[a-f\d]{24}$/i;

/**
 * Exam mark-entry access for one teacher in the running academic year.
 *
 * Teaching a subject does not by itself let a teacher enter marks: the school
 * ticks each exam here (Exam + Grade + Subject). The same records are managed
 * per exam from Assessment → Exams; both screens edit one source of truth.
 */
async function context(school, teacherId) {
  const year = await AcademicYear.findOne({ school, status: "ACTIVE" }).select("year yearStart").lean();
  if (!year) return { year: null };

  const [exams, teaching, grants] = await Promise.all([
    CasExam.find({ school, academicYear: year._id, status: "ACTIVE", isAlias: { $ne: true } })
      .select("name grade").sort({ createdAt: 1, _id: 1 }).lean(),
    TeacherTeachingAssignment.find({ school, teacher: teacherId, assignmentType: "SUBJECT_TEACHER" }).select("grade subject").lean(),
    CasExamTeacherAssignment.find({ school, teacher: teacherId, academicYear: year._id }).select("exam grade subject").lean(),
  ]);

  // Rows the editor offers: every subject the teacher teaches, plus any exam
  // grant made from the Assessment screen for a subject outside that list.
  const keys = new Map();
  teaching.filter((row) => row.subject).forEach((row) => keys.set(`${row.grade}:${row.subject}`, { grade: row.grade, subject: String(row.subject), teaches: true }));
  grants.forEach((row) => {
    const key = `${row.grade}:${row.subject}`;
    if (!keys.has(key)) keys.set(key, { grade: row.grade, subject: String(row.subject), teaches: false });
  });
  const subjectIds = [...keys.values()].map((row) => row.subject);
  const subjects = subjectIds.length
    // Only examined subjects have exams; taught-only subjects drop out here.
    ? await CasSubject.find({ _id: { $in: subjectIds }, school, ...EXAMINED_FILTER }).select("code titleEn titleNe").lean()
    : [];
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

  return {
    year,
    exams: exams.map((exam) => ({ id: String(exam._id), name: exam.name, grade: exam.grade || "" })),
    rows: [...keys.values()]
      .filter((row) => subjectById.has(row.subject))
      .map((row) => {
        const subject = subjectById.get(row.subject);
        return { ...row, title: subject.titleEn || subject.titleNe || subject.code, code: subject.code };
      })
      .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.title.localeCompare(b.title)),
    grants: grants.map((row) => ({ exam: String(row.exam), grade: row.grade, subject: String(row.subject) })),
  };
}

function serializeYear(year) {
  return year ? { id: String(year._id), label: bsAcademicYearLabel(Number(year.yearStart)) || year.year } : null;
}

export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, session }) => {
  const { teacher } = await loadSchoolTeacher(params.id, session.user.id);
  const data = await context(session.user.id, teacher._id);
  return successResponse(200, "Exam access loaded", { ...data, year: serializeYear(data.year) });
});

export const PUT = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, request, session }) => {
  const school = session.user.id;
  const { teacher, membership } = await loadSchoolTeacher(params.id, school);
  if (membership.status === "LEFT") throw new APIError("This teacher has left your school", 409, "CONFLICT");
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.grants) || body.grants.length > 300) throw new APIError("Send the list of exam permissions", 400, "VALIDATION_ERROR");

  const data = await context(school, teacher._id);
  if (!data.year) throw new APIError("Open an academic year before granting exam access", 409, "CONFLICT");
  const exams = new Map(data.exams.map((exam) => [exam.id, exam]));
  const allowed = new Set(data.rows.map((row) => `${row.grade}:${row.subject}`));
  const seen = new Set();
  const rows = body.grants.map((grant) => {
    const exam = exams.get(String(grant?.exam || ""));
    const grade = String(grant?.grade || "");
    const subject = String(grant?.subject || "");
    if (!exam || !ID.test(subject)) throw new APIError("Choose a valid exam and subject", 400, "VALIDATION_ERROR");
    if (!allowed.has(`${grade}:${subject}`)) throw new APIError("Assign this subject to the teacher before granting exam access", 400, "VALIDATION_ERROR");
    if (exam.grade && exam.grade !== grade) throw new APIError(`${exam.name} is not held for ${grade}`, 400, "VALIDATION_ERROR");
    const key = `${exam.id}:${grade}:${subject}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { school, academicYear: data.year._id, exam: exam.id, grade, subject, teacher: teacher._id, assignedBy: school };
  }).filter(Boolean);

  // Marks already entered are never touched; only future entry access changes.
  await CasExamTeacherAssignment.deleteMany({ school, teacher: teacher._id, academicYear: data.year._id });
  if (rows.length) await CasExamTeacherAssignment.insertMany(rows, { ordered: true });
  return successResponse(200, "Exam access saved", { grants: rows.length });
});
