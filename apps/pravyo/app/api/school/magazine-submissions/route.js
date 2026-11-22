import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import UserSurfaceSeenState from "@/models/UserSurfaceSeenState";
import { listFreeWriting } from "@/lib/freeWritingDesk";

// Free Writing for the whole school. Class teachers read the same list for
// their own grades through /api/teacher/publishing (lib/freeWritingDesk.js).
export async function GET(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;

    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // "New" = posted since the school last opened the wall (Instagram-style).
    const wallSeenState = await UserSurfaceSeenState.findOne({
      user: session.user.id,
      surface: "school.schoolWall",
    })
      .select("seenAt")
      .lean();

    const payload = await listFreeWriting({
      school: session.user.id,
      searchParams: new URL(request.url).searchParams,
      wallSeenAt: wallSeenState?.seenAt ? new Date(wallSeenState.seenAt) : null,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/school/magazine-submissions error:", error);
    return NextResponse.json(
      { message: "Failed to load school wall posts" },
      { status: 500 }
    );
  }
}
