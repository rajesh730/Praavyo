import { defineRoute } from "@/lib/routeHandler";
import { successResponse } from "@/lib/apiResponse";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { suggestTeacherUsername } from "@/lib/teacherAccounts";

/**
 * Registration helper.
 *   ?identifier=email-or-username → does a Pravyo teacher account already exist?
 *   ?suggestFor=Full Name         → a free username to pre-fill
 *
 * Only the name is revealed for an existing account: enough for the school to
 * confirm it is the right person, nothing about their other schools.
 */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ request, session }) => {
  const { searchParams } = new URL(request.url);
  const suggestFor = String(searchParams.get("suggestFor") || "").trim();
  if (suggestFor) {
    return successResponse(200, "Username suggested", { username: await suggestTeacherUsername(suggestFor) });
  }

  const identifier = String(searchParams.get("identifier") || "").trim().toLowerCase();
  if (identifier.length < 3) return successResponse(200, "No match", { exists: false });

  const teacher = await Teacher.findOne({ $or: [{ email: identifier }, { username: identifier }] })
    .select("name username").lean();
  if (!teacher) return successResponse(200, "No match", { exists: false });

  const membership = await TeacherMembership.findOne({ teacher: teacher._id, school: session.user.id })
    .select("status").lean();
  return successResponse(200, "Teacher account found", {
    exists: true,
    teacherId: String(teacher._id),
    name: teacher.name,
    username: teacher.username || "",
    statusHere: membership?.status || null,
  });
});
