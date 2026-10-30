import { defineRoute } from "@/lib/routeHandler";
import { successResponse, APIError } from "@/lib/apiResponse";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { endTeacherWorkAtSchool } from "@pravyo/db/teacherMemberships";
import { cleanText, loadSchoolTeacher, parseOptionalDate } from "@/lib/teacherAccounts";

/**
 * Change a teacher's standing at THIS school only. Their account and any other
 * school they work at are untouched.
 *
 *   ACTIVE   — activate, or rejoin a teacher who left (history is kept)
 *   INACTIVE — temporary block; assignments stay in place
 *   LEFT     — left the school: assignments are archived on the membership and
 *              exam mark-entry access is withdrawn. Nothing is deleted.
 *
 * The session check re-reads memberships, so access ends within a minute and
 * every teacher API refuses immediately.
 */
export const PATCH = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ params, request, session }) => {
  const school = session.user.id;
  const { teacher, membership } = await loadSchoolTeacher(params.id, school);
  const body = await request.json().catch(() => null);
  const status = String(body?.status || "").toUpperCase();
  if (!["ACTIVE", "INACTIVE", "LEFT"].includes(status)) throw new APIError("Choose Active, Inactive or Left", 400, "VALIDATION_ERROR");
  if (status === membership.status) return successResponse(200, "No change", { status });

  const now = new Date();
  const base = { status, statusChangedAt: now, statusChangedBy: school };

  if (status === "LEFT") {
    const leftAt = parseOptionalDate(body.leftAt, "leaving date") || now;
    const ended = await endTeacherWorkAtSchool(teacher._id, school);
    await TeacherMembership.updateOne({ _id: membership._id }, {
      $set: { ...base, leftAt, leftNote: cleanText(body.note, 300) },
      $push: { endedAssignments: { $each: ended } },
    });
    return successResponse(200, `${teacher.name} is marked as left. Their records are kept.`, { status });
  }

  if (status === "INACTIVE" && membership.status === "LEFT") {
    throw new APIError("Rejoin the teacher first, then set them inactive", 409, "CONFLICT");
  }

  const rejoining = membership.status === "LEFT";
  await TeacherMembership.updateOne({ _id: membership._id }, {
    $set: {
      ...base,
      ...(rejoining ? { leftAt: null, leftNote: "", dateOfJoining: parseOptionalDate(body?.dateOfJoining, "joining date") || now } : {}),
    },
  });
  return successResponse(200, rejoining
    ? `${teacher.name} rejoined. Assign their grades and subjects again.`
    : status === "ACTIVE" ? `${teacher.name} is active` : `${teacher.name} is inactive and cannot sign in to your school`, { status });
});
