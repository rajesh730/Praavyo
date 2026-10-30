import { defineRoute } from '@/lib/routeHandler';
import { successResponse } from '@/lib/apiResponse';
import { activeSchoolsForTeacher } from '@pravyo/db/teacherMemberships';

/** Schools the signed-in teacher can open now, for the school chooser. */
export const GET = defineRoute({ roles: ['TEACHER'] }, async ({ session }) => {
  const schools = await activeSchoolsForTeacher(session.user.id);
  return successResponse(200, 'Schools loaded', {
    schools,
    currentSchoolId: session.user.schoolId || null,
  });
});
