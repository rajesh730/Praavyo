import { handler, jsonBody, HttpError } from '@pravyo/cas/lib/casRoute';
import { loadStudentSheet, saveSheet } from '@pravyo/cas/lib/casSheetService';
import { publishRealtimeEvent } from '@/lib/realtimeBus';

export const dynamic = 'force-dynamic';

/** One student's page out of their evaluation record book. */
export const GET = handler(({ actor, query }) => {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const subject = query.get('subject');
  const themeKey = query.get('theme');
  const student = query.get('student');
  const exam = query.get('exam');
  if (!academicYear || !grade || !subject || themeKey === null || !student || !exam) {
    throw new HttpError('Choose a grade, subject, student and theme');
  }
  return loadStudentSheet(actor, { academicYear, grade, subject, themeKey, student, exam });
});

/** Commit the whole filled sheet in one transaction. */
export const POST = handler(async ({ actor, request }) => {
  const saved = await saveSheet(actor, await jsonBody(request));
  // Persist first, then notify every authenticated CAS screen at this school.
  // The event holds invalidation metadata only; readers re-fetch through their
  // normal server-side authorization checks.
  publishRealtimeEvent(`cas-assessment:${actor.school}`, {
    type: 'CAS_ASSESSMENT_CHANGED',
    exam: saved.sheet.exam.id,
    grade: saved.sheet.grade,
    subject: saved.sheet.subject.id,
    student: saved.sheet.student.id,
  });
  return saved;
});
