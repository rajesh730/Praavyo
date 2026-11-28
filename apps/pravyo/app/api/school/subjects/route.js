import mongoose from 'mongoose';
import { defineRoute } from '@/lib/routeHandler';
import { successResponse, APIError } from '@/lib/apiResponse';
import User from '@/models/User';
import Student from '@/models/Student';
import SchoolConfig from '@/models/SchoolConfig';
import { resolveSchoolGrades } from '@/lib/schoolGrades';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { createSubject, updateSubject, deleteSubject } from '@pravyo/cas/lib/casCurriculumService';

/**
 * The school's subject register — the single source of truth for subjects,
 * for daily teaching and for CAS alike. A subject is taught, examined or both;
 * CAS shows only examined subjects. Optional subjects belong to a group and
 * the school assigns each student one per group (./choices).
 *
 * Writes go through the CAS curriculum service, so code uniqueness and the
 * "archive, never delete, a subject that already has marks" rule stay in one
 * place.
 */

const ID = /^[a-f\d]{24}$/i;
const adminActor = (session) => ({ id: session.user.id, role: 'SCHOOL_ADMIN', school: session.user.id });

function rethrow(error) {
  if (error instanceof APIError) throw error;
  if (error?.name === 'ZodError') {
    throw new APIError(error.issues?.[0]?.message || 'Check the subject details', 400, 'VALIDATION_ERROR');
  }
  if (error?.status) throw new APIError(error.message, error.status, 'ERROR');
  throw error;
}

async function gradeContext(school) {
  const [user, config] = await Promise.all([
    User.findById(school).select('schoolConfig').lean(),
    SchoolConfig.findOne({ school }).select('gradeSections grades gradesCustomized').lean(),
  ]);
  const grades = resolveSchoolGrades(user?.schoolConfig, config);
  const sectionsFor = (grade) => config?.gradeSections?.find((row) => row.grade === grade)?.sections || [];
  return { grades, sectionsFor };
}

/** Validate and normalise the usage fields against the grade's sections. */
function usage(body, sections) {
  const kind = body.kind === 'OPTIONAL' ? 'OPTIONAL' : 'COMPULSORY';
  const optionalGroup = kind === 'OPTIONAL' ? String(body.optionalGroup || '').trim() : '';
  if (kind === 'OPTIONAL' && !optionalGroup) {
    throw new APIError('Name the optional group, e.g. "Optional I"', 400, 'VALIDATION_ERROR');
  }
  const chosen = Array.isArray(body.sections) ? body.sections.map((value) => String(value).trim()).filter(Boolean) : [];
  const unknown = chosen.find((name) => !sections.some((section) => section.toLowerCase() === name.toLowerCase()));
  if (unknown) throw new APIError(`Section ${unknown} does not exist in this grade`, 400, 'VALIDATION_ERROR');
  const taught = body.taught !== false;
  const examined = body.examined !== false;
  if (!taught && !examined) throw new APIError('A subject must be taught, examined, or both', 400, 'VALIDATION_ERROR');
  return { taught, examined, kind, optionalGroup, sections: chosen };
}

function suggestCode(title, taken) {
  const base = (String(title).toUpperCase().match(/[A-Z0-9]+/g) || ['SUBJ']).join('').slice(0, 12) || 'SUBJ';
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base.slice(0, 10)}${n}`;
  return code;
}

function serialize(row, teacherCount, studentCount) {
  return {
    id: String(row._id),
    grade: row.grade,
    code: row.code,
    titleEn: row.titleEn,
    titleNe: row.titleNe || '',
    creditHours: row.creditHours ?? null,
    taught: row.taught !== false,
    examined: row.examined !== false,
    kind: row.kind || 'COMPULSORY',
    optionalGroup: row.optionalGroup || '',
    sections: row.sections || [],
    teachers: teacherCount || 0,
    students: studentCount || 0,
  };
}

export const GET = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ session }) => {
  const school = session.user.id;
  const { grades, sectionsFor } = await gradeContext(school);
  const subjects = await CasSubject.find({ school, status: 'ACTIVE' }).sort({ grade: 1, sequence: 1, titleEn: 1 }).lean();
  const ids = subjects.map((row) => row._id);
  const [teacherRows, choiceRows] = await Promise.all([
    TeacherTeachingAssignment.aggregate([
      { $match: { subject: { $in: ids } } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: { school: new mongoose.Types.ObjectId(school), isDeleted: { $ne: true }, subjectChoices: { $in: ids } } },
      { $unwind: '$subjectChoices' },
      { $match: { subjectChoices: { $in: ids } } },
      { $group: { _id: '$subjectChoices', count: { $sum: 1 } } },
    ]),
  ]);
  const teachers = new Map(teacherRows.map((row) => [String(row._id), row.count]));
  const students = new Map(choiceRows.map((row) => [String(row._id), row.count]));
  return successResponse(200, 'Subjects loaded', {
    grades: grades.map((grade) => ({
      grade,
      sections: sectionsFor(grade),
      subjects: subjects.filter((row) => row.grade === grade)
        .map((row) => serialize(row, teachers.get(String(row._id)), students.get(String(row._id)))),
    })),
  });
});

export const POST = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  const { grades, sectionsFor } = await gradeContext(school);
  const grade = String(body.grade || '').trim();
  if (!grades.includes(grade)) throw new APIError('Choose a grade configured for this school', 400, 'VALIDATION_ERROR');
  const titleEn = String(body.titleEn || '').trim();
  if (!titleEn) throw new APIError('Enter the subject name', 400, 'VALIDATION_ERROR');

  const existing = await CasSubject.find({ school, grade }).select('code titleEn status').lean();
  if (existing.some((row) => row.status === 'ACTIVE' && row.titleEn.toLowerCase() === titleEn.toLowerCase())) {
    throw new APIError(`${grade} already has ${titleEn}`, 409, 'CONFLICT');
  }
  const code = String(body.code || '').trim() || suggestCode(titleEn, new Set(existing.map((row) => row.code)));
  try {
    const created = await createSubject(adminActor(session), {
      grade,
      code,
      titleEn,
      titleNe: String(body.titleNe || '').trim(),
      creditHours: body.creditHours === '' || body.creditHours == null ? null : Number(body.creditHours),
      ...usage(body, sectionsFor(grade)),
    });
    return successResponse(201, `${titleEn} added to ${grade}`, { subject: created });
  } catch (error) {
    rethrow(error);
  }
});

export const PATCH = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  if (!ID.test(String(body.id || ''))) throw new APIError('Choose a subject', 400, 'VALIDATION_ERROR');
  const current = await CasSubject.findOne({ _id: body.id, school, status: 'ACTIVE' }).lean();
  if (!current) throw new APIError('Subject not found', 404, 'NOT_FOUND');
  const { sectionsFor } = await gradeContext(school);
  const next = usage(body, sectionsFor(current.grade));
  try {
    await updateSubject(adminActor(session), {
      subject: String(current._id),
      titleEn: String(body.titleEn || current.titleEn).trim(),
      titleNe: String(body.titleNe ?? current.titleNe ?? '').trim(),
      creditHours: body.creditHours === '' || body.creditHours == null ? null : Number(body.creditHours),
      ...next,
    });
  } catch (error) {
    rethrow(error);
  }
  // A subject that stops being optional no longer belongs in students' choices.
  if (current.kind === 'OPTIONAL' && next.kind !== 'OPTIONAL') {
    await Student.updateMany({ school, subjectChoices: current._id }, { $pull: { subjectChoices: current._id } });
  }
  // A subject that is no longer examined cannot carry exam mark-entry access.
  if (current.examined !== false && !next.examined) {
    await CasExamTeacherAssignment.deleteMany({ school, subject: current._id });
  }
  return successResponse(200, 'Subject updated', {});
});

export const DELETE = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  if (!ID.test(String(body.id || ''))) throw new APIError('Choose a subject', 400, 'VALIDATION_ERROR');
  const subject = await CasSubject.findOne({ _id: body.id, school }).lean();
  if (!subject) throw new APIError('Subject not found', 404, 'NOT_FOUND');

  let outcome;
  try {
    outcome = await deleteSubject(adminActor(session), { id: String(subject._id) });
  } catch (error) {
    rethrow(error);
  }
  // Everything that pointed at the subject for current work is cleared.
  // Recorded marks and published results are kept (the subject is archived
  // rather than deleted when marks exist).
  const [teaching, exam, choices] = await Promise.all([
    TeacherTeachingAssignment.deleteMany({ school, subject: subject._id }),
    CasExamTeacherAssignment.deleteMany({ school, subject: subject._id }),
    Student.updateMany({ school, subjectChoices: subject._id }, { $pull: { subjectChoices: subject._id } }),
  ]);
  return successResponse(200, outcome.archived
    ? `${subject.titleEn} removed. It already had recorded marks, so those marks and published results are kept.`
    : `${subject.titleEn} deleted.`, {
    archived: outcome.archived,
    teacherAssignments: teaching.deletedCount || 0,
    examAccess: exam.deletedCount || 0,
    students: choices.modifiedCount || 0,
  });
});
