import { internalExamTeacherHandler } from '@/lib/exams/internalExamLock';
import * as internal from '@/lib/exams/internalExamEndpoints';

export const dynamic = 'force-dynamic';

// Teacher API. Same endpoint as the school's /api/cas/internal-exams/marks (lib/exams/),
// so marks land in the same records; teacherHandler admits teachers only,
// and the service limits them to their own grades and subjects.
export const PUT = internalExamTeacherHandler(internal.marks);
