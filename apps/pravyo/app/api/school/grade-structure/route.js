import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SchoolConfig from "@/models/SchoolConfig";
import User from "@/models/User";
import { requireApiSession } from "@/lib/authz";
import { buildGradeLabels } from "@/lib/schoolGrades";

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
      return NextResponse.json({ error: "School context is required" }, { status: 400 });
    }

    const [school, schoolConfig] = await Promise.all([
      User.findById(schoolId).select("schoolConfig"),
      SchoolConfig.findOne({ school: schoolId }),
    ]);

    const grades = buildGradeLabels(school?.schoolConfig);
    if (
      schoolConfig &&
      JSON.stringify(schoolConfig.grades || []) !== JSON.stringify(grades)
    ) {
      schoolConfig.grades = grades;
      await schoolConfig.save();
    }

    const formattedGrades = grades.map((grade) => ({
      _id: grade,
      name: grade,
      originalValue: grade,
    }));

    return NextResponse.json({
      grades: formattedGrades,
      summary: {
        totalGrades: formattedGrades.length,
      },
    });
  } catch (error) {
    console.error("Error fetching grade structure:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
