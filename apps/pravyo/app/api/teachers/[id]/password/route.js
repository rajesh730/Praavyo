import bcrypt from "bcryptjs";
import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import User from "@/models/User";
import { loadSchoolTeacher, worksElsewhere } from "@/lib/teacherAccounts";
import { teacherCardToken } from "@pravyo/auth/teacherCardToken";

// What a reset sets unless the school types its own. The teacher changes it
// from My Profile after signing in.
const DEFAULT_TEACHER_PASSWORD = "password@123";

/**
 * Reset a teacher's password and show it once. Refused when the teacher also
 * works at another school: one school must not change a login another school's
 * teacher relies on.
 *
 * A reset also retires every printed login card (cardVersion + 1), so it is
 * the way to cut off a lost card. The response carries the new card token.
 */
export const POST = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, request, session }) => {
  const school = session.user.id;
  const { teacher, membership } = await loadSchoolTeacher(params.id, school);
  if (membership.status === "LEFT") throw new APIError("This teacher has left your school", 409, "CONFLICT");
  if (await worksElsewhere(teacher._id, school)) {
    throw new APIError("This teacher also works at another school, so only they can change their password.", 403, "FORBIDDEN");
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body?.password || "") || DEFAULT_TEACHER_PASSWORD;
  if (password.length < 8) throw new APIError("Password must contain at least 8 characters", 400, "VALIDATION_ERROR");
  const hashed = await bcrypt.hash(password, 10);

  const updated = await Teacher.findOneAndUpdate(
    { _id: teacher._id },
    { $set: { password: hashed }, $inc: { cardVersion: 1 } },
    { new: true, projection: { cardVersion: 1 } },
  ).lean();
  // Older teachers also had a shadow User login; keep it from accepting the old password.
  await User.updateOne({ email: teacher.email, role: "TEACHER" }, { $set: { password: hashed } });

  return successResponse(200, "Password reset", {
    credentials: { name: teacher.name, username: teacher.username || "", email: teacher.email, password },
    cardToken: teacherCardToken(updated),
  });
});
