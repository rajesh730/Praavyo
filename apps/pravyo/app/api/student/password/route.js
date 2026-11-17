import bcrypt from "bcryptjs";
import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Student from "@/models/Student";
import { DEFAULT_STUDENT_PASSWORD } from "@/lib/passwordGenerator";

/**
 * A student changes their own password, away from the `password@123` every
 * student starts with (and gets back after a school reset).
 *
 * The account is matched by id only: usernames are unique per school, not
 * across the platform, so they must never pick the account to change.
 */
export const POST = defineRoute({ roles: ["STUDENT"] }, async ({ request, session }) => {
  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    throw new APIError("Enter your current password and a new one", 400, "VALIDATION_ERROR");
  }
  if (newPassword.length < 8) {
    throw new APIError("New password must contain at least 8 characters", 400, "VALIDATION_ERROR");
  }
  if (newPassword === DEFAULT_STUDENT_PASSWORD) {
    throw new APIError("Choose a password other than the starting password", 400, "VALIDATION_ERROR");
  }

  const student = await Student.findOne({
    _id: session.user.id,
    isDeleted: { $ne: true },
    status: "ACTIVE",
  }).select("password");
  if (!student) throw new APIError("Student account not found", 404, "NOT_FOUND");
  if (!student.password || !(await bcrypt.compare(currentPassword, student.password))) {
    throw new APIError("Your current password is incorrect", 400, "VALIDATION_ERROR");
  }
  if (await bcrypt.compare(newPassword, student.password)) {
    throw new APIError("Choose a password different from your current one", 400, "VALIDATION_ERROR");
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await Student.updateOne({ _id: student._id }, { $set: { password: hashed } });

  return successResponse(200, "Password changed");
});
