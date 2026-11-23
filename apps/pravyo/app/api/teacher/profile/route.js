import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import User from "@/models/User";
import { assertEmailAvailable, cleanText, normalizeTeacherEmail } from "@/lib/teacherAccounts";

const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

/**
 * A teacher updates their own name, email and phone from My Profile. The
 * account is the teacher's (it can span several schools), so every school
 * they work at sees the new details. Username, designation and roles stay
 * with the school.
 */
export const PATCH = defineRoute({ roles: ["TEACHER"] }, async ({ request, session }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new APIError("Send your details", 400, "VALIDATION_ERROR");

  const teacher = await Teacher.findById(session.user.id).select("name email phone").lean();
  if (!teacher) throw new APIError("Teacher account not found", 404, "NOT_FOUND");

  const name = cleanText(body.name, 120);
  if (!name) throw new APIError("Enter your full name", 400, "VALIDATION_ERROR");
  const email = normalizeTeacherEmail(body.email);
  const phone = cleanText(body.phone, 30);
  if (phone && !PHONE_PATTERN.test(phone)) {
    throw new APIError("Enter a valid phone number (digits, spaces, + or -)", 400, "VALIDATION_ERROR");
  }

  const emailChanged = email !== teacher.email;
  if (emailChanged) await assertEmailAvailable(email, teacher._id);

  await Teacher.updateOne({ _id: teacher._id }, { $set: { name, email, phone } }, { runValidators: true });

  // Older teachers also have a shadow User login keyed by email; keep it in step
  // (as the password change does), unless another login already holds the email.
  const shadowPatch = { name };
  if (emailChanged && !(await User.exists({ email }))) shadowPatch.email = email;
  await User.updateOne({ email: teacher.email, role: "TEACHER" }, { $set: shadowPatch });

  return successResponse(200, "Profile updated", {
    teacher: { name, email, phone },
  });
});
