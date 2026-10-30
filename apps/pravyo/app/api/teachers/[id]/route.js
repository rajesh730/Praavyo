import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import {
  EMPLOYMENT_TYPES,
  assertEmailAvailable,
  assertUsernameAvailable,
  cleanText,
  loadSchoolTeacher,
  normalizeTeacherEmail,
  normalizeTeacherUsername,
  parseOptionalDate,
  suggestTeacherUsername,
  worksElsewhere,
} from "@/lib/teacherAccounts";

function serialize(teacher, membership, shared) {
  return {
    _id: String(teacher._id),
    name: teacher.name,
    email: teacher.email,
    username: teacher.username || "",
    phone: teacher.phone || "",
    subject: teacher.subject || "",
    qualification: teacher.qualification || "",
    gender: teacher.gender || "",
    address: teacher.address || "",
    experience: teacher.experience ?? "",
    bloodGroup: teacher.bloodGroup || "",
    status: membership.status,
    designation: membership.designation || "",
    employmentType: membership.employmentType || "FULL_TIME",
    dateOfJoining: membership.dateOfJoining,
    leftAt: membership.leftAt,
    leftNote: membership.leftNote || "",
    endedAssignments: membership.endedAssignments || [],
    worksElsewhere: shared,
    // A teacher who also works at another school owns their login and personal
    // details; this school can still change its own designation and dates.
    canEditProfile: !shared,
    canResetPassword: !shared,
  };
}

export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, session }) => {
  const { teacher, membership } = await loadSchoolTeacher(params.id, session.user.id);
  const shared = await worksElsewhere(teacher._id, session.user.id);
  return successResponse(200, "Teacher loaded", { teacher: serialize(teacher, membership, shared) });
});

export const PUT = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, request, session }) => {
  const school = session.user.id;
  const { teacher, membership } = await loadSchoolTeacher(params.id, school);
  if (membership.status === "LEFT") throw new APIError("Rejoin this teacher before editing their record", 409, "CONFLICT");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new APIError("Send the teacher details", 400, "VALIDATION_ERROR");

  const employmentType = String(body.employmentType || membership.employmentType || "FULL_TIME").toUpperCase();
  if (!EMPLOYMENT_TYPES.includes(employmentType)) throw new APIError("Choose a valid employment type", 400, "VALIDATION_ERROR");
  await TeacherMembership.updateOne({ _id: membership._id }, {
    $set: {
      designation: cleanText(body.designation, 80),
      employmentType,
      dateOfJoining: parseOptionalDate(body.dateOfJoining, "joining date"),
    },
  });

  const shared = await worksElsewhere(teacher._id, school);
  if (!shared) {
    const name = cleanText(body.name, 120);
    if (!name) throw new APIError("Enter the teacher's full name", 400, "VALIDATION_ERROR");
    const email = normalizeTeacherEmail(body.email);
    // Older accounts may have no username yet; give them one on first save.
    const username = String(body.username || "").trim()
      ? normalizeTeacherUsername(body.username)
      : teacher.username || await suggestTeacherUsername(name);
    if (email !== teacher.email) await assertEmailAvailable(email, teacher._id);
    if (username !== teacher.username) await assertUsernameAvailable(username, teacher._id);
    await Teacher.updateOne({ _id: teacher._id }, {
      $set: {
        name,
        email,
        username,
        phone: cleanText(body.phone, 30),
        subject: cleanText(body.subject, 120) || teacher.subject || "General",
        qualification: cleanText(body.qualification, 120),
        address: cleanText(body.address, 300),
        bloodGroup: body.bloodGroup || "",
        experience: body.experience === "" || body.experience == null ? null : Math.max(0, Number(body.experience) || 0),
        ...(["MALE", "FEMALE", "OTHER"].includes(body.gender) ? { gender: body.gender } : {}),
      },
    }, { runValidators: true });
  }

  const fresh = await loadSchoolTeacher(teacher._id, school);
  return successResponse(200, shared
    ? "School details saved. Personal details are managed by the teacher because they also work at another school."
    : "Teacher updated", { teacher: serialize(fresh.teacher, fresh.membership, shared) });
});
