import { handler, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadStudentSubjectProgress } from '@pravyo/cas/lib/casSheetService';

export const dynamic = 'force-dynamic';

/** One Pravyo student's subject progress, grouped by CAS theme. */
export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const subject = query.get('subject');
  const student = query.get('student');
  if (!academicYear || !grade || !subject || !student) {
    throw new HttpError('Choose a grade, student and subject');
  }
  return loadStudentSubjectProgress(actor, { academicYear, grade, subject, student });
});
