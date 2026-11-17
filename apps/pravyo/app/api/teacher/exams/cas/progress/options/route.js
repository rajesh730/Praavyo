import { teacherHandler } from '@pravyo/cas/lib/casRoute';
import * as cas from '@/lib/exams/casEndpoints';

export const dynamic = 'force-dynamic';

// Teacher API. Same endpoint as the school's /api/cas/progress/options (lib/exams/),
// so marks land in the same records; teacherHandler admits teachers only,
// and the service limits them to their own grades and subjects.
export const GET = teacherHandler(cas.progressOptions);
