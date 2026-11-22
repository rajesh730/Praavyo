import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { APIError } from "@/lib/apiResponse";
import { classTeacherGrades, listFreeWriting } from "@/lib/freeWritingDesk";
import { getTeacherMagazineSchool } from "@/lib/teacherMagazineDesk";

export const dynamic = "force-dynamic";

/**
 * The class teacher's Publishing Desk: Free Writing by students of the grades
 * they are class teacher of (Teachers page), at the school chosen in their
 * session. Same list and filters as the school's Free Writing tab.
 */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load student writing" }, async ({ request, session }) => {
  const school = await getTeacherMagazineSchool(session);
  const grades = await classTeacherGrades(session.user.id, school);
  if (!grades.length) {
    throw new APIError("Only class teachers manage the Publishing Desk", 403, "NOT_CLASS_TEACHER");
  }

  const payload = await listFreeWriting({
    school,
    searchParams: new URL(request.url).searchParams,
    allowedGrades: grades,
    trackUnread: false,
  });
  return NextResponse.json({ ...payload, grades });
});
