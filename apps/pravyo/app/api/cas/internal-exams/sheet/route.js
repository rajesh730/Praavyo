import { handler } from '@pravyo/cas/lib/casRoute';
import * as internal from '@/lib/exams/internalExamEndpoints';

export const dynamic = 'force-dynamic';

// Shared with the teacher API (/api/teacher/exams/...): see lib/exams/.
export const GET = handler(internal.sheet);
