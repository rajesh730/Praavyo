import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import { getTeacherNotificationPayload } from "@/lib/teacherNotifications";

export const dynamic = "force-dynamic";

/** The teacher's notification bell for the school chosen in their session. */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load notifications" }, async ({ request, session }) => {
  const requested = Number.parseInt(new URL(request.url).searchParams.get("limit") || "20", 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 100)) : 20;
  const payload = await getTeacherNotificationPayload(session, limit);
  if (payload.error) return NextResponse.json({ message: payload.error.message }, { status: payload.error.status });
  return NextResponse.json({ notifications: payload.notifications, unreadCount: payload.unreadCount });
});
