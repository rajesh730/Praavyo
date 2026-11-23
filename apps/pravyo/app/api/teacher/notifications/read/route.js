import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { markTeacherNotifications } from "@/lib/teacherNotifications";

export const dynamic = "force-dynamic";

/** Mark items of the teacher's bell read or unread. */
export const POST = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to update notifications" }, async ({ request, session }) => {
  const body = await request.json().catch(() => ({}));
  const result = await markTeacherNotifications(session, {
    action: String(body?.action || "read").toLowerCase() === "unread" ? "unread" : "read",
    items: Array.isArray(body?.notifications) ? body.notifications : [],
    allVisible: Boolean(body?.allVisible),
  });
  if (result.error) return NextResponse.json({ message: result.error.message }, { status: result.error.status });
  return NextResponse.json(result);
});
