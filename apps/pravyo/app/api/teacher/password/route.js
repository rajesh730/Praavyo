import bcrypt from "bcryptjs";
import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import User from "@/models/User";

/**
 * A teacher changes their own password, typically away from the
 * `password@123` a school reset sets. Their login card keeps working: only a
 * school reset retires cards.
 */
export const POST = defineRoute({ roles: ["TEACHER"] }, async ({ request, session }) => {
  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    throw new APIError("Enter your current password and a new one", 400, "VALIDATION_ERROR");
  }
  if (newPassword.length < 8) {
    throw new APIError("New password must contain at least 8 characters", 400, "VALIDATION_ERROR");
  }

  const teacher = await Teacher.findById(session.user.id).select("password email");
  if (!teacher) throw new APIError("Teacher account not found", 404, "NOT_FOUND");
  if (!teacher.password || !(await bcrypt.compare(currentPassword, teacher.password))) {
    throw new APIError("Your current password is incorrect", 400, "VALIDATION_ERROR");
  }
  if (await bcrypt.compare(newPassword, teacher.password)) {
    throw new APIError("Choose a password different from your current one", 400, "VALIDATION_ERROR");
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await Teacher.updateOne({ _id: teacher._id }, { $set: { password: hashed } });
  // Older teachers also had a shadow User login; keep it from accepting the old password.
  await User.updateOne({ email: teacher.email, role: "TEACHER" }, { $set: { password: hashed } });

  return successResponse(200, "Password changed");
});
