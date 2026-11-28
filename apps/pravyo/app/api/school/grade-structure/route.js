import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SchoolConfig from "@/models/SchoolConfig";
import User from "@/models/User";
import { requireApiSession } from "@/lib/authz";
import { GRADE_CATALOG, isPrimaryLevel, normalizeGradeValue, sortGrades } from "@/lib/schoolGrades";
import { countStudentsByGrade, gradesFromRecords } from "@/lib/schoolGradeConfig";

/**
 * The school's grades — the list every grade dropdown in the school, teacher
 * and CAS screens uses.
 *
 * GET  `{ grades: [{ _id, name, originalValue }], summary }` — unchanged shape
 *      for existing screens. Extra: `catalog` (grades a school can offer),
 *      `customized`, and with `?counts=1` `studentCounts` per grade.
 * PUT  `{ grades: ["Nursery", "LKG", "Grade 1", …] }` (school admins) — the
 *      school's new grade list (Settings → Academic Setup → Grades). A grade
 *      that still has students on the roll cannot be removed: the school
 *      moves them first. Removing a grade never touches students, sections,
 *      subjects, exams, results or any other record; it only stops offering
 *      the grade, and adding it back brings everything back.
 */

function schoolIdOf(session) {
  // A teacher may work at several schools: use the one chosen for this session.
  return session.user.role === "TEACHER"
    ? session.user.schoolId
    : session.user.schoolId || session.user.id;
}

export async function GET(request) {
  try {
    await connectDB();

    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = schoolIdOf(session);
    if (!schoolId) {
      return NextResponse.json({ error: "School context is required" }, { status: 400 });
    }

    const [school, schoolConfig] = await Promise.all([
      User.findById(schoolId).select("schoolConfig").lean(),
      SchoolConfig.findOne({ school: schoolId }),
    ]);
    const grades = await gradesFromRecords(school, schoolConfig);

    const formattedGrades = grades.map((grade) => ({
      _id: grade,
      name: grade,
      originalValue: grade,
    }));

    const wantsCounts = new URL(request.url).searchParams.get("counts") === "1";
    const studentCounts =
      wantsCounts && session.user.role === "SCHOOL_ADMIN"
        ? await countStudentsByGrade(schoolId, grades)
        : undefined;

    return NextResponse.json({
      grades: formattedGrades,
      summary: {
        totalGrades: formattedGrades.length,
      },
      catalog: GRADE_CATALOG.map((grade) => ({ name: grade, cas: isPrimaryLevel(grade) })),
      customized: Boolean(schoolConfig?.gradesCustomized),
      ...(studentCounts ? { studentCounts } : {}),
    });
  } catch (error) {
    console.error("Error fetching grade structure:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    await connectDB();

    const { session, error: authError } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (authError) return authError;
    const schoolId = session.user.id;

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.grades)) {
      return NextResponse.json({ success: false, message: "Send the list of grades." }, { status: 400 });
    }

    const requested = body.grades.map((grade) => normalizeGradeValue(grade)).filter(Boolean);
    const unknown = requested.filter((grade) => !GRADE_CATALOG.includes(grade));
    if (unknown.length) {
      return NextResponse.json(
        { success: false, message: `${unknown.join(", ")} is not a grade Praavyo offers. Choose from Nursery, LKG, UKG and Grade 1–12.` },
        { status: 400 }
      );
    }
    const grades = sortGrades(requested);
    if (!grades.length) {
      return NextResponse.json({ success: false, message: "Keep at least one grade." }, { status: 400 });
    }

    const [school, config] = await Promise.all([
      User.findById(schoolId).select("schoolConfig").lean(),
      SchoolConfig.findOne({ school: schoolId }),
    ]);
    const current = await gradesFromRecords(school, config);
    const removed = current.filter((grade) => !grades.includes(grade));

    // Students are never moved or deleted by a grade change: a grade with
    // students on the roll stays until the school moves them.
    if (removed.length) {
      const counts = await countStudentsByGrade(schoolId, removed);
      const blocked = removed.filter((grade) => counts[grade] > 0).map((grade) => ({ grade, students: counts[grade] }));
      if (blocked.length) {
        const list = blocked.map((row) => `${row.grade} (${row.students} student${row.students === 1 ? "" : "s"})`).join(", ");
        return NextResponse.json(
          {
            success: false,
            code: "GRADE_HAS_STUDENTS",
            message: `${list} still ${blocked.length === 1 ? "has" : "have"} students. Promote, move or transfer them first, then remove the grade.`,
            data: { blocked },
          },
          { status: 409 }
        );
      }
    }

    await SchoolConfig.findOneAndUpdate(
      { school: schoolId },
      { $set: { grades, gradesCustomized: true }, $setOnInsert: { school: schoolId } },
      // strict: false — stored even by a process whose cached model predates
      // `gradesCustomized` (see packages/db/models/SchoolConfig.js).
      { upsert: true, new: true, strict: false }
    );

    // Say "saved" only when the database really holds it.
    const stored = await SchoolConfig.collection.findOne(
      { school: new mongoose.Types.ObjectId(String(schoolId)) },
      { projection: { grades: 1, gradesCustomized: 1 } }
    );
    if (!stored?.gradesCustomized || JSON.stringify(stored.grades || []) !== JSON.stringify(grades)) {
      console.error("Grade save did not persist", { schoolId, stored });
      return NextResponse.json(
        { success: false, message: "Grades could not be saved. Please try again." },
        { status: 500 }
      );
    }

    const added = grades.filter((grade) => !current.includes(grade));
    return NextResponse.json({
      success: true,
      message: "Grades saved. Every grade list in Praavyo now shows them.",
      data: { grades, added, removed },
    });
  } catch (error) {
    console.error("Error saving grade structure:", error);
    return NextResponse.json({ success: false, message: "Grades could not be saved." }, { status: 500 });
  }
}
