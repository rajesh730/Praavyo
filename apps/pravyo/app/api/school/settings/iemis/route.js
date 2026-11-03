import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import SchoolConfig from "@/models/SchoolConfig";
import { checkSchoolIemis } from "@/lib/iemisRegistry";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

/**
 * The school's IEMIS registration number on its own, for the reminder that
 * schools registered before it became compulsory see on their dashboard.
 * Same rules as registration and Settings: compulsory, unique across schools.
 */
export async function GET() {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;
    await connectDB();
    const config = await SchoolConfig.findOne({ school: session.user.id }).select("iemisNumber").lean();
    return successResponse(200, "IEMIS number", { iemisNumber: config?.iemisNumber || "" });
  } catch (err) {
    console.error("GET /api/school/settings/iemis error:", err);
    return errorResponse(500, "Failed to load the IEMIS number.");
  }
}

export async function PATCH(request) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;
    const body = await request.json().catch(() => ({}));
    await connectDB();
    const { iemisNumber, error: iemisError } = await checkSchoolIemis(body.iemisNumber, { exceptSchool: session.user.id });
    if (iemisError) return validationError(iemisError);
    const config = await SchoolConfig.findOneAndUpdate(
      { school: session.user.id },
      { $set: { iemisNumber } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return successResponse(200, "IEMIS number saved", { iemisNumber: config.iemisNumber });
  } catch (err) {
    console.error("PATCH /api/school/settings/iemis error:", err);
    return errorResponse(500, "Failed to save the IEMIS number.");
  }
}
