import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { receiveInquiry } from "@/lib/inquiryIntake";
import { errorResponse, internalServerError, successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST — a visitor (not signed in) sends a general inquiry or, while the
 * school's admission season is open, an admission application
 * (`type: "ADMISSION"`) from the school's public profile. Stored with source
 * PRAAVYO. Guards and validation live in lib/inquiryIntake.js, shared with the
 * school-website door (POST /api/v1/website/inquiries).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(404, "School not found.");
    }

    const body = await request.json().catch(() => null);
    await connectDB();
    const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const result = await receiveInquiry({ schoolId: id, body, source: "PRAAVYO", visitor });

    if (result.status === 201) return successResponse(201, result.message, result.data || {});
    return errorResponse(result.status, result.message, result.code);
  } catch (error) {
    console.error("POST /api/public/schools/[id]/inquiries error:", error);
    return internalServerError("Your inquiry could not be sent. Please try again.");
  }
}
