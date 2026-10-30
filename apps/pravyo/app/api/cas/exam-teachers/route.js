import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import {
  listExamTeacherAssignments,
  setExamTeacherAssignments,
} from '@pravyo/cas/lib/casTeacherAssignmentService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => listExamTeacherAssignments(actor, {
  academicYear: query.get('academicYear') || undefined,
  grade: query.get('grade') || undefined,
}));

export const POST = handler(async ({ actor, request }) =>
  setExamTeacherAssignments(actor, await jsonBody(request)));
