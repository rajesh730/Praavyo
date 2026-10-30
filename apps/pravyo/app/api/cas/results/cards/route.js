import { handler } from '@pravyo/cas/lib/casRoute';
import { loadGradeReportCards } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/**
 * Report cards for a grade: the stored card for a published student, a live
 * preview for everyone else. `students` narrows it to a comma-separated list.
 */
export const GET = handler(({ actor, query }) => {
  const students = (query.get('students') || '').split(',').filter(Boolean);
  const themeAssignmentIds = (query.get('themeAssignmentIds') || '').split(',').filter(Boolean);
  return loadGradeReportCards(actor, {
    academicYear: query.get('academicYear') || '',
    grade: query.get('grade') || '',
    section: query.get('section') || undefined,
    format: query.get('format') || undefined,
    examTerm: query.get('examTerm') || undefined,
    examId: query.get('examId') || undefined,
    resultMode: query.get('resultMode') || undefined,
    includePrevious: query.get('includePrevious') === 'true',
    examTitle: query.get('examTitle') || undefined,
    ...(students.length ? { students } : {}),
    ...(themeAssignmentIds.length ? { themeAssignmentIds } : {}),
  });
});
