import { internalExamHandler } from '@/lib/exams/internalExamLock';
import * as internal from '@/lib/exams/internalExamEndpoints';

export const dynamic = 'force-dynamic';

// Shared with the teacher API (/api/teacher/exams/...): see lib/exams/.
export const GET = internalExamHandler(internal.sheet);
