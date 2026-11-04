import { successResponse, errorResponse, internalServerError } from "@/lib/apiResponse";
import { requireParentChild } from "@/lib/parentAccess";
import {
  TransferError,
  cancelTransfer,
  chooseNewSchool,
  getStudentTransferData,
  requestRelease,
} from "@/lib/studentTransfers";

export const dynamic = "force-dynamic";

/**
 * A guardian manages their child's school transfer.
 *   GET    ?studentId=                           status, history, (school list)
 *   POST   { studentId, reason }                 ask the current school to release
 *   PATCH  { studentId, action: "choose_school", toSchool }
 *          { studentId, action: "cancel" }
 */
async function withChild(studentId) {
  const access = await requireParentChild(studentId);
  if (access.error) return { error: access.error };
  return access;
}

function fail(error, fallback) {
  if (error instanceof TransferError) return errorResponse(error.status, error.message);
  console.error(fallback, error);
  return internalServerError(fallback);
}

export async function GET(request) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId");
    const access = await withChild(studentId);
    if (access.error) return access.error;
    const data = await getStudentTransferData(access.student._id);
    if (!data) return errorResponse(404, "Student record not found.");
    return successResponse(200, "Transfer loaded", data);
  } catch (error) {
    return fail(error, "Failed to load the transfer");
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const access = await withChild(body.studentId);
    if (access.error) return access.error;
    await requestRelease({ studentId: access.student._id, reason: body.reason, parentId: access.parent?._id || null });
    const data = await getStudentTransferData(access.student._id);
    return successResponse(201, "Request sent. The current school will review it.", data);
  } catch (error) {
    return fail(error, "Failed to request the transfer");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const access = await withChild(body.studentId);
    if (access.error) return access.error;
    const action = String(body.action || "").toLowerCase();

    let message;
    if (action === "choose_school") {
      await chooseNewSchool({ studentId: access.student._id, toSchool: body.toSchool });
      message = "Request sent to the new school. They will admit your child.";
    } else if (action === "cancel") {
      await cancelTransfer({ studentId: access.student._id, by: "parent" });
      message = "Transfer cancelled.";
    } else {
      return errorResponse(400, "Unknown action.");
    }
    const data = await getStudentTransferData(access.student._id);
    return successResponse(200, message, data);
  } catch (error) {
    return fail(error, "Failed to update the transfer");
  }
}
