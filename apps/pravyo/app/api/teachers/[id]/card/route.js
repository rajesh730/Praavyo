import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import { loadSchoolTeacher, teacherCardSignInToken } from "@/lib/teacherAccounts";

/**
 * The token behind a teacher's on-screen login card. `cardToken` is null when
 * the card can only fill in the username (see teacherCardSignInToken).
 */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, session }) => {
  const school = session.user.id;
  const { teacher, membership } = await loadSchoolTeacher(params.id, school);
  if (membership.status === "LEFT") throw new APIError("This teacher has left your school", 409, "CONFLICT");
  return successResponse(200, "Login card", { cardToken: await teacherCardSignInToken(teacher, school) });
});
