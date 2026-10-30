import { defineRoute } from '@/lib/routeHandler';
import { successResponse, APIError } from '@/lib/apiResponse';
import Student from '@/models/Student';
import { getEquivalentGradeValues } from '@/lib/schoolGrades';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import { offeredToSection, subjectId } from '@pravyo/core/subjectScope';

/**
 * Optional subjects, assigned by the SCHOOL (students never choose).
 *
 *   GET ?grade=&section=  — the grade's optional groups and each current
 *                            student's assigned subject per group
 *   PUT { grade, assignments: [{ student, subjects: [id] }] }
 *                          — at most one subject per group, and only subjects
 *                            offered to the student's section
 */

const ID = /^[a-f\d]{24}$/i;

async function optionalSubjects(school, grade) {
  return CasSubject.find({ school, grade, status: 'ACTIVE', kind: 'OPTIONAL' })
    .select('code titleEn titleNe optionalGroup sections')
    .sort({ optionalGroup: 1, sequence: 1, titleEn: 1 })
    .lean();
}

export const GET = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const { searchParams } = new URL(request.url);
  const grade = String(searchParams.get('grade') || '').trim();
  const section = String(searchParams.get('section') || '').trim();
  if (!grade) throw new APIError('Choose a grade', 400, 'VALIDATION_ERROR');

  const [subjects, students] = await Promise.all([
    optionalSubjects(school, grade),
    Student.find({
      school, status: 'ACTIVE', isDeleted: { $ne: true },
      grade: { $in: getEquivalentGradeValues(grade) },
      ...(section ? { section } : {}),
    }).select('name rollNumber section subjectChoices').sort({ rollNumber: 1, name: 1 }).lean(),
  ]);

  const groups = [...new Set(subjects.map((row) => row.optionalGroup))].map((group) => ({
    group,
    subjects: subjects.filter((row) => row.optionalGroup === group).map((row) => ({
      id: String(row._id), code: row.code, title: row.titleEn || row.titleNe || row.code, sections: row.sections || [],
    })),
  }));
  const optionalIds = new Set(subjects.map(subjectId));

  return successResponse(200, 'Optional subjects loaded', {
    groups,
    students: students.map((student) => ({
      id: String(student._id),
      name: student.name,
      rollNumber: student.rollNumber || '',
      section: student.section || '',
      choices: (student.subjectChoices || []).map(String).filter((id) => optionalIds.has(id)),
    })),
  });
});

export const PUT = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  const grade = String(body.grade || '').trim();
  if (!grade || !Array.isArray(body.assignments) || body.assignments.length > 500) {
    throw new APIError('Send the grade and the students’ optional subjects', 400, 'VALIDATION_ERROR');
  }
  const subjects = await optionalSubjects(school, grade);
  const byId = new Map(subjects.map((row) => [String(row._id), row]));
  const studentIds = body.assignments.map((row) => String(row?.student || '')).filter((id) => ID.test(id));
  const students = await Student.find({
    _id: { $in: studentIds }, school, isDeleted: { $ne: true }, grade: { $in: getEquivalentGradeValues(grade) },
  }).select('name section subjectChoices').lean();
  const studentById = new Map(students.map((row) => [String(row._id), row]));

  const writes = body.assignments.map((row) => {
    const student = studentById.get(String(row?.student || ''));
    if (!student) throw new APIError('One of the students is not in this grade', 400, 'VALIDATION_ERROR');
    const chosen = [...new Set((Array.isArray(row.subjects) ? row.subjects : []).map(String).filter(Boolean))];
    const seenGroups = new Set();
    for (const id of chosen) {
      const subject = byId.get(id);
      if (!subject) throw new APIError(`${student.name}: choose an optional subject of ${grade}`, 400, 'VALIDATION_ERROR');
      if (!offeredToSection(subject, student.section)) {
        throw new APIError(`${student.name}: ${subject.titleEn} is not offered to section ${student.section || '(none)'}`, 400, 'VALIDATION_ERROR');
      }
      if (seenGroups.has(subject.optionalGroup)) {
        throw new APIError(`${student.name}: choose only one subject from ${subject.optionalGroup}`, 400, 'VALIDATION_ERROR');
      }
      seenGroups.add(subject.optionalGroup);
    }
    // Choices for this grade's optional subjects are replaced; anything else
    // the student carries (e.g. from another grade) is left alone.
    const kept = (student.subjectChoices || []).map(String).filter((id) => !byId.has(id));
    return { updateOne: { filter: { _id: student._id }, update: { $set: { subjectChoices: [...kept, ...chosen] } } } };
  });
  if (writes.length) await Student.bulkWrite(writes, { ordered: false });
  return successResponse(200, `Optional subjects saved for ${writes.length} student${writes.length === 1 ? '' : 's'}`, { students: writes.length });
});
