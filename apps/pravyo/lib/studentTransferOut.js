import mongoose from "mongoose";
import Student from "@/models/Student";
import StudentTransfer from "@/models/StudentTransfer";
import AcademicYear from "@/models/AcademicYear";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import ParentStudentLink, { applyAccessLevelDefaults } from "@/models/ParentStudentLink";
import User from "@/models/User";
import { closeCurrentEnrollments, ensureActiveAcademicYear, makeEnrollmentEntry } from "@/lib/studentEnrollment";
import { OPEN_TRANSFER_STATUSES } from "@/lib/studentTransfers";
import { normalizeIemisNumber, isValidIemisNumber } from "@/lib/iemis";
import { OFF_ROSTER_STATUSES } from "@pravyo/db/studentStatus";

/**
 * Transfer out: a student moves to a school that is NOT on Praavyo.
 *
 * Schools on Praavyo move students with the transfer flow (the family asks,
 * the old school releases, the new school admits). Most schools are not on
 * Praavyo yet, so the school admin can also record the move themselves:
 *
 *   - the student becomes TRANSFERRED_OUT: off the roster, out of class lists,
 *     exams, notices and sign-in, and the school can no longer edit them;
 *   - their current enrollment closes as TRANSFERRED (roll number freed);
 *   - their writing leaves the school wall (portfolio stays), as in a transfer;
 *   - guardians keep read-only access to the child's history, but the school
 *     can no longer send them notices, messages, events or consent requests
 *     about this child;
 *   - a COMPLETED StudentTransfer records where they went, for the school's
 *     Student Transfer history (with both schools' IEMIS numbers).
 *
 * Nothing is deleted: results, writing, certificates and enrollment history
 * stay with the student. `undoTransferOut` reverses a mistake.
 */

export class TransferOutError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);

/** What the guardian may still do for a child who has left: look, not interact. */
const LEFT_SCHOOL_PERMISSIONS = {
  canViewPortfolio: true,
  canReceiveNotices: false,
  canRegisterEvents: false,
  canGiveConsent: false,
  canMessageSchool: false,
};

export function parseTransferOutInput(body = {}) {
  const toSchoolName = clean(body.toSchoolName);
  if (!toSchoolName) throw new TransferOutError(400, "Enter the name of the school the student is moving to.");
  const toSchoolIemisNumber = normalizeIemisNumber(body.toSchoolIemisNumber);
  if (toSchoolIemisNumber && !isValidIemisNumber(toSchoolIemisNumber)) {
    throw new TransferOutError(400, "The new school's IEMIS number may contain letters, numbers and hyphens only.");
  }
  let transferredAt = new Date();
  if (body.transferDate) {
    transferredAt = new Date(body.transferDate);
    if (Number.isNaN(transferredAt.getTime())) throw new TransferOutError(400, "Choose a valid transfer date.");
    if (transferredAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new TransferOutError(400, "The transfer date cannot be in the future.");
    }
  }
  return {
    toSchoolName,
    toSchoolIemisNumber,
    toSchoolAddress: clean(body.toSchoolAddress),
    certificateNumber: clean(body.certificateNumber, 60),
    reason: clean(body.reason, 500),
    transferredAt,
  };
}

/** Record that a student moved to a school outside Praavyo. School admin only. */
export async function transferStudentOut({ studentId, schoolId, actorId, input }) {
  const data = parseTransferOutInput(input);
  const student = await Student.findOne({ _id: studentId, school: schoolId, isDeleted: { $ne: true } });
  if (!student) throw new TransferOutError(404, "Student not found.");
  if (OFF_ROSTER_STATUSES.includes(student.status)) {
    throw new TransferOutError(409, "This student is no longer on your roster.");
  }
  const open = await StudentTransfer.exists({ student: student._id, status: { $in: OPEN_TRANSFER_STATUSES } });
  if (open) {
    throw new TransferOutError(409, "This student has a transfer request in progress. Finish or cancel it in Student Transfer first.");
  }

  const [school, year] = await Promise.all([
    User.findById(schoolId).select("schoolName name").lean(),
    ensureActiveAcademicYear(schoolId),
  ]);

  const transfer = new StudentTransfer({
    student: student._id,
    platformStudentId: student.platformStudentId || "",
    fromSchool: schoolId,
    toSchool: null,
    externalSchool: { name: data.toSchoolName, address: data.toSchoolAddress },
    toSchoolIemisNumber: data.toSchoolIemisNumber,
    certificateNumber: data.certificateNumber,
    status: "COMPLETED",
    reason: data.reason,
    studentNameSnapshot: student.name || "",
    fromSchoolNameSnapshot: school?.schoolName || school?.name || "",
    toGrade: student.grade || "",
    releasedBy: actorId,
    releasedAt: data.transferredAt,
    decidedBy: actorId,
    decidedAt: data.transferredAt,
  });

  closeCurrentEnrollments(student, "TRANSFERRED", data.transferredAt);
  student.status = "TRANSFERRED_OUT";
  student.statusChangedAt = new Date();
  student.statusChangedBy = actorId;
  student.statusReason = `Transferred to ${data.toSchoolName}`;
  student.transferOut = {
    toSchoolName: data.toSchoolName,
    toSchoolIemisNumber: data.toSchoolIemisNumber,
    toSchoolAddress: data.toSchoolAddress,
    transferredAt: data.transferredAt,
    certificateNumber: data.certificateNumber,
    reason: data.reason,
    transfer: transfer._id,
  };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await student.save({ session });
      await transfer.save({ session });
      // As in a transfer between Praavyo schools: off the school's walls,
      // still in the student's own portfolio.
      await SchoolMagazineArticle.updateMany(
        { authorStudent: student._id, school: schoolId, isDeleted: { $ne: true } },
        { $set: { showOnSchoolWall: false, isGlobalWallPublished: false } },
        { session }
      );
      await ParentStudentLink.updateMany(
        { student: student._id, status: "ACTIVE" },
        { $set: LEFT_SCHOOL_PERMISSIONS },
        { session }
      );
      if (year?._id) {
        await AcademicYear.updateOne({ _id: year._id }, { $inc: { "summary.transferredOut": 1 } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return { student, transfer };
}

/**
 * Undo a transfer out recorded by mistake: the student is back on the roster
 * in the same grade, and the guardians' permissions return to their access
 * level's defaults. The transfer record is kept, marked CANCELLED.
 */
export async function undoTransferOut({ studentId, schoolId, actorId }) {
  const student = await Student.findOne({ _id: studentId, school: schoolId, isDeleted: { $ne: true } });
  if (!student) throw new TransferOutError(404, "Student not found.");
  if (student.status !== "TRANSFERRED_OUT") {
    throw new TransferOutError(409, "This student was not transferred out.");
  }
  const rollTaken = student.rollNumber && await Student.exists({
    _id: { $ne: student._id },
    school: schoolId,
    grade: student.grade,
    rollNumber: student.rollNumber,
    status: "ACTIVE",
    isDeleted: { $ne: true },
  });
  if (rollTaken) {
    throw new TransferOutError(409, `Roll number ${student.rollNumber} in ${student.grade} is now used by another student. Change that first.`);
  }

  const [school, year, links] = await Promise.all([
    User.findById(schoolId).select("schoolName name").lean(),
    ensureActiveAcademicYear(schoolId),
    ParentStudentLink.find({ student: student._id, status: "ACTIVE" }),
  ]);
  const transferId = student.transferOut?.transfer || null;
  const transferredAt = student.transferOut?.transferredAt ? new Date(student.transferOut.transferredAt).getTime() : null;

  // Reopen the enrollment the transfer closed, so the history does not show
  // a move that never happened; add a fresh one only if it cannot be found.
  const closed = [...(student.enrollments || [])].reverse().find((entry) =>
    entry.status === "TRANSFERRED"
    && String(entry.school) === String(schoolId)
    && transferredAt !== null
    && entry.endedAt && new Date(entry.endedAt).getTime() === transferredAt);
  if (closed) {
    closed.status = "CURRENT";
    closed.endedAt = null;
  } else {
    student.enrollments.push(makeEnrollmentEntry({
      school: schoolId,
      schoolName: school?.schoolName || school?.name || "",
      grade: student.grade,
      rollNumber: student.rollNumber,
      section: student.section || "",
      academicYear: year,
    }));
  }
  student.status = "ACTIVE";
  student.statusChangedAt = new Date();
  student.statusChangedBy = actorId;
  student.statusReason = "Transfer out undone";
  student.transferOut = undefined;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await student.save({ session });
      for (const link of links) {
        applyAccessLevelDefaults(link);
        await link.save({ session });
      }
      if (transferId) {
        await StudentTransfer.updateOne(
          { _id: transferId, status: "COMPLETED" },
          { $set: { status: "CANCELLED", decisionReason: "Transfer out undone by the school", decidedBy: actorId, decidedAt: new Date() } },
          { session }
        );
      }
      if (year?._id) {
        await AcademicYear.updateOne({ _id: year._id }, { $inc: { "summary.transferredOut": -1 } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return { student };
}
