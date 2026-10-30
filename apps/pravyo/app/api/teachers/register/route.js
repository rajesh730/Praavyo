import bcrypt from "bcryptjs";
import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { ensureTeacherIndexes } from "@pravyo/db/teacherMemberships";
import { generateStrongPassword } from "@/lib/passwordGenerator";
import {
  EMPLOYMENT_TYPES,
  assertEmailAvailable,
  assertUsernameAvailable,
  cleanText,
  normalizeTeacherEmail,
  parseOptionalDate,
  resolveTeacherUsername,
} from "@/lib/teacherAccounts";

function membershipFields(body) {
  const employmentType = String(body.employmentType || "FULL_TIME").toUpperCase();
  if (!EMPLOYMENT_TYPES.includes(employmentType)) throw new APIError("Choose a valid employment type", 400, "VALIDATION_ERROR");
  return {
    designation: cleanText(body.designation, 80),
    employmentType,
    dateOfJoining: parseOptionalDate(body.dateOfJoining, "joining date"),
  };
}

/**
 * Add a teacher to this school.
 *
 *   mode "new"      — create the person's Pravyo login and add them here
 *   mode "existing" — they already teach elsewhere on Pravyo; add a membership
 *                     only. Their login and password stay their own.
 */
export const POST = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ request, session }) => {
  const school = session.user.id;
  await ensureTeacherIndexes();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new APIError("Send the teacher details", 400, "VALIDATION_ERROR");

  if (body.mode === "existing") {
    const identifier = String(body.identifier || "").trim().toLowerCase();
    if (!identifier) throw new APIError("Enter the teacher's email or username", 400, "VALIDATION_ERROR");
    const teacher = await Teacher.findOne({ $or: [{ email: identifier }, { username: identifier }] }).select("name").lean();
    if (!teacher) throw new APIError("No teacher account uses that email or username", 404, "NOT_FOUND");

    const current = await TeacherMembership.findOne({ teacher: teacher._id, school }).lean();
    if (current?.status === "LEFT") throw new APIError(`${teacher.name} worked here before. Open them under "Left" and choose Rejoin.`, 409, "CONFLICT");
    if (current) throw new APIError(`${teacher.name} is already a teacher at your school`, 409, "CONFLICT");

    await TeacherMembership.create({ teacher: teacher._id, school, status: "ACTIVE", addedBy: school, ...membershipFields(body) });
    return successResponse(201, `${teacher.name} was added to your school`, { teacherId: String(teacher._id), linkedExisting: true });
  }

  const name = cleanText(body.name, 120);
  if (!name) throw new APIError("Enter the teacher's full name", 400, "VALIDATION_ERROR");
  const email = normalizeTeacherEmail(body.email);
  const username = await resolveTeacherUsername({ username: body.username, name });
  await Promise.all([assertEmailAvailable(email), assertUsernameAvailable(username)]);

  const plainPassword = String(body.password || "") || generateStrongPassword();
  if (plainPassword.length < 10) throw new APIError("Password must contain at least 10 characters", 400, "VALIDATION_ERROR");
  const membership = membershipFields(body);

  const teacher = await Teacher.create({
    name,
    email,
    username,
    password: await bcrypt.hash(plainPassword, 10),
    phone: cleanText(body.phone, 30),
    subject: cleanText(body.subject, 120) || "General",
    qualification: cleanText(body.qualification, 120),
    gender: ["MALE", "FEMALE", "OTHER"].includes(body.gender) ? body.gender : undefined,
    address: cleanText(body.address, 300),
    experience: body.experience === "" || body.experience == null ? undefined : Math.max(0, Number(body.experience) || 0),
    bloodGroup: body.bloodGroup || "",
    // Kept for older code paths: the school that created the account.
    school,
    designation: membership.designation,
    employmentType: membership.employmentType,
    dateOfJoining: membership.dateOfJoining || undefined,
    roles: ["MENTOR"],
  });
  await TeacherMembership.create({ teacher: teacher._id, school, status: "ACTIVE", addedBy: school, ...membership });

  return successResponse(201, "Teacher registered", {
    teacherId: String(teacher._id),
    credentials: { name, username, email, password: plainPassword },
  });
});
