import connectDB from '@pravyo/db';
import { EXAMINED_FILTER } from '@pravyo/core/subjectScope';
import Teacher from '@pravyo/db/models/Teacher';
import { teacherIdsAtSchool } from '@pravyo/db/teacherMemberships';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import ensureCasIndexes from './casIndexes.js';
import { assert, requireSchoolAdmin } from './casAccess.js';
import { loadAcademicYear } from './casContext.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

function validId(value) {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

function serialize(row) {
  return {
    id: String(row._id),
    academicYear: String(row.academicYear),
    exam: String(row.exam),
    grade: row.grade,
    subject: String(row.subject),
    teacher: String(row.teacher),
  };
}

/** Assert that an actor may work on a precise exam/grade/subject scope. */
export async function assertTeacherExamAssignment(actor, {
  academicYear,
  exam,
  grade,
  subject,
}, session = null) {
  if (actor.role === 'SCHOOL_ADMIN') return;
  assert(actor.role === 'TEACHER', 'Only assigned teachers can record this assessment', 403);
  const query = CasExamTeacherAssignment.exists({
    school: actor.school,
    academicYear,
    exam,
    grade,
    subject,
    teacher: actor.id,
  });
  if (session) query.session(session);
  assert(await query, 'Your school has not assigned you to this exam subject', 403);
}

/**
 * The grades a teacher works in, per workspace, so their Grade filter lists
 * only those:
 *   - cas:      grades where the school opened a CAS exam subject to them
 *   - internal: grades the school assigned them on the Teachers page
 * Returns null for anyone but a teacher (the school sees every grade).
 */
export async function teacherGradeScope(actor) {
  if (actor.role !== 'TEACHER') return null;
  await connectDB();
  const [cas, internal] = await Promise.all([
    CasExamTeacherAssignment.distinct('grade', { school: actor.school, teacher: actor.id }),
    TeacherTeachingAssignment.distinct('grade', { school: actor.school, teacher: actor.id }),
  ]);
  return { cas, internal };
}

/** A teacher may see a roster only where they have at least one exam assignment. */
export async function assertTeacherGradeAssignment(actor, { academicYear, grade }) {
  if (actor.role === 'SCHOOL_ADMIN') return;
  assert(actor.role === 'TEACHER', 'Only assigned teachers can access assessment', 403);
  assert(await CasExamTeacherAssignment.exists({
    school: actor.school, academicYear, grade, teacher: actor.id,
  }), 'Your school has not assigned you to this grade', 403);
}

/** Subject ids a teacher may inspect for a year/grade. */
export async function assignedSubjectIds(actor, { academicYear, grade }) {
  if (actor.role === 'SCHOOL_ADMIN') return null;
  assert(actor.role === 'TEACHER', 'Only assigned teachers can access assessment', 403);
  const rows = await CasExamTeacherAssignment.find({
    school: actor.school, academicYear, grade, teacher: actor.id,
  }).select('subject').lean();
  return [...new Set(rows.map((row) => String(row.subject)))];
}

export async function listExamTeacherAssignments(actor, { academicYear, grade }) {
  await connectDB();
  const year = await loadAcademicYear(actor, academicYear);
  assert(typeof grade === 'string' && grade.trim(), 'Choose a grade');
  const scope = { school: actor.school, academicYear: year.id, grade: grade.trim() };
  const assignments = await CasExamTeacherAssignment.find(
    actor.role === 'TEACHER' ? { ...scope, teacher: actor.id } : scope,
  ).sort({ createdAt: 1, _id: 1 }).lean();

  // Only administrators receive the directory needed to make assignments.
  const teachers = actor.role === 'SCHOOL_ADMIN'
    ? await Teacher.find({ _id: { $in: await teacherIdsAtSchool(actor.school) } })
      .select('name email subject')
      .sort({ name: 1, _id: 1 })
      .lean()
    : [];

  return {
    assignments: assignments.map(serialize),
    teachers: teachers.map((teacher) => ({
      id: String(teacher._id), name: teacher.name, email: teacher.email, subject: teacher.subject || '',
    })),
  };
}

/** Replace the teachers assigned to one exam/grade/subject. Admin-only. */
export async function setExamTeacherAssignments(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  await ensureCasIndexes();
  const { academicYear, exam, grade, subject } = input || {};
  assert(validId(exam) && validId(subject), 'Choose a valid exam and subject');
  assert(typeof grade === 'string' && grade.trim(), 'Choose a grade');
  const teacherIds = [...new Set(Array.isArray(input?.teacherIds) ? input.teacherIds.map(String) : [])];
  assert(teacherIds.length <= 100 && teacherIds.every(validId), 'Choose valid teachers');

  const year = await loadAcademicYear(actor, academicYear);
  const [examRow, subjectRow, teachers] = await Promise.all([
    CasExam.findOne({ _id: exam, school: actor.school, academicYear: year.id, status: 'ACTIVE' }).lean(),
    CasSubject.findOne({ _id: subject, school: actor.school, grade: grade.trim(), status: 'ACTIVE', ...EXAMINED_FILTER }).lean(),
    teacherIds.length
      ? teacherIdsAtSchool(actor.school).then((ids) => {
        const active = new Set(ids.map(String));
        return teacherIds.filter((id) => active.has(id));
      })
      : [],
  ]);
  assert(examRow, 'Exam unavailable for this academic year', 404);
  assert(subjectRow, 'Subject unavailable for this grade', 404);
  assert(teachers.length === teacherIds.length, 'Every assigned teacher must be active at your school', 409);

  const scope = {
    school: actor.school, academicYear: year.id, exam: examRow._id,
    grade: grade.trim(), subject: subjectRow._id,
  };
  // This is intentionally a replacement operation: an administrator can take
  // access away immediately. Existing marks are never deleted.
  await CasExamTeacherAssignment.deleteMany(scope);
  if (teacherIds.length) {
    await CasExamTeacherAssignment.insertMany(teacherIds.map((teacher) => ({
      ...scope, teacher, assignedBy: actor.id,
    })), { ordered: true });
  }
  return { ...scope, teacherIds };
}
