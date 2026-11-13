import Student from "@/models/Student";
import StudentTransfer from "@/models/StudentTransfer";
import User from "@/models/User";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { notifyReleaseRequested, notifyAdmissionRequested } from "@/lib/transferNotifications";

/**
 * The family side of a student transfer. A PARENT (guardian) drives it:
 *
 *   1. Ask the current school to release the child   → PENDING_RELEASE
 *   2. The school approves and issues a code          → RELEASED
 *   3. The parent chooses the new school              → PENDING_ADMISSION
 *   4. The new school admits (grade + roll)           → COMPLETED
 *
 * Either school can decline; the new school declining sends it back to step 3.
 * The school-side actions live in app/api/students/transfer/[id].
 */

export const OPEN_TRANSFER_STATUSES = ["PENDING", "PENDING_RELEASE", "RELEASED", "PENDING_ADMISSION"];

function serializeSchool(school) {
  if (!school) return null;
  return {
    id: String(school._id || school.id),
    name: school.schoolName || school.name || "School",
    location: school.schoolLocation || "",
    province: school.province || "",
    district: school.district || "",
  };
}

function serializeTransfer(transfer) {
  if (!transfer) return null;
  return {
    id: String(transfer._id),
    status: transfer.status,
    transferCode: transfer.transferCode || "",
    reason: transfer.reason || "",
    toGrade: transfer.toGrade || "",
    toRollNumber: transfer.toRollNumber || "",
    requestedAt: transfer.createdAt,
    releasedAt: transfer.releasedAt,
    targetSelectedAt: transfer.targetSelectedAt,
    decidedAt: transfer.decidedAt,
    decisionReason: transfer.decisionReason || "",
    fromSchool: serializeSchool(transfer.fromSchool) || (transfer.fromSchoolNameSnapshot ? { id: "", name: transfer.fromSchoolNameSnapshot } : null),
    toSchool: serializeSchool(transfer.toSchool),
  };
}

/** Everything the family needs to see for one child. */
export async function getStudentTransferData(studentId) {
  const [student, transfer, history] = await Promise.all([
    Student.findById(studentId)
      .select("name grade rollNumber platformStudentId school")
      .populate("school", "schoolName name schoolLocation")
      .lean(),
    StudentTransfer.findOne({ student: studentId, status: { $in: OPEN_TRANSFER_STATUSES } })
      .sort({ createdAt: -1 })
      .populate("fromSchool", "schoolName name schoolLocation")
      .populate("toSchool", "schoolName name schoolLocation")
      .lean(),
    StudentTransfer.find({ student: studentId, status: { $nin: OPEN_TRANSFER_STATUSES } })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate("fromSchool", "schoolName name")
      .populate("toSchool", "schoolName name")
      .lean(),
  ]);
  if (!student) return null;

  // The school list is only needed while choosing the new school.
  let schools = [];
  if (transfer?.status === "RELEASED") {
    const rows = await User.find({
      role: "SCHOOL_ADMIN",
      status: { $in: ["APPROVED", "SUBSCRIBED"] },
      _id: { $ne: student.school?._id || student.school },
    })
      .select("schoolName name schoolLocation province district")
      .sort({ schoolName: 1, name: 1 })
      .limit(1000)
      .lean();
    const profiles = await SchoolShowcaseProfile.find({ school: { $in: rows.map((row) => row._id) } })
      .select("school logoUrl coverImageUrl")
      .lean();
    const logoBySchool = new Map(
      profiles.map((profile) => [String(profile.school), profile.logoUrl || profile.coverImageUrl || ""])
    );
    schools = rows.map((row) => ({ ...serializeSchool(row), logoUrl: logoBySchool.get(String(row._id)) || "" }));
  }

  return {
    student: {
      id: String(student._id),
      name: student.name,
      grade: student.grade,
      rollNumber: student.rollNumber,
      platformStudentId: student.platformStudentId,
      currentSchool: serializeSchool(student.school),
    },
    transfer: serializeTransfer(transfer),
    history: history.map(serializeTransfer),
    schools,
  };
}

export class TransferError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Step 1: ask the current school to release the child. */
export async function requestRelease({ studentId, reason = "", parentId = null }) {
  const student = await Student.findOne({ _id: studentId, isDeleted: { $ne: true }, status: "ACTIVE" })
    .select("name platformStudentId school")
    .populate("school", "schoolName name");
  if (!student) throw new TransferError(404, "This child is not an active student, so a transfer cannot be started.");

  const existing = await StudentTransfer.findOne({ student: student._id, status: { $in: OPEN_TRANSFER_STATUSES } }).select("_id");
  if (existing) throw new TransferError(409, "There is already a transfer in progress for this child.");

  try {
    const created = await StudentTransfer.create({
      student: student._id,
      platformStudentId: student.platformStudentId || "",
      fromSchool: student.school?._id || student.school,
      requestedByParent: parentId,
      status: "PENDING_RELEASE",
      studentNameSnapshot: student.name || "",
      fromSchoolNameSnapshot: student.school?.schoolName || student.school?.name || "",
      reason: String(reason || "").trim().slice(0, 500),
    });
    await notifyReleaseRequested({ transfer: created });
    return created;
  } catch (error) {
    if (error?.code === 11000) throw new TransferError(409, "There is already a transfer in progress for this child.");
    throw error;
  }
}

async function findOpenTransfer(studentId) {
  const transfer = await StudentTransfer.findOne({ student: studentId, status: { $in: OPEN_TRANSFER_STATUSES } });
  if (!transfer) throw new TransferError(404, "There is no transfer in progress for this child.");
  return transfer;
}

/** Step 3: choose the school the child is joining. */
export async function chooseNewSchool({ studentId, toSchool }) {
  const transfer = await findOpenTransfer(studentId);
  if (transfer.status !== "RELEASED") {
    throw new TransferError(409, "The current school must approve the release before you choose the new school.");
  }
  const school = await User.findOne({
    _id: String(toSchool || ""),
    role: "SCHOOL_ADMIN",
    status: { $in: ["APPROVED", "SUBSCRIBED"] },
  }).select("_id");
  if (!school) throw new TransferError(404, "That school is not available. Choose another one.");
  if (String(school._id) === String(transfer.fromSchool)) throw new TransferError(400, "Choose a different school from the current one.");

  transfer.toSchool = school._id;
  transfer.status = "PENDING_ADMISSION";
  transfer.targetSelectedAt = new Date();
  await transfer.save();
  await notifyAdmissionRequested({ transfer });
  return transfer;
}

/** Stop the transfer at any point before the new school admits the child. */
export async function cancelTransfer({ studentId, by = "parent" }) {
  const transfer = await findOpenTransfer(studentId);
  transfer.status = "CANCELLED";
  transfer.decidedAt = new Date();
  transfer.decisionReason = `Cancelled by ${by}`;
  await transfer.save();
  return transfer;
}
