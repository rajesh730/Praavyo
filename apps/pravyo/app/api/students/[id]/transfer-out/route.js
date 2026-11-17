import connectDB from "@/lib/db";
import { requireApiSession, getSessionSchoolId } from "@/lib/authz";
import { successResponse, errorResponse, internalServerError } from "@/lib/apiResponse";
import { logActivity } from "@/lib/activityLog";
import { transferStudentOut, undoTransferOut, TransferOutError } from "@/lib/studentTransferOut";

export const dynamic = "force-dynamic";

/**
 * Transfer out: the student moved to a school that is not on Praavyo.
 *
 *   POST   record the move   { toSchoolName, toSchoolIemisNumber?, toSchoolAddress?,
 *                              transferDate?, certificateNumber?, reason? }
 *   DELETE undo a move recorded by mistake
 *
 * School admin only, for the school's own students. The rules live in
 * lib/studentTransferOut.js.
 */
async function guard(params) {
  const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
  if (error) return { error };
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(String(id || ""))) return { error: errorResponse(400, "Invalid student") };
  await connectDB();
  return { session, id, schoolId: getSessionSchoolId(session) };
}

function failure(err, label) {
  if (err instanceof TransferOutError) return errorResponse(err.status, err.message);
  console.error(`${label} error:`, err);
  return internalServerError("Could not update the transfer. Please try again.");
}

export async function POST(request, { params }) {
  const ctx = await guard(params);
  if (ctx.error) return ctx.error;
  try {
    const input = await request.json().catch(() => ({}));
    const { student, transfer } = await transferStudentOut({
      studentId: ctx.id, schoolId: ctx.schoolId, actorId: ctx.session.user.id, input,
    });
    await logActivity({
      action: "UPDATE", targetType: "Student", targetId: student._id, targetName: student.name,
      performedBy: ctx.session.user.id, school: ctx.schoolId,
      changes: { before: { status: "ACTIVE" }, after: { status: "TRANSFERRED_OUT" } },
      details: { transferredTo: student.transferOut?.toSchoolName, transfer: String(transfer._id) },
    }).catch(() => {});
    return successResponse(200, `${student.name} was transferred out to ${student.transferOut?.toSchoolName}.`, {
      student: { _id: student._id, name: student.name, status: student.status, transferOut: student.transferOut },
    });
  } catch (err) {
    return failure(err, "POST /api/students/[id]/transfer-out");
  }
}

export async function DELETE(request, { params }) {
  const ctx = await guard(params);
  if (ctx.error) return ctx.error;
  try {
    const { student } = await undoTransferOut({
      studentId: ctx.id, schoolId: ctx.schoolId, actorId: ctx.session.user.id,
    });
    await logActivity({
      action: "UPDATE", targetType: "Student", targetId: student._id, targetName: student.name,
      performedBy: ctx.session.user.id, school: ctx.schoolId,
      changes: { before: { status: "TRANSFERRED_OUT" }, after: { status: "ACTIVE" } },
      details: { reason: "Transfer out undone" },
    }).catch(() => {});
    return successResponse(200, `${student.name} is back on your roster.`, {
      student: { _id: student._id, name: student.name, status: student.status },
    });
  } catch (err) {
    return failure(err, "DELETE /api/students/[id]/transfer-out");
  }
}
