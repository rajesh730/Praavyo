import { handler, jsonBody, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadStudentRecord, saveStudentRecord } from '@pravyo/cas/lib/casStudentRecordService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const student = query.get('student');
  if (!academicYear || !grade || !student) {
    throw new HttpError('Choose a grade, academic year and student');
  }
  return loadStudentRecord(actor, { academicYear, grade, student });
});

export const POST = handler(async ({ actor, request }) =>
  saveStudentRecord(actor, await jsonBody(request)),
);
