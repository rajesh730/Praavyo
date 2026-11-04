import connectDB from "@/lib/db";
import { successResponse, errorResponse, internalServerError } from "@/lib/apiResponse";
import { requireApiSession } from "@/lib/authz";
import { getStudentTransferData } from "@/lib/studentTransfers";

/**
 * Transfers are handled by the student's parent or guardian (parent app →
 * Transfer), not by the student. This route only reports the status, for
 * anything that still reads it; it no longer starts or changes a transfer.
 */
export async function GET() {
  try {
    const { session, error } = await requireApiSession(["STUDENT"]);
    if (error) return error;
    await connectDB();
    const data = await getStudentTransferData(session.user.id);
    if (!data) return errorResponse(404, "Student record not found.");
    return successResponse(200, "Transfer status loaded", { ...data, schools: [] });
  } catch (err) {
    console.error("GET /api/student/transfer error:", err);
    return internalServerError("Failed to load transfer status");
  }
}

const PARENT_ONLY = "A transfer is requested by your parent or guardian in the parent app.";

export async function POST() {
  return errorResponse(403, PARENT_ONLY);
}

export async function PATCH() {
  return errorResponse(403, PARENT_ONLY);
}
