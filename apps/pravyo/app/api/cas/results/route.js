import { handler } from '@pravyo/cas/lib/casRoute';
import { loadGradeResults } from '@pravyo/cas/lib/casReportService';

export const dynamic = 'force-dynamic';

/** Live final results for every Pravyo student in a grade and year. */
export const GET = handler(({ actor, query }) =>
  loadGradeResults(actor, {
    academicYear: query.get('academicYear') || '',
    grade: query.get('grade') || '',
    examTerm: query.get('examTerm') || undefined,
    examId: query.get('examId') || undefined,
    resultMode: query.get('resultMode') || undefined,
    includePrevious: query.get('includePrevious') === 'true',
    ...((query.get('themeAssignmentIds') || '').split(',').filter(Boolean).length
      ? { themeAssignmentIds: (query.get('themeAssignmentIds') || '').split(',').filter(Boolean) }
      : {}),
  }),
);
