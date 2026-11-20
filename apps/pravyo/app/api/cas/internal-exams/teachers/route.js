import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { listExamTeachers } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

// Who enters each subject's marks in one grade's internal exam: read-only,
// from the Teachers page's subject teachers (set there, not here). School admin only.
export const GET = internalExamHandler(({ actor, query }) => listExamTeachers(actor, { exam: query.get('exam') || '' }));
