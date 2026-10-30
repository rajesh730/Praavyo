import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { requireApiSession } from "@/lib/authz";

export async function GET() {
  try {
    await connectDB();

    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // A teacher may work at several schools: use the one chosen for this session.
    const schoolId = session.user.role === "TEACHER"
      ? session.user.schoolId
      : session.user.schoolId || session.user.id;

    if (!schoolId) {
      return NextResponse.json(
        { error: "School context is required" },
        { status: 400 }
      );
    }

    const schoolUser = await User.findById(schoolId).select(
      "educationLevels schoolConfig schoolName role"
    );

    if (!schoolUser) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    if (schoolUser.role !== "SCHOOL_ADMIN") {
      return NextResponse.json(
        { error: "School configuration is only available for school accounts" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      educationLevels: schoolUser.educationLevels || {},
      schoolConfig: schoolUser.schoolConfig || {},
      schoolName: schoolUser.schoolName,
    });
  } catch (error) {
    console.error("Error fetching education config:", error);
    return NextResponse.json(
      { error: "Failed to fetch education configuration" },
      { status: 500 }
    );
  }
}
