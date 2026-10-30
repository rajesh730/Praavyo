import { defineRoute } from '@/lib/routeHandler';
import { successResponse, APIError } from '@/lib/apiResponse';
import { loadSchoolTeacher } from '@/lib/teacherAccounts';
import SchoolConfig from '@/models/SchoolConfig';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';

const TYPES = new Set(['SUBJECT_TEACHER', 'CLASS_TEACHER']);
const ID = /^[a-f\d]{24}$/i;

function asId(value, label) {
  const id = String(value || '');
  if (!ID.test(id)) throw new APIError(`Choose a valid ${label}`, 400, 'VALIDATION_ERROR');
  return id;
}

async function teacherForSchool(id, school) {
  const { teacher, membership } = await loadSchoolTeacher(id, school);
  return { ...teacher, membershipStatus: membership.status };
}

async function assignmentOptions(school) {
  const [config, subjects] = await Promise.all([
    SchoolConfig.findOne({ school }).select('grades').lean(),
    CasSubject.find({ school, status: 'ACTIVE' })
      .select('grade code titleEn titleNe').sort({ grade: 1, sequence: 1, titleEn: 1 }).lean(),
  ]);
  return {
    grades: config?.grades || [],
    subjects: subjects.map((subject) => ({
      id: String(subject._id), grade: subject.grade, code: subject.code,
      title: subject.titleEn || subject.titleNe || subject.code,
    })),
  };
}

export const GET = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ params, session }) => {
  const teacherId = asId(params.id, 'teacher');
  await teacherForSchool(teacherId, session.user.id);
  const [options, assignments] = await Promise.all([
    assignmentOptions(session.user.id),
    TeacherTeachingAssignment.find({ school: session.user.id, teacher: teacherId }).sort({ grade: 1, assignmentType: 1 }).lean(),
  ]);
  return successResponse(200, 'Teaching assignments loaded', {
    ...options,
    assignments: assignments.map((assignment) => ({
      id: String(assignment._id), grade: assignment.grade,
      assignmentType: assignment.assignmentType,
      subject: assignment.subject ? String(assignment.subject) : null,
    })),
  });
});

export const PUT = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ params, request, session }) => {
  const teacherId = asId(params.id, 'teacher');
  const teacher = await teacherForSchool(teacherId, session.user.id);
  if (teacher.membershipStatus === 'LEFT') throw new APIError('This teacher has left your school. Rejoin them before assigning work.', 409, 'CONFLICT');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.assignments)) {
    throw new APIError('Send a list of teaching assignments', 400, 'VALIDATION_ERROR');
  }
  if (body.assignments.length > 50) throw new APIError('A teacher can have at most 50 teaching assignments', 400, 'VALIDATION_ERROR');

  const options = await assignmentOptions(session.user.id);
  const grades = new Set(options.grades);
  const subjects = new Map(options.subjects.map((subject) => [subject.id, subject]));
  const seen = new Set();
  const rows = body.assignments.map((entry) => {
    const grade = String(entry?.grade || '').trim();
    const assignmentType = String(entry?.assignmentType || '');
    if (!grades.has(grade)) throw new APIError('Choose a grade configured for this school', 400, 'VALIDATION_ERROR');
    if (!TYPES.has(assignmentType)) throw new APIError('Choose a valid teaching responsibility', 400, 'VALIDATION_ERROR');
    const subjectId = assignmentType === 'SUBJECT_TEACHER' ? asId(entry?.subject, 'subject') : null;
    const subject = subjectId ? subjects.get(subjectId) : null;
    if (assignmentType === 'SUBJECT_TEACHER' && (!subject || subject.grade !== grade)) {
      throw new APIError('Choose a subject that belongs to the selected grade', 400, 'VALIDATION_ERROR');
    }
    const key = `${grade}:${assignmentType}:${subjectId || ''}`;
    if (seen.has(key)) throw new APIError('Each teaching responsibility can be added once', 400, 'VALIDATION_ERROR');
    seen.add(key);
    return { school: session.user.id, teacher: teacherId, grade, assignmentType, subject: subjectId, assignedBy: session.user.id };
  });

  await TeacherTeachingAssignment.deleteMany({ school: session.user.id, teacher: teacherId });
  if (rows.length) await TeacherTeachingAssignment.insertMany(rows, { ordered: true });
  return successResponse(200, 'Teaching assignments saved', { assignments: rows.length });
});
