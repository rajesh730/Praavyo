import { handler, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadStudents, loadAcademicYear, loadGradeSections } from '@pravyo/cas/lib/casContext';
import { assertTeacherGradeAssignment } from '@pravyo/cas/lib/casTeacherAssignmentService';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import { studentTakesSubject } from '@pravyo/core/subjectScope';

export const dynamic = 'force-dynamic';

/**
 * The Pravyo roster for a grade and year. CAS never creates these records.
 * With `subject`, only the students who take that subject (its sections and,
 * for an optional subject, the students the school assigned to it).
 */
export const GET = handler(async ({ actor, query }) => {
  const grade = query.get('grade');
  const academicYear = query.get('academicYear');
  const section = query.get('section') || '';
  if (!grade || !academicYear) throw new HttpError('Choose a grade and academic year');
  const year = await loadAcademicYear(actor, academicYear);
  await assertTeacherGradeAssignment(actor, { academicYear: year.id, grade });
  const sections = await loadGradeSections(actor, grade);
  if (section && !sections.includes(section)) {
    throw new HttpError('Choose a section configured for this grade');
  }
  const subjectId = query.get('subject') || '';
  const subject = /^[a-f\d]{24}$/i.test(subjectId)
    ? await CasSubject.findOne({ _id: subjectId, school: actor.school, grade }).select('kind sections').lean()
    : null;
  const students = await loadStudents(actor, { grade, yearStart: year.yearStart });
  return students.filter((student) =>
    (!section || student.section === section) &&
    (!subject || studentTakesSubject(subject, student)));
});
