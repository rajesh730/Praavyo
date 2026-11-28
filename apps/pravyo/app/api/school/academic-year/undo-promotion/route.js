import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Student from "@/models/Student";
import AcademicYear from "@/models/AcademicYear";
import PromotionRun from "@/models/PromotionRun";
import CasExam from "@pravyo/db/models/cas/CasExam";
import CasAssessment from "@pravyo/db/models/cas/CasAssessment";
import InternalExam from "@pravyo/db/models/cas/InternalExam";
import { successResponse, errorResponse, internalServerError } from "@/lib/apiResponse";
import { requireApiSession, getSessionSchoolId } from "@/lib/authz";
import { stateFingerprint, studentState, undoBlocker, UNDO_WINDOW_DAYS } from "@/lib/promotionUndo";
import { gradeRank } from "@pravyo/core/gradeLevels";

export const dynamic = "force-dynamic";

/**
 * Undo the school's last "Promote year" (pressed by mistake, or too early).
 *
 * GET  — whether it can be undone, and why not when it cannot.
 * POST { confirm: true } — put every student back exactly as they were
 *      before the promotion, reopen the previous year and remove the new one.
 *
 * All-or-nothing: it is refused (nothing changes) when the new year already
 * has exams or assessments, when students were admitted into the new year,
 * or when any promoted student was changed afterwards — those cases are fixed
 * one student at a time (correct-promotion). See lib/promotionUndo.js.
 */

async function inspect(schoolId) {
  const run = await PromotionRun.findOne({ school: schoolId }).sort({ createdAt: -1 });
  if (!run) return { run: null, blocker: "There is no promotion to undo." };

  const [from, to] = await Promise.all([
    AcademicYear.findOne({ _id: run.fromYear.id, school: schoolId }).lean(),
    run.toYear.id ? AcademicYear.findOne({ _id: run.toYear.id, school: schoolId }).lean() : null,
  ]);

  let newYearRecords = 0;
  let admittedInNewYear = 0;
  if (to) {
    const ids = run.students.map((row) => row.student);
    const counts = await Promise.all([
      CasExam.countDocuments({ school: schoolId, academicYear: to._id }),
      InternalExam.countDocuments({ school: schoolId, academicYear: to._id }),
      CasAssessment.countDocuments({ school: schoolId, academicYear: to._id }),
      Student.countDocuments({
        school: schoolId,
        _id: { $nin: ids },
        enrollments: { $elemMatch: { school: schoolId, academicYearStart: to.yearStart } },
      }),
    ]);
    newYearRecords = counts[0] + counts[1] + counts[2];
    admittedInNewYear = counts[3];
  }

  let blocker = undoBlocker({ run, years: { from, to }, newYearRecords });
  if (!blocker && admittedInNewYear > 0) {
    blocker = `${admittedInNewYear} student${admittedInNewYear === 1 ? " was" : "s were"} admitted into the new year, so the whole promotion cannot be undone. Correct students one by one instead.`;
  }

  // Every promoted student must still be exactly as the promotion left them.
  const students = await Student.find({ _id: { $in: run.students.map((row) => row.student) }, school: schoolId });
  const byId = new Map(students.map((student) => [String(student._id), student]));
  const changed = run.students
    .filter((row) => {
      const student = byId.get(String(row.student));
      return !student || stateFingerprint(studentState(student)) !== row.afterFingerprint;
    })
    .map((row) => ({ id: String(row.student), name: row.name }));
  if (!blocker && changed.length) {
    blocker = `${changed.length} student${changed.length === 1 ? " was" : "s were"} changed after the promotion (${changed
      .slice(0, 5)
      .map((row) => row.name)
      .join(", ")}${changed.length > 5 ? ", …" : ""}). Correct students one by one instead, so their later changes are kept.`;
  }

  return { run, from, to, byId, changed, blocker };
}

function describe(run, from, blocker) {
  return {
    available: !blocker,
    blocker,
    windowDays: UNDO_WINDOW_DAYS,
    run: run
      ? {
          id: String(run._id),
          createdAt: run.createdAt,
          fromYear: from ? { year: from.year, yearStart: from.yearStart, calendar: from.calendar } : { year: run.fromYear.year },
          toYear: { year: run.toYear.year, yearStart: run.toYear.yearStart },
          summary: run.summary,
          status: run.status,
        }
      : null,
  };
}

export async function GET() {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;
    const schoolId = getSessionSchoolId(session);
    await connectDB();
    const { run, from, blocker } = await inspect(schoolId);
    return successResponse(200, "Undo status", describe(run, from, blocker));
  } catch (err) {
    console.error("GET undo-promotion error:", err);
    return internalServerError("Could not check the last promotion");
  }
}

export async function POST(req) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;
    const schoolId = getSessionSchoolId(session);
    const body = await req.json().catch(() => ({}));
    if (!body.confirm) return errorResponse(400, "Please confirm the undo.");

    await connectDB();
    const { run, from, to, byId, blocker } = await inspect(schoolId);
    if (blocker) return errorResponse(409, blocker, "UNDO_NOT_POSSIBLE");

    // Lowest grade first, so each grade is vacated before students return to it.
    const rows = [...run.students].sort(
      (a, b) => (gradeRank(a.before?.grade) ?? 99) - (gradeRank(b.before?.grade) ?? 99)
    );
    const failures = [];
    let restored = 0;
    for (const row of rows) {
      const student = byId.get(String(row.student));
      try {
        const before = row.before || {};
        student.grade = before.grade;
        student.section = before.section || "";
        student.rollNumber = before.rollNumber;
        student.status = before.status || "ACTIVE";
        student.statusChangedAt = before.statusChangedAt || undefined;
        student.statusChangedBy = before.statusChangedBy || undefined;
        student.statusReason = before.statusReason || undefined;
        student.enrollments = before.enrollments || [];
        await student.save();
        restored += 1;
      } catch (saveError) {
        failures.push({
          id: String(row.student),
          name: row.name,
          reason: saveError?.code === 11000 ? "Roll number already in use in that grade." : "Could not be restored.",
        });
      }
    }

    // The years: the new one goes (or closes, if it existed before the
    // promotion), then the previous one reopens with its old summary. In this
    // order, because a school can have only one ACTIVE year.
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        if (to) {
          if (run.toYear.created) await AcademicYear.deleteOne({ _id: to._id, school: schoolId }, { session: dbSession });
          else await AcademicYear.updateOne({ _id: to._id }, { $set: { status: "CLOSED", closedAt: new Date() } }, { session: dbSession });
        }
        await AcademicYear.updateOne(
          { _id: from._id, school: schoolId },
          { $set: { status: "ACTIVE", closedAt: null, closedBy: null, summary: run.fromYear.summaryBefore || {} } },
          { session: dbSession }
        );
      });
    } finally {
      await dbSession.endSession();
    }

    run.status = "UNDONE";
    run.undoneAt = new Date();
    run.undoneBy = session.user.id;
    run.undoSkipped = failures.map((row) => ({ student: row.id, name: row.name, reason: row.reason }));
    await run.save();

    return successResponse(
      200,
      failures.length
        ? `Promotion undone. ${restored} students restored; ${failures.length} need correcting one by one.`
        : `Promotion undone. ${restored} students are back where they were, and ${from.year} is the current year again.`,
      { restored, failures, currentYear: { year: from.year, yearStart: from.yearStart } }
    );
  } catch (err) {
    console.error("POST undo-promotion error:", err);
    return internalServerError("Could not undo the promotion");
  }
}
